// ==========================================================================
// BOARDLY 2.0: payment-webhook Edge Function (combined router)
// Deploy with:  supabase functions deploy payment-webhook --no-verify-jwt
// Paste THIS function's URL into Paystack, Settings, API Keys and
// Webhooks, Webhook URL. Use this one instead of marketplace-payment-
// webhook's or invoice-payment-webhook's own URLs, Paystack only
// supports one webhook URL per account, so this exists to handle both.
//
// What this solves: marketplace-payment-webhook and invoice-payment-
// webhook are both still deployed and still work correctly on their own,
// but only one URL can actually be registered in Paystack at a time.
// This function does the exact same signature check those two already
// do, then looks at the payment reference to work out which one it is
// for: a Marketplace payment always has a reference that matches a real
// marketplace_bookings.id, an invoice payment always has a reference
// that matches a real transactions.idempotency_key. Those two spaces of
// values do not overlap (one is a booking's own id, the other is a
// freshly generated id that is never a booking id), so this check is
// safe, not a guess.
//
// The actual confirmation logic below is copied from each function
// rather than calling them over HTTP, so this keeps working even if
// either of those two individual functions is ever removed later.
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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// compareKobo is the fee-free amount (Paystack's "requested_amount" when
// present, see the header comment above), not necessarily what actually
// left the customer's card.
async function handleMarketplacePayment(admin: any, reference: string, compareKobo: number) {
  const { data: booking } = await admin
    .from("marketplace_bookings")
    .select("id, amount, status")
    .eq("id", reference)
    .maybeSingle();
  if (!booking) return false; // not a Marketplace payment, let the caller try the invoice path

  if (booking.status !== "pending_payment") return true; // already handled, idempotent no-op
  if (Math.round(Number(booking.amount) * 100) !== compareKobo) {
    console.warn(`payment-webhook (marketplace): amount mismatch for booking ${booking.id}, expected ${booking.amount} NGN, Paystack reports ${compareKobo} kobo (fee-free)`);
    return true;
  }
  // Conditional update: only a booking still waiting for payment can move to
  // paid_held, so a webhook and the verify fallback arriving together cannot
  // both write it. A failed write throws, the caller answers 500, and
  // Paystack retries instead of the payment being silently lost.
  const { error: holdError } = await admin
    .from("marketplace_bookings")
    .update({ status: "paid_held", paid_at: new Date().toISOString() })
    .eq("id", booking.id)
    .eq("status", "pending_payment");
  if (holdError) throw new Error("could not mark booking paid: " + holdError.message);
  return true;
}

async function handleInvoicePayment(admin: any, reference: string, compareKobo: number, paidCurrency: string | undefined) {
  // The whole confirmation (pending to confirmed, then the invoice status
  // recomputed from the ledger) runs inside ONE database transaction:
  // public.confirm_invoice_payment, schema_v85. Either all of it happens or
  // none of it does, and two webhooks for the same payment cannot interleave.
  const { data, error } = await admin.rpc("confirm_invoice_payment", {
    p_reference: reference,
    p_paid_minor: compareKobo,
    p_currency: paidCurrency ?? null,
  });
  if (error) throw new Error("confirm_invoice_payment failed: " + error.message);

  const result = data?.result;
  if (result === "not_found") return false; // not an invoice payment either, nothing else this router knows how to handle
  if (result === "amount_mismatch" || result === "currency_mismatch") {
    console.warn(`payment-webhook (invoice): ${result} for reference ${reference}, Paystack reports ${compareKobo} (fee-free) ${paidCurrency}`);
  }
  // confirmed and already_handled are both fine, a replayed webhook is a no-op.
  return true;
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
    return new Response("Not authorized", { status: 401, headers: CORS_HEADERS });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Bad payload", { status: 400, headers: CORS_HEADERS });
  }

  if (event.event !== "charge.success") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  const reference: string = event.data?.reference;
  const paidKobo: number = event.data?.amount;
  // Paystack's own dashboard has a setting for who pays the transaction fee,
  // the business (Charles) or the customer. When the customer pays it,
  // Paystack adds the fee on top at checkout, so "amount" (what actually
  // left the customer's card) ends up bigger than what was asked for at
  // initialize time. Paystack always also sends "requested_amount": the
  // original amount before any fee was added, whichever side pays it. That
  // is the number that should match our own records, "amount" is not, so
  // it is used here instead whenever Paystack provides it.
  const requestedKobo: number = event.data?.requested_amount;
  const compareKobo = Number.isFinite(requestedKobo) && requestedKobo > 0 ? requestedKobo : paidKobo;
  const paidCurrency: string | undefined = event.data?.currency;
  const paystackStatus: string = event.data?.status;
  if (!reference || paystackStatus !== "success") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const handledAsMarketplace = await handleMarketplacePayment(admin, reference, compareKobo);
    if (!handledAsMarketplace) {
      await handleInvoicePayment(admin, reference, compareKobo, paidCurrency);
      // If neither path recognized the reference, there is nothing more
      // to do, either a stale test event or a reference belonging to a
      // different integration entirely. Still answer 200 in that case, so
      // Paystack does not keep retrying forever.
    }
  } catch (err) {
    // A real database failure. Answer 500 so Paystack sends the event again
    // later, rather than 200 and losing the payment confirmation for good.
    console.error("payment-webhook: " + (err instanceof Error ? err.message : String(err)));
    return new Response("Temporary error, please retry", { status: 500, headers: CORS_HEADERS });
  }

  return new Response("ok", { status: 200, headers: CORS_HEADERS });
});
