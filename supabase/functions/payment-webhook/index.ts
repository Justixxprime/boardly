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

async function handleMarketplacePayment(admin: any, reference: string, paidKobo: number) {
  const { data: booking } = await admin
    .from("marketplace_bookings")
    .select("id, amount, status")
    .eq("id", reference)
    .maybeSingle();
  if (!booking) return false; // not a Marketplace payment, let the caller try the invoice path

  if (booking.status !== "pending_payment") return true; // already handled, idempotent no-op
  if (Math.round(Number(booking.amount) * 100) !== paidKobo) {
    console.warn(`payment-webhook (marketplace): amount mismatch for booking ${booking.id}, expected ${booking.amount} NGN, Paystack reports ${paidKobo} kobo`);
    return true;
  }
  await admin.from("marketplace_bookings").update({ status: "paid_held", paid_at: new Date().toISOString() }).eq("id", booking.id);
  return true;
}

async function handleInvoicePayment(admin: any, reference: string, paidKobo: number) {
  const { data: txn } = await admin
    .from("transactions")
    .select("id, invoice_id, amount, status")
    .eq("idempotency_key", reference)
    .maybeSingle();
  if (!txn) return false; // not an invoice payment either, nothing else this router knows how to handle

  if (txn.status !== "pending") return true; // already handled, idempotent no-op
  if (Math.round(Number(txn.amount) * 100) !== paidKobo) {
    console.warn(`payment-webhook (invoice): amount mismatch for transaction ${txn.id}, expected ${txn.amount}, Paystack reports ${paidKobo} minor units`);
    return true;
  }

  await admin.from("transactions").update({ status: "confirmed" }).eq("id", txn.id);

  if (txn.invoice_id) {
    const { data: invoice } = await admin.from("invoices").select("id, line_items").eq("id", txn.invoice_id).maybeSingle();
    if (invoice) {
      const total = (invoice.line_items || []).reduce(
        (sum: number, item: { quantity?: number; unit_price?: number }) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
        0
      );
      const { data: confirmedTxns } = await admin
        .from("transactions")
        .select("type, amount")
        .eq("invoice_id", invoice.id)
        .eq("status", "confirmed")
        .in("type", ["payment", "refund"]);
      const paid = (confirmedTxns || []).reduce(
        (sum: number, t: { type: string; amount: number }) => sum + (t.type === "payment" ? t.amount : -t.amount),
        0
      );
      const newStatus = paid >= total - 0.005 ? "paid" : paid > 0 ? "partially_paid" : "sent";
      await admin.from("invoices").update({ status: newStatus }).eq("id", invoice.id);
    }
  }
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
  const paystackStatus: string = event.data?.status;
  if (!reference || paystackStatus !== "success") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const handledAsMarketplace = await handleMarketplacePayment(admin, reference, paidKobo);
  if (!handledAsMarketplace) {
    await handleInvoicePayment(admin, reference, paidKobo);
    // If neither path recognized the reference, there is nothing more
    // to do, either a stale test event or a reference belonging to a
    // different integration entirely. Still answer 200 either way, so
    // Paystack does not keep retrying forever.
  }

  return new Response("ok", { status: 200, headers: CORS_HEADERS });
});
