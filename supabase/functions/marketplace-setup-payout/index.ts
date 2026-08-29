// ==========================================================================
// BOARDLY - marketplace-setup-payout Edge Function
// Deploy with:  supabase functions deploy marketplace-setup-payout
// Needs one secret set first (free Paystack account, no card needed to
// start in Test Mode):
//   supabase secrets set PAYSTACK_SECRET_KEY=sk_test_... (or sk_live_...)
// Full walkthrough in MARKETPLACE_PAYMENTS_SETUP.md.
//
// This is the ONLY place PAYSTACK_SECRET_KEY is ever used to look
// something up on Paystack's side for the SIGNED-IN provider (the
// person running their own Boardly - see marketplace-create-booking,
// marketplace-payment-webhook, marketplace-release-payment, and
// marketplace-booking-status for the client-facing half, which never
// has a Boardly login at all).
//
// Two things this does, picked by body.action:
//   "list_banks"  -> returns Paystack's own list of Nigerian banks and
//                    their codes, so the browser can show a dropdown
//                    without hardcoding a list that goes stale.
//   "save_payout" -> takes a bank code + account number, asks Paystack
//                    to resolve it to a real account name (proves the
//                    number is real and lets the provider confirm it's
//                    actually THEIR account before saving), creates a
//                    Paystack "transfer recipient" for it, and saves
//                    the result - the actual writes go through the
//                    CALLER's own token, not a service-role bypass,
//                    because schema_v33's RLS already lets an owner
//                    write their own payout row and their own profile's
//                    accepts_bookings flag. This function only ever
//                    needs the service role for nothing at all - it's
//                    here purely because the Paystack secret key can't
//                    reach the browser.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!paystackKey) {
    return json({ error: "PAYSTACK_SECRET_KEY isn't set yet - see MARKETPLACE_PAYMENTS_SETUP.md" }, 500);
  }

  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth token" }, 401);

  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) return json({ error: "Could not verify who you are - try logging in again." }, 401);

  let action: string, bankCode: string, accountNumber: string;
  try {
    const body = await request.json();
    action = String(body.action || "");
    bankCode = String(body.bankCode || "");
    accountNumber = String(body.accountNumber || "").trim();
  } catch {
    return json({ error: "Bad request body" }, 400);
  }

  if (action === "list_banks") {
    const res = await fetch("https://api.paystack.co/bank?currency=NGN&country=nigeria", {
      headers: { authorization: `Bearer ${paystackKey}` },
    });
    const data = await res.json();
    if (!res.ok || !data.status) return json({ error: data.message || "Couldn't reach Paystack" }, 502);
    const banks = (data.data || []).map((b: any) => ({ name: b.name, code: b.code }));
    return json({ banks });
  }

  if (action === "save_payout") {
    if (!bankCode || !accountNumber) return json({ error: "Bank and account number are both required" }, 400);

    // Step 1: resolve the account number - this is the "proof of life"
    // check. If the number doesn't match a real account at that bank,
    // Paystack's response itself says so and nothing gets saved.
    const resolveRes = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
      { headers: { authorization: `Bearer ${paystackKey}` } }
    );
    const resolveData = await resolveRes.json();
    if (!resolveRes.ok || !resolveData.status) {
      return json({ error: resolveData.message || "Couldn't verify that account number - double check it and try again." }, 400);
    }
    const accountName: string = resolveData.data.account_name;

    // Step 2: create (or Paystack will just return the existing one for
    // an identical name+number+bank combo) a transfer recipient - this
    // is the id release-payment will send money TO later.
    const recipientRes = await fetch("https://api.paystack.co/transferrecipient", {
      method: "POST",
      headers: { authorization: `Bearer ${paystackKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        type: "nuban",
        name: accountName,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: "NGN",
      }),
    });
    const recipientData = await recipientRes.json();
    if (!recipientRes.ok || !recipientData.status) {
      return json({ error: recipientData.message || "Paystack couldn't set up payouts for that account" }, 502);
    }
    const recipientCode: string = recipientData.data.recipient_code;

    // Step 3: save - through the CALLER's own token, so this is exactly
    // as privileged as the provider clicking "save" anywhere else in
    // Boardly, nothing more.
    const { error: upsertError } = await callerClient.from("marketplace_provider_payouts").upsert(
      {
        user_id: user.id,
        bank_code: bankCode,
        account_number: accountNumber,
        account_name: accountName,
        paystack_recipient_code: recipientCode,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (upsertError) return json({ error: "Verified with Paystack, but saving failed: " + upsertError.message }, 500);

    const { error: profileError } = await callerClient
      .from("marketplace_profiles")
      .update({ accepts_bookings: true })
      .eq("user_id", user.id);
    // Not fatal if this second update fails (e.g. no profile row created
    // yet) - the payout details are still saved either way, and saving
    // a profile afterwards will just need payout setup run once more.
    if (profileError) console.warn("marketplace-setup-payout: couldn't flag accepts_bookings:", profileError.message);

    return json({ accountName, ok: true });
  }

  return json({ error: "Unknown action - expected 'list_banks' or 'save_payout'" }, 400);
});
