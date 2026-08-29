// ==========================================================================
// BOARDLY - marketplace-payment-webhook Edge Function
// Deploy with:  supabase functions deploy marketplace-payment-webhook --no-verify-jwt
// Then paste this function's URL into Paystack -> Settings -> API Keys
// & Webhooks -> Webhook URL. Full walkthrough in
// MARKETPLACE_PAYMENTS_SETUP.md.
//
// Needs --no-verify-jwt because Paystack calls this directly - it has
// no Supabase login token to send, obviously. Instead, every request is
// checked against Paystack's OWN signature scheme: Paystack signs the
// raw request body with your secret key (HMAC-SHA512) and sends the
// result in the x-paystack-signature header. This function recomputes
// that same signature itself and only trusts the request if the two
// match exactly - anyone else sending a fake "payment succeeded" POST
// to this URL gets rejected before a single database row is touched.
//
// What it does on a genuine charge.success event: finds the booking
// whose id equals the payment's reference, double-checks the amount
// paid actually matches what the booking asked for (defense against a
// tampered client-side amount), and moves it from 'pending_payment' to
// 'paid_held' - money now sits in Charles's own Paystack balance,
// waiting for the CLIENT (not the provider) to release it later via
// marketplace-release-payment.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

async function hmacSha512Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Plain string equality would leak timing information about how many
 *  leading characters matched - not a huge deal for a webhook secret
 *  that rotates rarely, but a constant-time compare costs nothing and
 *  is the right habit for anything checking a secret against untrusted
 *  input. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });

  const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!paystackKey) return new Response("Not configured", { status: 500, headers: CORS_HEADERS });

  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature") || "";
  const expectedSignature = await hmacSha512Hex(paystackKey, rawBody);
  if (!signature || !timingSafeEqual(signature, expectedSignature)) {
    // Deliberately vague response - this endpoint is public by
    // necessity, no reason to help an attacker learn anything from it.
    return new Response("Not authorized", { status: 401, headers: CORS_HEADERS });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Bad payload", { status: 400, headers: CORS_HEADERS });
  }

  if (event.event !== "charge.success") {
    // Paystack sends many event types to the same webhook URL - anything
    // that isn't a successful charge is simply not this function's job.
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  const reference: string = event.data?.reference;
  const paidKobo: number = event.data?.amount;
  const paystackStatus: string = event.data?.status;
  if (!reference || paystackStatus !== "success") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: booking, error: fetchError } = await admin
    .from("marketplace_bookings")
    .select("id, amount, status")
    .eq("id", reference)
    .maybeSingle();
  if (fetchError || !booking) {
    // Nothing matches this reference - either a stale test event or a
    // reference from a different Paystack integration entirely. Either
    // way, 200 back so Paystack doesn't keep retrying forever.
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }
  if (booking.status !== "pending_payment") {
    // Already handled (Paystack can and does send the same webhook more
    // than once) - idempotent no-op.
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }
  if (Math.round(Number(booking.amount) * 100) !== paidKobo) {
    console.warn(`marketplace-payment-webhook: amount mismatch for booking ${booking.id} - expected ${booking.amount} NGN, Paystack reports ${paidKobo} kobo`);
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  await admin.from("marketplace_bookings").update({ status: "paid_held", paid_at: new Date().toISOString() }).eq("id", booking.id);

  return new Response("ok", { status: 200, headers: CORS_HEADERS });
});
