// ==========================================================================
// BOARDLY 2.0: marketplace-verify-payment Edge Function
// Deploy with:  supabase functions deploy marketplace-verify-payment --no-verify-jwt
//
// Charles reported a booking stuck on "Still confirming your payment"
// forever, even though the payment provider itself already shows the
// charge as successful. payment-webhook (the combined router) and
// marketplace-payment-webhook (its standalone predecessor) both contain
// correct logic to move a booking from pending_payment to paid_held,
// but the provider only calls ONE webhook URL for the whole account, so
// if that URL is ever wrong, unreachable, or simply never configured,
// no webhook fires and a booking can sit pending forever no matter how
// correct the webhook code itself is. Waiting on a webhook with no
// fallback is fragile by nature, this closes that gap completely,
// independent of whatever the webhook misconfiguration turns out to
// be: instead of only waiting to be told, this ASKS the provider
// directly, the same source of truth the webhook itself trusts, and
// applies the exact same status-and-amount-check logic if the provider
// confirms success. booking-status.html calls this itself after
// polling for a while with no change, so a client is never stuck
// staring at "still confirming" with no way out.
//
// SWITCHED TO SQUAD on 22 Sep 2026: asks Squad's own
// /transaction/verify/{ref} instead of Paystack's equivalent.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

function squadBaseUrl(secretKey: string): string {
  return secretKey.startsWith("sandbox_sk_") ? "https://sandbox-api-d.squadco.com" : "https://api-d.squadco.com";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  let bookingId: string;
  let accessToken: string;
  try {
    const body = await request.json();
    bookingId = String(body.bookingId || "");
    accessToken = String(body.accessToken || "");
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!bookingId || !accessToken) return json({ error: "Missing booking id or token" }, 400);

  const squadKey = Deno.env.get("SQUAD_SECRET_KEY");
  if (!squadKey) return json({ error: "Payments aren't configured yet." }, 500);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Same "id AND token must both match" check every other booking-status
  // function in this codebase uses, this is a public endpoint with no
  // Supabase login, the token is what proves the caller is allowed to
  // ask about this specific booking.
  const { data: booking, error: fetchError } = await admin
    .from("marketplace_bookings")
    .select("id, amount, status, access_token")
    .eq("id", bookingId)
    .maybeSingle();
  if (fetchError || !booking || booking.access_token !== accessToken) {
    return json({ error: "Booking not found" }, 404);
  }

  if (booking.status !== "pending_payment") {
    // Already resolved, most likely by the webhook arriving in the
    // meantime, nothing left for this manual check to do.
    return json({ status: booking.status });
  }

  const verifyRes = await fetch(`${squadBaseUrl(squadKey)}/transaction/verify/${encodeURIComponent(booking.id)}`, {
    headers: { authorization: `Bearer ${squadKey}` },
  });
  const verifyResult = await verifyRes.json();
  if (!verifyRes.ok || verifyResult.status !== 200) {
    return json({ status: "pending_payment", note: "Squad hasn't confirmed this one yet." });
  }

  const squadStatus = String(verifyResult.data?.transaction_status || "").toLowerCase();
  const paidKobo = verifyResult.data?.amount; // what the customer paid, not merchant_amount (post-fee)
  if (squadStatus !== "success") {
    return json({ status: "pending_payment", note: `Squad currently reports this as "${squadStatus}".` });
  }
  if (Math.round(Number(booking.amount) * 100) !== paidKobo) {
    // Same defense the webhook itself uses, a mismatched amount never
    // gets waved through just because a manual check was requested.
    return json({ error: "The amount Squad confirmed doesn't match this booking, contact support." }, 409);
  }

  // Conditional update, same as the webhook: only a booking still waiting
  // for payment moves to paid_held, and a failed write is reported, not hidden.
  const { error: holdError } = await admin
    .from("marketplace_bookings")
    .update({ status: "paid_held", paid_at: new Date().toISOString() })
    .eq("id", booking.id)
    .eq("status", "pending_payment");
  if (holdError) return json({ error: "Squad confirmed the payment but we couldn't record it yet. Try again in a moment." }, 500);
  return json({ status: "paid_held" });
});
