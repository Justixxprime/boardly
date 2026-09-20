// ==========================================================================
// BOARDLY - marketplace-release-payment Edge Function
// Deploy with:  supabase functions deploy marketplace-release-payment --no-verify-jwt
//
// Needs --no-verify-jwt - the person calling this is the paying client
// on booking-status.html, with no Boardly login at all. Their proof of
// identity is the same access_token marketplace-booking-status checks -
// see schema_v33's comment on marketplace_bookings for why this can't
// be a plain RLS policy.
//
// THIS IS THE ESCROW RELEASE ITSELF: the client taps "Confirm the work
// is done" on their status page, this function verifies their token,
// confirms the booking is actually sitting in 'paid_held' (money
// collected, not yet sent anywhere), then calls Paystack's Transfer API
// to send the provider their share - Boardly's own cut (see
// PLATFORM_FEE_PERCENT below) simply never gets transferred, so it's
// left behind in Charles's own Paystack balance rather than moved
// anywhere separately.
//
// F17 FIX (schema_v84): two requests for the same booking could race
// each other. Before this fix, the function read the booking, saw
// status = paid_held, then called Paystack, then updated the status to
// released only at the very end. If a second request came in while the
// first was still waiting on Paystack, it would also read paid_held
// and also send a transfer, sending the provider's money twice.
//
// The fix is a claim step. Before calling Paystack, this function tries
// to update the booking from paid_held to a new in-between status,
// releasing, using a conditional update that only touches a row still
// sitting at paid_held. Postgres only lets one of two simultaneous
// requests win that update. The request that does not win is told the
// booking is already being processed, and never calls Paystack at all.
// If the Paystack call itself fails after the claim succeeds, the
// function puts the booking back to paid_held so it can be tried again
// later (by the client pressing the button again).
//
// REAL LIMITATION, STATED PLAINLY: Paystack Transfers require a fully
// verified LIVE business account before they'll actually move money -
// in Test Mode this call will fail (Test Mode has no real Transfers
// API). Once Charles's account is live-verified, Paystack may also
// require "OTP for transfers" to be turned OFF in Paystack -> Settings
// -> Preferences for an unattended call like this one to succeed
// without a human typing a one-time code Paystack texts to the account
// holder. Both of these are explained in MARKETPLACE_PAYMENTS_SETUP.md.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

const DEFAULT_PLATFORM_FEE_PERCENT = 10;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!paystackKey) return json({ error: "Payments aren't configured on this Boardly yet." }, 500);

  let bookingId: string, accessToken: string;
  try {
    const body = await request.json();
    bookingId = String(body.bookingId || "");
    accessToken = String(body.accessToken || "");
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!bookingId || !accessToken) return json({ error: "Missing booking id or access token" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: booking, error } = await admin
    .from("marketplace_bookings")
    .select("id, access_token, status, amount, profile_user_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !booking || booking.access_token !== accessToken) {
    return json({ error: "Booking not found" }, 404);
  }
  if (booking.status !== "paid_held") {
    const message = booking.status === "releasing"
      ? "This payment is already being released, give it a moment and refresh."
      : `This booking is already "${booking.status}" - nothing to release.`;
    return json({ error: message }, 400);
  }

  // Claim step: only one concurrent request can win this update, because
  // it only matches a row that is still exactly paid_held. select() after
  // update() tells us whether THIS request was the one that won.
  const { data: claimed, error: claimError } = await admin
    .from("marketplace_bookings")
    .update({ status: "releasing" })
    .eq("id", booking.id)
    .eq("status", "paid_held")
    .select("id");
  if (claimError) return json({ error: "Couldn't start the release, try again." }, 500);
  if (!claimed || claimed.length === 0) {
    return json({ error: "This payment is already being released, give it a moment and refresh." }, 409);
  }

  const { data: payout, error: payoutError } = await admin
    .from("marketplace_provider_payouts")
    .select("paystack_recipient_code")
    .eq("user_id", booking.profile_user_id)
    .maybeSingle();
  if (payoutError || !payout?.paystack_recipient_code) {
    await admin.from("marketplace_bookings").update({ status: "paid_held" }).eq("id", booking.id);
    return json({ error: "The provider's payout details are missing - contact them directly." }, 500);
  }

  const feePercent = Number(Deno.env.get("MARKETPLACE_PLATFORM_FEE_PERCENT")) || DEFAULT_PLATFORM_FEE_PERCENT;
  const transferKobo = Math.round(Number(booking.amount) * (1 - feePercent / 100) * 100);

  let transferRes: Response;
  let transferData: any;
  try {
    transferRes = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: { authorization: `Bearer ${paystackKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        source: "balance",
        amount: transferKobo,
        recipient: payout.paystack_recipient_code,
        reason: `Boardly Marketplace booking ${booking.id}`,
      }),
    });
    transferData = await transferRes.json();
  } catch {
    await admin.from("marketplace_bookings").update({ status: "paid_held" }).eq("id", booking.id);
    return json({ error: "Couldn't reach Paystack to send the transfer, try again in a moment." }, 502);
  }

  if (!transferRes.ok || !transferData.status) {
    // Roll back the claim so the client can try releasing again later.
    await admin.from("marketplace_bookings").update({ status: "paid_held" }).eq("id", booking.id);
    return json({
      error: transferData.message ||
        "Paystack couldn't complete the transfer. If this account is still in Test Mode, or has OTP-for-transfers turned on, see MARKETPLACE_PAYMENTS_SETUP.md.",
    }, 502);
  }

  await admin.from("marketplace_bookings").update({ status: "released", released_at: new Date().toISOString() }).eq("id", booking.id);

  return json({ ok: true });
});
