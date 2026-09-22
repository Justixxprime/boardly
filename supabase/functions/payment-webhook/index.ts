// ==========================================================================
// BOARDLY 2.0: payment-webhook Edge Function (combined router)
// Deploy with:  supabase functions deploy payment-webhook --no-verify-jwt
//
// Boardly now takes money through two providers at once, on purpose,
// during the move to Squad:
//   - Invoice payments (client pays an invoice) now go through SQUAD.
//   - Marketplace bookings (client pays for a professional's work,
//     money held until release) are STILL on Paystack for now, because
//     releasing that money to the professional also goes through
//     Paystack's Transfer API (marketplace-release-payment,
//     marketplace-setup-payout), and swapping that side over needs its
//     own careful pass, it is not done yet.
//
// So paste THIS function's URL into BOTH dashboards:
//   - Squad, Merchant Settings, API & Webhooks, Test/Live Webhook URL
//   - Paystack, Settings, API Keys and Webhooks, Webhook URL
// This function looks at which signature header arrived (Squad sends
// x-squad-encrypted-body, Paystack sends x-paystack-signature), verifies
// the request against the matching secret, and only then reads it.
// A request with neither header, or the wrong signature for the header
// it did send, is rejected before any database row is touched.
//
// Squad events land on the invoice path only (see above). Paystack
// events still try the Marketplace path first, then fall back to the
// invoice path, so any older pending Paystack invoice payment already
// in flight before this switch still confirms correctly.
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
// present, see below), not necessarily what actually left the customer's card.
async function handleMarketplacePayment(admin: any, reference: string, compareKobo: number) {
  const { data: booking } = await admin
    .from("marketplace_bookings")
    .select("id, amount, status")
    .eq("id", reference)
    .maybeSingle();
  if (!booking) return false; // not a Marketplace payment, let the caller try the invoice path

  if (booking.status !== "pending_payment") return true; // already handled, idempotent no-op
  if (Math.round(Number(booking.amount) * 100) !== compareKobo) {
    console.warn(`payment-webhook (marketplace): amount mismatch for booking ${booking.id}, expected ${booking.amount} NGN, provider reports ${compareKobo} (fee-free)`);
    return true;
  }
  // Conditional update: only a booking still waiting for payment can move to
  // paid_held, so a webhook and the verify fallback arriving together cannot
  // both write it. A failed write throws, the caller answers 500, and
  // the provider retries instead of the payment being silently lost.
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
    console.warn(`payment-webhook (invoice): ${result} for reference ${reference}, provider reports ${compareKobo} (fee-free) ${paidCurrency}`);
  }
  // confirmed and already_handled are both fine, a replayed webhook is a no-op.
  return true;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });

  const rawBody = await request.text();
  const squadSignature = request.headers.get("x-squad-encrypted-body");
  const paystackSignature = request.headers.get("x-paystack-signature");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---------- SQUAD (invoice payments) ----------
  if (squadSignature) {
    const squadKey = Deno.env.get("SQUAD_SECRET_KEY");
    if (!squadKey) return new Response("Not configured", { status: 500, headers: CORS_HEADERS });

    const expected = (await hmacSha512Hex(squadKey, rawBody)).toUpperCase();
    if (!timingSafeEqual(squadSignature.toUpperCase(), expected)) {
      return new Response("Not authorized", { status: 401, headers: CORS_HEADERS });
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return new Response("Bad payload", { status: 400, headers: CORS_HEADERS });
    }
    if (event.Event !== "charge_successful") return new Response("ok", { status: 200, headers: CORS_HEADERS });

    const body = event.Body || {};
    const reference: string = body.transaction_ref;
    const paidKobo: number = body.amount; // what the customer paid, not merchant_amount (post-fee)
    const paidCurrency: string | undefined = body.currency;
    const status: string = String(body.transaction_status || "").toLowerCase();
    if (!reference || status !== "success") return new Response("ok", { status: 200, headers: CORS_HEADERS });

    try {
      await handleInvoicePayment(admin, reference, paidKobo, paidCurrency);
    } catch (err) {
      console.error("payment-webhook (squad): " + (err instanceof Error ? err.message : String(err)));
      return new Response("Temporary error, please retry", { status: 500, headers: CORS_HEADERS });
    }
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  // ---------- PAYSTACK (marketplace bookings, and any older invoice payment still in flight) ----------
  if (paystackSignature) {
    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackKey) return new Response("Not configured", { status: 500, headers: CORS_HEADERS });

    const expectedSignature = await hmacSha512Hex(paystackKey, rawBody);
    if (!timingSafeEqual(paystackSignature, expectedSignature)) {
      return new Response("Not authorized", { status: 401, headers: CORS_HEADERS });
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return new Response("Bad payload", { status: 400, headers: CORS_HEADERS });
    }
    if (event.event !== "charge.success") return new Response("ok", { status: 200, headers: CORS_HEADERS });

    const reference: string = event.data?.reference;
    const paidKobo: number = event.data?.amount;
    const requestedKobo: number = event.data?.requested_amount;
    const compareKobo = Number.isFinite(requestedKobo) && requestedKobo > 0 ? requestedKobo : paidKobo;
    const paidCurrency: string | undefined = event.data?.currency;
    const paystackStatus: string = event.data?.status;
    if (!reference || paystackStatus !== "success") return new Response("ok", { status: 200, headers: CORS_HEADERS });

    try {
      const handledAsMarketplace = await handleMarketplacePayment(admin, reference, compareKobo);
      if (!handledAsMarketplace) {
        await handleInvoicePayment(admin, reference, compareKobo, paidCurrency);
      }
    } catch (err) {
      console.error("payment-webhook (paystack): " + (err instanceof Error ? err.message : String(err)));
      return new Response("Temporary error, please retry", { status: 500, headers: CORS_HEADERS });
    }
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  // Deliberately vague: no recognizable signature header at all.
  return new Response("Not authorized", { status: 401, headers: CORS_HEADERS });
});
