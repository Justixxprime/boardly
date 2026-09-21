// ==========================================================================
// BOARDLY 2.0: marketplace-verify-payment Edge Function
// Deploy with:  supabase functions deploy marketplace-verify-payment --no-verify-jwt
//
// Charles reported a booking stuck on "Still confirming your payment"
// forever, even though Paystack itself already shows the charge as
// successful. payment-webhook (the combined router) and marketplace-
// payment-webhook (its standalone predecessor) both contain correct
// logic to move a booking from pending_payment to paid_held, but
// Paystack only calls ONE webhook URL for the whole account, so if
// that URL is ever wrong, unreachable, or simply never configured, no
// webhook fires and a booking can sit pending forever no matter how
// correct the webhook code itself is. Waiting on a webhook with no
// fallback is fragile by nature, this closes that gap completely,
// independent of whatever the webhook misconfiguration turns out to
// be: instead of only waiting to be told, this ASKS Paystack directly
// ("transaction/verify"), the same source of truth the webhook itself
// trusts, and applies the exact same status-and-amount-check logic if
// Paystack confirms success. booking-status.html calls this itself
// after polling for a while with no change, so a client is never
// stuck staring at "still confirming" with no way out.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

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

  const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!paystackKey) return json({ error: "Payments aren't configured yet." }, 500);

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

  const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(booking.id)}`, {
    headers: { authorization: `Bearer ${paystackKey}` },
  });
  const verifyResult = await verifyRes.json();
  if (!verifyRes.ok || !verifyResult.status) {
    return json({ status: "pending_payment", note: "Paystack hasn't confirmed this one yet." });
  }

  const paystackStatus = verifyResult.data?.status;
  const paidKobo = verifyResult.data?.amount;
  // Paystack's dashboard lets Charles choose who pays the transaction fee,
  // him or the customer. When the customer pays it, Paystack adds the fee
  // on top at checkout, so "amount" (what actually left the customer's
  // card) ends up bigger than the amount asked for at initialize time.
  // Paystack always also sends "requested_amount": the original amount
  // before any fee was added, and that is what should match the booking,
  // so it is used here instead of "amount" whenever Paystack provides it.
  // The webhook (payment-webhook) applies this same fix.
  const requestedKobo = verifyResult.data?.requested_amount;
  const compareKobo = Number.isFinite(requestedKobo) && requestedKobo > 0 ? requestedKobo : paidKobo;
  if (paystackStatus !== "success") {
    return json({ status: "pending_payment", note: `Paystack currently reports this as "${paystackStatus}".` });
  }
  if (Math.round(Number(booking.amount) * 100) !== compareKobo) {
    // Same defense the webhook itself uses, a mismatched amount never
    // gets waved through just because a manual check was requested.
    return json({ error: "The amount Paystack confirmed doesn't match this booking, contact support." }, 409);
  }

  // Conditional update, same as the webhook: only a booking still waiting
  // for payment moves to paid_held, and a failed write is reported, not hidden.
  const { error: holdError } = await admin
    .from("marketplace_bookings")
    .update({ status: "paid_held", paid_at: new Date().toISOString() })
    .eq("id", booking.id)
    .eq("status", "pending_payment");
  if (holdError) return json({ error: "Paystack confirmed the payment but we couldn't record it yet. Try again in a moment." }, 500);
  return json({ status: "paid_held" });
});
