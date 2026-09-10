// ==========================================================================
// BOARDLY 2.0 - get-invoice-info Edge Function
// Deploy with:  supabase functions deploy get-invoice-info --no-verify-jwt
//
// A client opening an invoice link has no Boardly login, same reasoning
// as get-proposal-info/get-custom-form-info/etc.
//
// Refuses an invoice still in "draft" - same rule as proposals: a link
// only becomes reachable once its owner has actually sent it.
//
// Also does the one write this endpoint is allowed to make: the first
// time a "sent" invoice is opened, flips it to "viewed" and stamps
// viewed_at. This is a one-way, status-only transition (sent -> viewed),
// the same shape of thing respond-to-proposal does for accepted/declined -
// it can never move an invoice to "paid" or touch its amount, because
// nothing about opening a link is evidence that money moved.
// ==========================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  let token: string;
  try {
    const parsed = await request.json();
    token = String(parsed.token || "");
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!token) return json({ error: "Missing token" }, 400);

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: invoice, error } = await admin
    .from("invoices")
    .select("id, title, notes, line_items, currency, status, client_name, issue_date, due_date, viewed_at, board_id")
    .eq("public_token", token)
    .maybeSingle();
  if (error || !invoice || invoice.status === "draft") {
    return json({ error: "This invoice link isn't valid." }, 404);
  }

  if (invoice.status === "sent") {
    await admin
      .from("invoices")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", invoice.id);
    invoice.status = "viewed";
  }

  // Sum confirmed payments/refunds against this invoice so the client
  // sees an honest amount-paid / balance-due, not just the line items.
  const { data: txns } = await admin
    .from("transactions")
    .select("type, amount")
    .eq("invoice_id", invoice.id)
    .in("type", ["payment", "refund"]);
  const amountPaid = (txns || []).reduce(
    (sum: number, t: { type: string; amount: number }) => sum + (t.type === "payment" ? t.amount : -t.amount),
    0
  );

  // Money is deliberately user-scoped, not board-scoped (see schema_v62's
  // own comment on that decision) - board_id is often null here, unlike
  // proposals where it's guaranteed. Only look up a board name when one
  // is actually linked; otherwise "fromName" is just left blank rather
  // than querying a table that may have nothing to say.
  let fromName = "";
  if (invoice.board_id) {
    const { data: board } = await admin.from("boards").select("name").eq("id", invoice.board_id).maybeSingle();
    fromName = board?.name || "";
  }

  return json({
    title: invoice.title,
    notes: invoice.notes || "",
    lineItems: invoice.line_items || [],
    currency: invoice.currency,
    status: invoice.status,
    clientName: invoice.client_name || "",
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    amountPaid,
    fromName,
  });
});
