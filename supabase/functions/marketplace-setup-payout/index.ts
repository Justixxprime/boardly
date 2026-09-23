// ==========================================================================
// BOARDLY - marketplace-setup-payout Edge Function
// Deploy with:  supabase functions deploy marketplace-setup-payout
// Needs one secret set first (free Squad sandbox account, no registered
// business needed, that is exactly why Justice picked Squad over
// Paystack for this):
//   supabase secrets set SQUAD_SECRET_KEY=sandbox_sk_... (or sk_... live)
// Full walkthrough in MARKETPLACE_PAYMENTS_SETUP.md.
//
// Switched from Paystack to Squad on 22 Sep 2026. Squad's payout side
// (docs.squadco.com, Transfer API) works differently to Paystack's:
// there is no separate "create a transfer recipient" step and no
// recipient code to store. You look an account up once to prove it is
// real, then send money to that same bank code + account number +
// account name again every time you pay out, no ID in between. So
// "save_payout" below is now simpler than it used to be.
//
// Two things this does, picked by body.action:
//   "list_banks"  -> Squad has no bank-list API, so this returns a
//                    fixed list of Nigeria's major banks and popular
//                    fintech wallets (Opay, PalmPay, Moniepoint, Kuda),
//                    codes taken straight from Squad's own
//                    documentation. If a bank a provider needs is
//                    missing, add its NIP code here, this list is not
//                    read from anywhere else.
//   "save_payout" -> takes a bank code + account number, asks Squad's
//                    account lookup to resolve it to a real account
//                    name (proves the number is real and lets the
//                    provider confirm it's actually THEIR account
//                    before saving), then saves bank code, account
//                    number and the looked-up name - the actual writes
//                    go through the CALLER's own token, not a
//                    service-role bypass, because schema_v33's RLS
//                    already lets an owner write their own payout row
//                    and their own profile's accepts_bookings flag.
//                    This function only ever needs the service role
//                    for nothing at all - it's here purely because the
//                    Squad secret key can't reach the browser.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

function squadBaseUrl(secretKey: string): string {
  return secretKey.startsWith("sandbox_sk_") ? "https://sandbox-api-d.squadco.com" : "https://api-d.squadco.com";
}

// Nigeria's major commercial banks plus the fintech wallets freelancers
// actually get paid into day to day, NIP codes copied from Squad's own
// Transfer API documentation (docs.squadco.com). Not the full 300+ bank
// and microfinance list Squad supports, just the common ones, add more
// below if a specific provider needs one.
const BANKS = [
  { name: "Access Bank", code: "000014" },
  { name: "Citi Bank", code: "000009" },
  { name: "Ecobank Bank", code: "000010" },
  { name: "Fidelity Bank", code: "000007" },
  { name: "First Bank of Nigeria", code: "000016" },
  { name: "First City Monument Bank (FCMB)", code: "000003" },
  { name: "Globus Bank", code: "000027" },
  { name: "GTBank Plc", code: "000013" },
  { name: "Heritage Bank", code: "000020" },
  { name: "Jaiz Bank", code: "000006" },
  { name: "Keystone Bank", code: "000002" },
  { name: "Lotus Bank", code: "000029" },
  { name: "Optimus Bank", code: "000036" },
  { name: "Polaris Bank", code: "000008" },
  { name: "Premium Trust Bank", code: "000031" },
  { name: "Providus Bank", code: "000023" },
  { name: "Stanbic IBTC Bank", code: "000012" },
  { name: "Standard Chartered Bank", code: "000021" },
  { name: "Sterling Bank", code: "000001" },
  { name: "Suntrust Bank", code: "000022" },
  { name: "Taj Bank", code: "000026" },
  { name: "Titan Trust Bank", code: "000025" },
  { name: "Union Bank", code: "000018" },
  { name: "United Bank for Africa (UBA)", code: "000004" },
  { name: "Unity Bank", code: "000011" },
  { name: "Wema Bank", code: "000017" },
  { name: "Zenith Bank Plc", code: "000015" },
  // Fintech wallets, everyday choices for freelancers
  { name: "Kuda Microfinance Bank", code: "090267" },
  { name: "Moniepoint (formerly Moniepoint MFB)", code: "090405" },
  { name: "Opay Digital Services", code: "100004" },
  { name: "PalmPay Limited", code: "100033" },
  { name: "FairMoney Microfinance Bank", code: "090551" },
  { name: "VFD Microfinance Bank", code: "090110" },
];

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const squadKey = Deno.env.get("SQUAD_SECRET_KEY");
  if (!squadKey) {
    return json({ error: "SQUAD_SECRET_KEY isn't set yet - see MARKETPLACE_PAYMENTS_SETUP.md" }, 500);
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
    return json({ banks: BANKS });
  }

  if (action === "save_payout") {
    if (!bankCode || !accountNumber) return json({ error: "Bank and account number are both required" }, 400);

    // Step 1: look the account up - this is the "proof of life" check.
    // If the number doesn't match a real account at that bank, Squad's
    // response itself says so and nothing gets saved. Squad does a live
    // lookup even in sandbox, so a made-up account number is genuinely
    // rejected, not just accepted for testing's sake.
    const lookupRes = await fetch(`${squadBaseUrl(squadKey)}/payout/account/lookup`, {
      method: "POST",
      headers: { authorization: `Bearer ${squadKey}`, "content-type": "application/json" },
      body: JSON.stringify({ bank_code: bankCode, account_number: accountNumber }),
    });
    const lookupData = await lookupRes.json();
    if (!lookupRes.ok || lookupData.status !== 200 || !lookupData.data?.account_name) {
      return json({ error: lookupData.message || "Couldn't verify that account number - double check it and try again." }, 400);
    }
    const accountName: string = lookupData.data.account_name;

    // Step 2: save - through the CALLER's own token, so this is exactly
    // as privileged as the provider clicking "save" anywhere else in
    // Boardly, nothing more. No recipient code to store with Squad,
    // release-payment sends the bank code, account number and this same
    // looked-up name again at transfer time.
    const { error: upsertError } = await callerClient.from("marketplace_provider_payouts").upsert(
      {
        user_id: user.id,
        bank_code: bankCode,
        account_number: accountNumber,
        account_name: accountName,
        provider: "squad",
        paystack_recipient_code: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (upsertError) return json({ error: "Verified with Squad, but saving failed: " + upsertError.message }, 500);

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
