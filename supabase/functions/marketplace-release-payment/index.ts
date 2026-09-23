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
// collected, not yet sent anywhere), then sends the provider their
// share - Boardly's own cut (see PLATFORM_FEE_PERCENT below) simply
// never gets sent, so it's left behind in the merchant's own balance
// rather than moved anywhere separately.
//
// SWITCHED TO SQUAD on 22 Sep 2026 (schema_v92). A payout row's
// "provider" column decides which company actually gets called:
//   - provider = 'squad' (every NEW payout setup from now on): calls
//     Squad's own Transfer API (docs.squadco.com), no recipient code,
//     sends bank_code + account_number + account_name straight from
//     the payout row every time.
//   - provider = 'paystack' (payout rows set up before the switch):
//     unchanged, still calls Paystack's Transfer API with the stored
//     recipient code, so a provider who already finished payout setup
//     the old way keeps working exactly as before.
//
// F17 FIX (schema_v84, kept as-is): two requests for the same booking
// could race each other. Before this fix, the function read the
// booking, saw status = paid_held, then called the payment provider,
// then updated the status to released only at the very end. If a
// second request came in while the first was still waiting, it would
// also read paid_held and also send a transfer, sending the provider's
// money twice.
//
// The fix is a claim step. Before calling the provider, this function
// tries to update the booking from paid_held to a new in-between
// status, releasing, using a conditional update that only touches a
// row still sitting at paid_held. Postgres only lets one of two
// simultaneous requests win that update. The request that does not win
// is told the booking is already being processed, and never calls the
// provider at all. If the provider call itself fails after the claim
// succeeds, the function puts the booking back to paid_held so it can
// be tried again later (by the client pressing the button again).
//
// REAL LIMITATION, STATED PLAINLY (Squad side): a brand new Squad
// sandbox merchant's wallet balance is 0, a transfer will fail with
// "Insufficient balance" until either test funds land in it (ask
// help@squadco.com how sandbox wallet funding works, this changes from
// time to time) or the account moves to live with real settled money in
// it. This is expected during testing, not a bug in this function.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

const DEFAULT_PLATFORM_FEE_PERCENT = 10;

function squadBaseUrl(secretKey: string): string {
  return secretKey.startsWith("sandbox_sk_") ? "https://sandbox-api-d.squadco.com" : "https://api-d.squadco.com";
}

// Turns the handful of Paystack transfer refusals that are about Boardly's
// own Paystack account (not about the buyer) into plain words. The payment
// is always still safely held when one of these is shown.
function friendlyPaystackError(message: string): string {
  const safe = "Your payment is safe and is still held by Boardly. Nothing was lost and nothing was sent twice.";
  if (/third party payout|starter business/i.test(message)) {
    return `${safe} The provider could not be paid yet because Boardly's Paystack account is not approved to send money out. Please try again later or contact Boardly support.`;
  }
  if (/otp/i.test(message)) {
    return `${safe} Paystack needs an extra approval code before it will send this payout. Please contact Boardly support.`;
  }
  if (/insufficient|balance/i.test(message)) {
    return `${safe} Boardly's Paystack balance is too low to send this payout right now. Please try again later.`;
  }
  return message ? `${safe} Paystack said: ${message}` : `${safe} Paystack could not complete the transfer. Please try again later.`;
}

function friendlySquadError(message: string): string {
  const safe = "Your payment is safe and is still held by Boardly. Nothing was lost and nothing was sent twice.";
  if (/insufficient balance/i.test(message)) {
    return `${safe} Boardly's Squad wallet balance is too low to send this payout right now. Please try again later.`;
  }
  return message ? `${safe} Squad said: ${message}` : `${safe} Squad could not complete the transfer. Please try again later.`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

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

  const { data: payout, error: payoutError } = await admin
    .from("marketplace_provider_payouts")
    .select("provider, bank_code, account_number, account_name, paystack_recipient_code")
    .eq("user_id", booking.profile_user_id)
    .maybeSingle();
  if (payoutError || !payout || (!payout.paystack_recipient_code && !payout.account_number)) {
    return json({ error: "The provider's payout details are missing - contact them directly." }, 500);
  }
  const usesPaystack = payout.provider === "paystack" && !!payout.paystack_recipient_code;

  const requiredSecret = usesPaystack ? "PAYSTACK_SECRET_KEY" : "SQUAD_SECRET_KEY";
  const secretKey = Deno.env.get(requiredSecret);
  if (!secretKey) return json({ error: `Payments aren't configured on this Boardly yet (${requiredSecret} missing).` }, 500);

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

  const feePercent = Number(Deno.env.get("MARKETPLACE_PLATFORM_FEE_PERCENT")) || DEFAULT_PLATFORM_FEE_PERCENT;
  const transferKobo = Math.round(Number(booking.amount) * (1 - feePercent / 100) * 100);

  if (usesPaystack) {
    let transferRes: Response;
    let transferData: any;
    try {
      transferRes = await fetch("https://api.paystack.co/transfer", {
        method: "POST",
        headers: { authorization: `Bearer ${secretKey}`, "content-type": "application/json" },
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
      await admin.from("marketplace_bookings").update({ status: "paid_held" }).eq("id", booking.id);
      console.error("Paystack transfer failed:", transferData?.message);
      return json({ error: friendlyPaystackError(String(transferData?.message || "")) }, 502);
    }
    await admin.from("marketplace_bookings").update({ status: "released", released_at: new Date().toISOString() }).eq("id", booking.id);
    return json({ ok: true });
  }

  // ---------- SQUAD ----------
  // Squad requires the merchant ID prefixed onto every transfer
  // reference, or the call is rejected outright. See
  // MARKETPLACE_PAYMENTS_SETUP.md for where to find this on the Squad
  // dashboard (the short code shown under the workspace name, e.g.
  // SBBV6JQ2F8).
  const merchantId = Deno.env.get("SQUAD_MERCHANT_ID");
  if (!merchantId) {
    await admin.from("marketplace_bookings").update({ status: "paid_held" }).eq("id", booking.id);
    return json({ error: "SQUAD_MERCHANT_ID isn't set yet - see MARKETPLACE_PAYMENTS_SETUP.md" }, 500);
  }
  const transactionReference = `${merchantId}_${booking.id}`;
  const base = squadBaseUrl(secretKey);
  const transferBody = {
    transaction_reference: transactionReference,
    amount: String(transferKobo),
    bank_code: payout.bank_code,
    account_number: payout.account_number,
    account_name: payout.account_name,
    currency_id: "NGN",
    remark: `Boardly Marketplace booking ${booking.id}`.slice(0, 100),
  };

  async function attemptTransfer(): Promise<{ ok: boolean; message?: string; shouldRequery?: boolean }> {
    try {
      const res = await fetch(`${base}/payout/transfer`, {
        method: "POST",
        headers: { authorization: `Bearer ${secretKey}`, "content-type": "application/json" },
        body: JSON.stringify(transferBody),
      });
      const data = await res.json();
      if (res.ok && data.status === 200) return { ok: true };
      // 424 means "timed out, might have gone through" per Squad's own
      // documented error codes, everything else is a real refusal.
      if (res.status === 424) return { ok: false, shouldRequery: true, message: data.message };
      return { ok: false, message: data.message };
    } catch {
      return { ok: false, shouldRequery: true, message: "network error reaching Squad" };
    }
  }

  let result = await attemptTransfer();
  if (!result.ok && result.shouldRequery) {
    // Squad's own guidance for a 424: ask it directly whether the
    // transfer actually landed, rather than guessing and risking a
    // second attempt paying the provider twice.
    try {
      const requeryRes = await fetch(`${base}/payout/requery`, {
        method: "POST",
        headers: { authorization: `Bearer ${secretKey}`, "content-type": "application/json" },
        body: JSON.stringify({ transaction_reference: transactionReference }),
      });
      const requeryData = await requeryRes.json();
      if (requeryRes.ok && requeryData.status === 200) result = { ok: true };
    } catch {
      // requery itself failed to reach Squad, fall through and treat as
      // still unresolved, see the log line below.
    }
  }

  if (!result.ok) {
    await admin.from("marketplace_bookings").update({ status: "paid_held" }).eq("id", booking.id);
    console.error(`Squad transfer for booking ${booking.id} (ref ${transactionReference}) did not confirm: ${result.message || "unknown"}`);
    return json({ error: friendlySquadError(String(result.message || "")) }, 502);
  }

  await admin.from("marketplace_bookings").update({ status: "released", released_at: new Date().toISOString() }).eq("id", booking.id);
  return json({ ok: true });
});
