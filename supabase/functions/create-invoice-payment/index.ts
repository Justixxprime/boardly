// ==========================================================================
// BOARDLY 2.0: create-invoice-payment Edge Function
// Deploy with:  supabase functions deploy create-invoice-payment --no-verify-jwt
//
// Needs --no-verify-jwt because the person calling this is a client on
// invoice.html with no Boardly account at all, same reason
// marketplace-create-booking and get-invoice-info both need it too.
//
// What this does: a client viewing their invoice clicks "Pay now," and
// this function (1) confirms the invoice is real and actually payable,
// (2) computes the real balance due server-side from the ledger (never
// trusts a client-submitted amount), (3) writes a 'pending' transaction
// row, and (4) asks Paystack for a hosted checkout link, which the
// browser then redirects to. Nobody's card details ever pass through
// Boardly, Paystack's own page handles that entirely.
//
// The pending row only ever becomes 'confirmed' inside
// invoice-payment-webhook, after Paystack's own signed webhook says so.
// Nothing in this function marks anything paid.
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

  const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!paystackKey) {
    return json({ error: "Payments aren't set up on this Boardly yet. Please contact whoever sent you this invoice directly." }, 500);
  }

  let token: string, payerEmail: string, origin: string;
  try {
    const body = await request.json();
    token = String(body.token || "");
    payerEmail = String(body.payerEmail || "").trim().slice(0, 200);
    origin = String(body.origin || "").replace(/\/$/, "");
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!token) return json({ error: "Missing token" }, 400);
  if (!payerEmail || !payerEmail.includes("@")) return json({ error: "Enter a valid email to continue" }, 400);
  if (!origin || !/^https?:\/\//.test(origin)) return json({ error: "Missing page origin" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: invoice, error: fetchError } = await admin
    .from("invoices")
    .select("id, user_id, title, currency, status, line_items")
    .eq("public_token", token)
    .maybeSingle();
  if (fetchError || !invoice) return json({ error: "This invoice link isn't valid." }, 404);
  if (!["sent", "viewed", "partially_paid", "overdue"].includes(invoice.status)) {
    return json({ error: "This invoice isn't open for payment right now." }, 400);
  }

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
  const alreadyPaid = (confirmedTxns || []).reduce(
    (sum: number, t: { type: string; amount: number }) => sum + (t.type === "payment" ? t.amount : -t.amount),
    0
  );
  const balance = Math.round((total - alreadyPaid) * 100) / 100;
  if (balance <= 0) return json({ error: "This invoice is already paid in full." }, 400);

  const idempotencyKey = crypto.randomUUID();
  const { data: pendingTxn, error: insertError } = await admin
    .from("transactions")
    .insert({
      user_id: invoice.user_id,
      invoice_id: invoice.id,
      type: "payment",
      amount: balance,
      currency: invoice.currency,
      provider: "paystack",
      status: "pending",
      idempotency_key: idempotencyKey,
    })
    .select()
    .single();
  if (insertError || !pendingTxn) {
    return json({ error: "Couldn't start this payment: " + (insertError?.message || "unknown error") }, 500);
  }

  const callbackUrl = `${origin}/invoice.html?i=${token}`;

  const initRes = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { authorization: `Bearer ${paystackKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      email: payerEmail,
      amount: Math.round(balance * 100), // major unit to minor unit (naira to kobo, etc.)
      reference: idempotencyKey,
      callback_url: callbackUrl,
      metadata: { invoice_id: invoice.id, invoice_title: invoice.title },
    }),
  });
  const initData = await initRes.json();
  if (!initRes.ok || !initData.status) {
    // Roll the pending row back to 'failed' rather than leaving an
    // orphan pending entry nobody will ever pay, keeps the owner's
    // ledger honest about what's actually in flight.
    await admin.from("transactions").update({ status: "failed" }).eq("id", pendingTxn.id);
    return json({ error: initData.message || "Paystack couldn't start this payment" }, 502);
  }

  return json({ authorizationUrl: initData.data.authorization_url });
});
