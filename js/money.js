/* ==========================================================================
   BOARDLY 2.0: js/money.js
   --------------------------------------------------------------------------
   Powers money.html. Standalone page with its own small state object,
   same pattern as cv-builder.js. Money is user-scoped, not board-scoped
   (see schema_v62's own comment on that decision), so it doesn't load or
   depend on dashboard.js's global `state` at all.

   Needs supabase/schema_v62_money_foundation.sql and
   supabase/schema_v63_invoice_payments.sql run first, and the
   get-invoice-info / create-invoice-payment Edge Functions deployed for
   "Copy client link" and real online payment to work.

   HONESTY NOTE: "Record payment" and "Add expense" here on the owner's
   own side are bookkeeping entries (money that already moved, being
   logged after the fact), not a gateway charge. The client-facing
   invoice.html page has its own real "Pay now" flow through Paystack
   (see create-invoice-payment and invoice-payment-webhook), which lands
   in this same ledger as a 'confirmed' transaction once the webhook
   verifies it, never from a client's own claim of success.
   ========================================================================== */

const moneyState = {
  userId: null,
  ready: false,
  invoices: [],
  transactions: [],
  clients: [],           // saved client records, for the invoice builder's optional picker
  clientLinkReady: false, // whether invoices.client_id exists yet (schema_v64), guards saveInvoice below
  boards: [],             // this user's projects, for the Profitability tab
  timeEntries: [],        // tracked time per project, for the Profitability tab
  rateColumnReady: false, // whether boards.hourly_rate exists yet (schema_v65)
  builderItems: [],      // line items being assembled in the open invoice builder
  editingInvoiceId: null,
  paymentInvoiceId: null, // which invoice "Record payment" is currently attached to
};

function escMoney(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function fmtMoney(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "NGN" }).format(amount || 0);
  } catch {
    return `${currency || ""} ${(amount || 0).toFixed(2)}`;
  }
}

const INVOICE_STATUS_LABEL = {
  draft: "Draft", sent: "Sent", viewed: "Viewed", partially_paid: "Partially paid",
  paid: "Paid", overdue: "Overdue", cancelled: "Cancelled", refunded: "Refunded",
};
const INVOICE_STATUS_COLOR = {
  draft: "var(--ink-soft)", sent: "var(--info)", viewed: "var(--violet)",
  partially_paid: "var(--warning)", paid: "var(--secondary)", overdue: "var(--critical)",
  cancelled: "var(--ink-faint)", refunded: "var(--ink-soft)",
};

function invoiceTotal(invoice) {
  return (invoice.line_items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0), 0);
}

function amountPaidFor(invoiceId) {
  return moneyState.transactions
    .filter((t) => t.invoice_id === invoiceId && t.status === "confirmed" && (t.type === "payment" || t.type === "refund"))
    .reduce((sum, t) => sum + (t.type === "payment" ? Number(t.amount) : -Number(t.amount)), 0);
}

/* ---- readiness + loading ---------------------------------------------- */

async function checkMoneyReady() {
  const { error } = await supabaseClient.from("invoices").select("id").limit(1);
  moneyState.ready = !error;
  document.getElementById("money-not-ready")?.classList.toggle("hidden", moneyState.ready);
  return moneyState.ready;
}

async function loadInvoices() {
  if (!moneyState.ready) return;
  const { data, error } = await supabaseClient.from("invoices").select("*").order("created_at", { ascending: false });
  if (error) { console.warn("loadInvoices:", error.message); return; }
  moneyState.invoices = data || [];
}

async function loadTransactions() {
  if (!moneyState.ready) return;
  const { data, error } = await supabaseClient.from("transactions").select("*").order("occurred_at", { ascending: false });
  if (error) { console.warn("loadTransactions:", error.message); return; }
  moneyState.transactions = data || [];
}

/** Clients live in their own schema file (v64), separate from Money's own
 *  (v62/v63), so this fails quietly rather than blocking Money Center
 *  when only the client_id column or clients table isn't there yet.
 *  The invoice builder's saved-client picker just shows the "one-off"
 *  option only until it is. */
async function loadClients() {
  const { data, error } = await supabaseClient.from("clients").select("id, name, email").order("name", { ascending: true });
  if (error) { moneyState.clients = []; moneyState.clientLinkReady = false; return; }
  moneyState.clients = data || [];
  const { error: columnError } = await supabaseClient.from("invoices").select("client_id").limit(1);
  moneyState.clientLinkReady = !columnError;
}

async function refreshMoney() {
  await Promise.all([loadInvoices(), loadTransactions(), loadClients(), loadProfitabilityInputs()]);
  await markOverdueInvoices();
  renderSummary();
  renderInvoices();
  renderExpenses();
  renderLedger();
  renderProfitability();
}

/** Boards and time_entries live outside Money's own schema files (v62 to
 *  v64), same reasoning as loadClients above, this fails quietly rather
 *  than blocking the rest of Money Center if schema_v65 (the hourly_rate
 *  column) isn't run yet, the Profitability tab just shows rates as
 *  unset instead of erroring. */
async function loadProfitabilityInputs() {
  const { data: boardsWithRate, error: rateError } = await supabaseClient.from("boards").select("id, name, hourly_rate").eq("user_id", moneyState.userId);
  moneyState.rateColumnReady = !rateError;
  if (moneyState.rateColumnReady) {
    moneyState.boards = boardsWithRate || [];
  } else {
    const { data } = await supabaseClient.from("boards").select("id, name").eq("user_id", moneyState.userId);
    moneyState.boards = (data || []).map((b) => ({ ...b, hourly_rate: null }));
  }

  const { data: timeData } = await supabaseClient.from("time_entries").select("board_id, duration_seconds").eq("user_id", moneyState.userId);
  moneyState.timeEntries = timeData || [];
}

/* ---- overdue detection ---------------------------------------------------
   'overdue' has been a valid invoice status since schema_v62 and the UI
   already has a badge color for it, but nothing ever actually set it.
   This is deliberately NOT an AI feature (see brief Section 83, "a
   database query is not AI"): an invoice is overdue when its due date
   has passed and it still has a balance, full stop. Runs each time
   Money Center loads rather than on a schedule, since there is no
   background job runner in this codebase yet, same "computed at load
   time" pattern the rest of the app already uses. ------------------- */

async function markOverdueInvoices() {
  const today = new Date().toISOString().slice(0, 10);
  const toFlip = moneyState.invoices.filter((inv) =>
    ["sent", "viewed", "partially_paid"].includes(inv.status) &&
    inv.due_date && inv.due_date < today &&
    invoiceTotal(inv) - amountPaidFor(inv.id) > 0.005
  );
  if (!toFlip.length) return;
  await supabaseClient.from("invoices").update({ status: "overdue" }).in("id", toFlip.map((inv) => inv.id));
  toFlip.forEach((inv) => { inv.status = "overdue"; });
}

/* ---- summary strip ------------------------------------------------------ */

function renderSummary() {
  const currency = moneyState.invoices[0]?.currency || "NGN";
  let outstanding = 0, overdueCount = 0;
  const today = new Date().toISOString().slice(0, 10);
  moneyState.invoices.forEach((inv) => {
    if (["cancelled", "paid", "refunded", "draft"].includes(inv.status)) return;
    const balance = invoiceTotal(inv) - amountPaidFor(inv.id);
    if (balance > 0.005) outstanding += balance;
    if (inv.due_date && inv.due_date < today && balance > 0.005) overdueCount++;
  });
  const received = moneyState.transactions
    .filter((t) => t.type === "payment" && t.status === "confirmed")
    .reduce((sum, t) => sum + Number(t.amount), 0)
    - moneyState.transactions.filter((t) => t.type === "refund" && t.status === "confirmed").reduce((sum, t) => sum + Number(t.amount), 0);
  const expenses = moneyState.transactions
    .filter((t) => t.type === "expense" && t.status === "confirmed")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  document.getElementById("money-stat-outstanding").textContent = fmtMoney(outstanding, currency);
  document.getElementById("money-stat-received").textContent = fmtMoney(received, currency);
  document.getElementById("money-stat-expenses").textContent = fmtMoney(expenses, currency);
  document.getElementById("money-stat-overdue").textContent = String(overdueCount);
}

/* ---- invoices list ------------------------------------------------------- */

function renderInvoices() {
  const list = document.getElementById("invoices-list");
  const empty = document.getElementById("invoices-empty");
  if (!moneyState.invoices.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  list.innerHTML = moneyState.invoices.map((inv) => {
    const total = invoiceTotal(inv);
    const color = INVOICE_STATUS_COLOR[inv.status] || "var(--ink-soft)";
    return `<tr>
      <td><span class="font-medium">${escMoney(inv.title)}</span></td>
      <td>${escMoney(inv.client_name || "")}</td>
      <td><span class="badge" style="color:${color}; background:color-mix(in srgb, ${color} 14%, transparent)">${INVOICE_STATUS_LABEL[inv.status] || inv.status}</span></td>
      <td class="table-num">${fmtMoney(total, inv.currency)}</td>
      <td class="table-num">${inv.due_date ? new Date(inv.due_date).toLocaleDateString() : ""}</td>
      <td class="text-right whitespace-nowrap">
        <button type="button" class="btn-icon-xs" title="Edit" data-edit-invoice="${inv.id}"><i class="fa-solid fa-pen"></i></button>
        ${inv.status === "draft"
          ? `<button type="button" class="btn-icon-xs" title="Send" data-send-invoice="${inv.id}"><i class="fa-solid fa-paper-plane"></i></button>`
          : `<button type="button" class="btn-icon-xs" title="Copy client link" data-copy-invoice-link="${inv.id}"><i class="fa-solid fa-link"></i></button>`}
        <button type="button" class="btn-icon-xs" title="Record payment" data-record-payment="${inv.id}"><i class="fa-solid fa-money-bill-wave"></i></button>
        <button type="button" class="btn-icon-xs" title="Download PDF" data-download-invoice-pdf="${inv.id}"><i class="fa-solid fa-file-pdf"></i></button>
      </td>
    </tr>`;
  }).join("");
}

/* ---- expenses + ledger (both read straight from moneyState.transactions) ---- */

function renderExpenses() {
  const list = document.getElementById("expenses-list");
  const empty = document.getElementById("expenses-empty");
  const expenses = moneyState.transactions.filter((t) => t.type === "expense");
  if (!expenses.length) { list.innerHTML = ""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");
  list.innerHTML = expenses.map((t) => `<tr>
    <td>${new Date(t.occurred_at).toLocaleDateString()}</td>
    <td>${escMoney(t.category || "")}</td>
    <td class="table-num" style="color:var(--critical)">${fmtMoney(t.amount, t.currency)}</td>
    <td>${escMoney(t.notes || "")}</td>
    <td class="text-right"><button type="button" class="btn-icon-xs" title="Delete" data-delete-transaction="${t.id}"><i class="fa-solid fa-trash"></i></button></td>
  </tr>`).join("");
}

function renderLedger() {
  const list = document.getElementById("ledger-list");
  const empty = document.getElementById("ledger-empty");
  if (!moneyState.transactions.length) { list.innerHTML = ""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");
  const TYPE_LABEL = { payment: "Payment", refund: "Refund", expense: "Expense", payout: "Payout" };
  const TYPE_COLOR = { payment: "var(--secondary)", refund: "var(--critical)", expense: "var(--critical)", payout: "var(--violet)" };
  list.innerHTML = moneyState.transactions.map((t) => {
    const invoice = moneyState.invoices.find((i) => i.id === t.invoice_id);
    const color = t.status === "confirmed" ? TYPE_COLOR[t.type] : "var(--ink-faint)";
    const statusSuffix = t.status === "pending" ? " (pending)" : t.status === "failed" ? " (failed)" : "";
    return `<tr>
      <td>${new Date(t.occurred_at).toLocaleDateString()}</td>
      <td><span style="color:${color}" class="font-medium">${TYPE_LABEL[t.type] || t.type}${statusSuffix}</span></td>
      <td class="table-num" style="color:${color}">${t.type === "payment" ? "+" : "-"}${fmtMoney(t.amount, t.currency)}</td>
      <td>${invoice ? escMoney(invoice.title) : ""}</td>
      <td>${escMoney(t.method || t.provider || "")}</td>
      <td>${escMoney(t.notes || "")}</td>
      <td class="text-right"><button type="button" class="btn-icon-xs" title="Delete" data-delete-transaction="${t.id}"><i class="fa-solid fa-trash"></i></button></td>
    </tr>`;
  }).join("");
}

/* ---- profitability ---------------------------------------------------
   Per Section 10 of the brief: revenue, expenses, tracked time, an
   estimated labour cost from tracked hours times a per-project rate,
   projected profit, and a margin. Every number here is plain arithmetic
   over what is already loaded (invoices, confirmed transactions, time
   entries), nothing here is AI or a guess. The "healthy/at risk/
   unprofitable" banding uses fixed, stated thresholds (40% and 15%
   margin), not a model. ---------------------------------------------- */

function profitabilityForBoard(board) {
  const invoices = moneyState.invoices.filter((inv) => inv.board_id === board.id && inv.status !== "cancelled");
  const revenue = invoices.reduce((sum, inv) => sum + invoiceTotal(inv), 0);
  const currency = invoices[0]?.currency || "NGN";

  const expenses = moneyState.transactions
    .filter((t) => t.board_id === board.id && t.type === "expense" && t.status === "confirmed")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const trackedSeconds = moneyState.timeEntries
    .filter((t) => t.board_id === board.id)
    .reduce((sum, t) => sum + Number(t.duration_seconds), 0);
  const trackedHours = trackedSeconds / 3600;

  const hasRate = board.hourly_rate !== null && board.hourly_rate !== undefined && board.hourly_rate !== "";
  const labourCost = hasRate ? trackedHours * Number(board.hourly_rate) : 0;
  const profit = revenue - expenses - labourCost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : null;

  let band = null;
  if (margin !== null) {
    band = margin >= 40 ? "Healthy" : margin >= 15 ? "At risk" : "Unprofitable";
  }

  return { revenue, expenses, trackedHours, hasRate, labourCost, profit, margin, band, currency, invoiceCount: invoices.length };
}

function renderProfitability() {
  const list = document.getElementById("profitability-list");
  const empty = document.getElementById("profitability-empty");
  const relevantBoards = moneyState.boards.filter((board) =>
    moneyState.invoices.some((inv) => inv.board_id === board.id) ||
    moneyState.timeEntries.some((t) => t.board_id === board.id)
  );
  if (!relevantBoards.length) { list.innerHTML = ""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");

  const BAND_COLOR = { "Healthy": "var(--secondary)", "At risk": "var(--warning)", "Unprofitable": "var(--critical)" };

  list.innerHTML = relevantBoards.map((board) => {
    const p = profitabilityForBoard(board);
    return `<tr>
      <td><span class="font-medium">${escMoney(board.name)}</span></td>
      <td class="table-num">${fmtMoney(p.revenue, p.currency)}</td>
      <td class="table-num" style="color:var(--critical)">${p.expenses > 0 ? "-" : ""}${fmtMoney(p.expenses, p.currency)}</td>
      <td class="table-num">${p.trackedHours.toFixed(1)}h</td>
      <td class="table-num">
        ${moneyState.rateColumnReady
          ? `<input type="number" min="0" step="0.01" class="input text-xs" style="width:5.5rem; padding:.25rem .4rem" value="${p.hasRate ? board.hourly_rate : ""}" placeholder="Set rate" data-set-rate="${board.id}">`
          : `<span class="text-ink-soft text-xs">Not set up</span>`}
      </td>
      <td class="table-num">${p.hasRate ? fmtMoney(p.labourCost, p.currency) : `<span class="text-ink-faint">not included</span>`}</td>
      <td class="table-num" style="color:${p.profit >= 0 ? "var(--secondary)" : "var(--critical)"}">${fmtMoney(p.profit, p.currency)}</td>
      <td class="table-num">
        ${p.band ? `<span class="badge" style="color:${BAND_COLOR[p.band]}; background:color-mix(in srgb, ${BAND_COLOR[p.band]} 14%, transparent)">${p.margin.toFixed(0)}% ${p.band}</span>` : "..."}
      </td>
      <td></td>
    </tr>`;
  }).join("");
}

/* ---- invoice builder ---------------------------------------------------- */

function openInvoiceBuilder(id) {
  moneyState.editingInvoiceId = id;
  const invoice = id ? moneyState.invoices.find((i) => i.id === id) : null;
  document.getElementById("invoice-builder-title").textContent = invoice ? "Edit invoice" : "New invoice";

  const select = document.getElementById("invoice-client-select");
  select.innerHTML = '<option value="">One-off, not a saved client</option>' +
    moneyState.clients.map((c) => `<option value="${c.id}">${escMoney(c.name)}</option>`).join("");
  select.value = invoice?.client_id || "";

  document.getElementById("invoice-client-name").value = invoice?.client_name || "";
  document.getElementById("invoice-client-email").value = invoice?.client_email || "";
  document.getElementById("invoice-title-input").value = invoice?.title || "";
  document.getElementById("invoice-currency").value = invoice?.currency || "NGN";
  document.getElementById("invoice-issue-date").value = invoice?.issue_date || new Date().toISOString().slice(0, 10);
  document.getElementById("invoice-due-date").value = invoice?.due_date || "";
  document.getElementById("invoice-notes-input").value = invoice?.notes || "";
  document.getElementById("invoice-delete-btn").classList.toggle("hidden", !invoice);
  moneyState.builderItems = invoice ? JSON.parse(JSON.stringify(invoice.line_items || [])) : [];
  if (!moneyState.builderItems.length) addInvoiceItem();
  renderInvoiceItems();
  document.getElementById("invoice-builder-modal").classList.remove("hidden");
}

function closeInvoiceBuilder() {
  document.getElementById("invoice-builder-modal").classList.add("hidden");
  moneyState.editingInvoiceId = null;
  moneyState.builderItems = [];
}

function addInvoiceItem() {
  moneyState.builderItems.push({ id: crypto.randomUUID(), description: "", quantity: 1, unit_price: 0 });
  renderInvoiceItems();
}

function removeInvoiceItem(itemId) {
  moneyState.builderItems = moneyState.builderItems.filter((i) => i.id !== itemId);
  renderInvoiceItems();
}

function renderInvoiceItems() {
  const wrap = document.getElementById("invoice-items-list");
  wrap.innerHTML = moneyState.builderItems.map((item) => `
    <div class="flex gap-2 items-center" data-item-id="${item.id}">
      <input type="text" class="input text-sm flex-1" placeholder="Description" value="${escMoney(item.description)}" data-field="description">
      <input type="number" min="0" step="1" class="input text-sm w-16" value="${item.quantity}" data-field="quantity">
      <input type="number" min="0" step="0.01" class="input text-sm w-24" value="${item.unit_price}" data-field="unit_price">
      <button type="button" class="btn-icon-xs" data-remove-invoice-item="${item.id}"><i class="fa-solid fa-xmark"></i></button>
    </div>`).join("");
  updateInvoiceBuilderTotal();
}

function updateInvoiceBuilderTotal() {
  const currency = document.getElementById("invoice-currency").value;
  const total = moneyState.builderItems.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
  document.getElementById("invoice-builder-total").textContent = fmtMoney(total, currency);
}

async function saveInvoice() {
  const payload = {
    user_id: moneyState.userId,
    client_name: document.getElementById("invoice-client-name").value.trim() || null,
    client_email: document.getElementById("invoice-client-email").value.trim() || null,
    title: document.getElementById("invoice-title-input").value.trim() || "Untitled invoice",
    currency: document.getElementById("invoice-currency").value,
    issue_date: document.getElementById("invoice-issue-date").value || null,
    due_date: document.getElementById("invoice-due-date").value || null,
    notes: document.getElementById("invoice-notes-input").value.trim() || null,
    line_items: moneyState.builderItems.filter((i) => i.description.trim() || Number(i.unit_price) > 0),
  };
  if (moneyState.clientLinkReady) {
    payload.client_id = document.getElementById("invoice-client-select").value || null;
  }

  let error;
  if (moneyState.editingInvoiceId) {
    ({ error } = await supabaseClient.from("invoices").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", moneyState.editingInvoiceId));
  } else {
    ({ error } = await supabaseClient.from("invoices").insert(payload));
  }
  if (error) { toast("Couldn't save invoice: " + error.message, "error"); return; }
  toast("Invoice saved");
  closeInvoiceBuilder();
  await refreshMoney();
}

async function deleteInvoice() {
  if (!moneyState.editingInvoiceId) return;
  if (!confirm("Delete this invoice? This can't be undone.")) return;
  const { error } = await supabaseClient.from("invoices").delete().eq("id", moneyState.editingInvoiceId);
  if (error) { toast("Couldn't delete invoice: " + error.message, "error"); return; }
  toast("Invoice deleted");
  closeInvoiceBuilder();
  await refreshMoney();
}

async function sendInvoice(id) {
  const { error } = await supabaseClient.from("invoices").update({ status: "sent" }).eq("id", id);
  if (error) { toast("Couldn't send invoice: " + error.message, "error"); return; }
  await refreshMoney();
  copyInvoiceLink(id);
}

function copyInvoiceLink(id) {
  const invoice = moneyState.invoices.find((i) => i.id === id);
  const token = invoice?.public_token;
  if (!token) { toast("Save the invoice first", "error"); return; }
  const url = `${location.origin}${location.pathname.replace("money.html", "")}invoice.html?i=${token}`;
  navigator.clipboard.writeText(url).then(
    () => toast("Client link copied"),
    () => toast(url, "ok")
  );
}

/* ---- record payment ------------------------------------------------------ */

function openRecordPayment(invoiceId) {
  moneyState.paymentInvoiceId = invoiceId;
  document.getElementById("payment-amount").value = "";
  document.getElementById("payment-method").value = "bank_transfer";
  document.getElementById("payment-date").value = new Date().toISOString().slice(0, 10);
  document.getElementById("payment-notes").value = "";
  document.getElementById("record-payment-modal").classList.remove("hidden");
}

function closeRecordPayment() {
  document.getElementById("record-payment-modal").classList.add("hidden");
  moneyState.paymentInvoiceId = null;
}

async function saveRecordedPayment() {
  const invoice = moneyState.invoices.find((i) => i.id === moneyState.paymentInvoiceId);
  const amount = Number(document.getElementById("payment-amount").value);
  if (!invoice || !amount || amount <= 0) { toast("Enter a valid amount", "error"); return; }

  const { error } = await supabaseClient.from("transactions").insert({
    user_id: moneyState.userId,
    invoice_id: invoice.id,
    type: "payment",
    amount,
    currency: invoice.currency,
    provider: "manual",
    method: document.getElementById("payment-method").value,
    notes: document.getElementById("payment-notes").value.trim() || null,
    occurred_at: document.getElementById("payment-date").value || new Date().toISOString().slice(0, 10),
  });
  if (error) { toast("Couldn't record payment: " + error.message, "error"); return; }

  // Recompute this invoice's status from the ledger, now that a new
  // payment sits in it. The owner's own bookkeeping action is what
  // moves an invoice to partially_paid/paid, never a client click.
  await loadTransactions();
  const total = invoiceTotal(invoice);
  const paid = amountPaidFor(invoice.id);
  const newStatus = paid >= total - 0.005 ? "paid" : paid > 0 ? "partially_paid" : invoice.status;
  await supabaseClient.from("invoices").update({ status: newStatus }).eq("id", invoice.id);

  toast("Payment recorded");
  closeRecordPayment();
  await refreshMoney();
}

async function deleteTransaction(id) {
  if (!confirm("Delete this entry from the ledger?")) return;
  const { error } = await supabaseClient.from("transactions").delete().eq("id", id);
  if (error) { toast("Couldn't delete: " + error.message, "error"); return; }
  await refreshMoney();
}

/* ---- expenses ------------------------------------------------------------ */

function openExpenseModal() {
  document.getElementById("expense-category").value = "Software";
  document.getElementById("expense-amount").value = "";
  document.getElementById("expense-date").value = new Date().toISOString().slice(0, 10);
  document.getElementById("expense-receipt").value = "";
  document.getElementById("expense-notes").value = "";
  document.getElementById("expense-modal").classList.remove("hidden");
}

function closeExpenseModal() {
  document.getElementById("expense-modal").classList.add("hidden");
}

async function saveExpense() {
  const amount = Number(document.getElementById("expense-amount").value);
  if (!amount || amount <= 0) { toast("Enter a valid amount", "error"); return; }
  const { error } = await supabaseClient.from("transactions").insert({
    user_id: moneyState.userId,
    type: "expense",
    amount,
    currency: "NGN",
    category: document.getElementById("expense-category").value,
    receipt_url: document.getElementById("expense-receipt").value.trim() || null,
    notes: document.getElementById("expense-notes").value.trim() || null,
    occurred_at: document.getElementById("expense-date").value || new Date().toISOString().slice(0, 10),
  });
  if (error) { toast("Couldn't save expense: " + error.message, "error"); return; }
  toast("Expense saved");
  closeExpenseModal();
  await refreshMoney();
}

/* ---- PDF export (reuses js/pdf-export.js, same as proposals/documents) -- */

async function downloadInvoicePDF(id) {
  const invoice = moneyState.invoices.find((i) => i.id === id);
  if (!invoice) return;
  const rowsHTML = (invoice.line_items || []).map((item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    return `<tr>
      <td style="padding:8px; border-bottom:1px solid #eee">${escMoney(item.description)}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; text-align:right">${qty}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; text-align:right">${fmtMoney(price, invoice.currency)}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; text-align:right; font-weight:600">${fmtMoney(qty * price, invoice.currency)}</td>
    </tr>`;
  }).join("");
  const bodyHTML = `
    ${invoice.notes ? `<p style="margin:0 0 20px">${escMoney(invoice.notes)}</p>` : ""}
    <table style="width:100%; border-collapse:collapse; font-size:13px">
      <thead><tr>
        <th style="text-align:left; padding:8px; border-bottom:2px solid #1c1c1c; font-size:11.5px; color:#888; font-weight:600">Item</th>
        <th style="text-align:right; padding:8px; border-bottom:2px solid #1c1c1c; font-size:11.5px; color:#888; font-weight:600">Qty</th>
        <th style="text-align:right; padding:8px; border-bottom:2px solid #1c1c1c; font-size:11.5px; color:#888; font-weight:600">Price</th>
        <th style="text-align:right; padding:8px; border-bottom:2px solid #1c1c1c; font-size:11.5px; color:#888; font-weight:600">Total</th>
      </tr></thead>
      <tbody>${rowsHTML}</tbody>
    </table>
    <p style="text-align:right; font-size:16px; font-weight:700; margin-top:16px">Total: ${fmtMoney(invoiceTotal(invoice), invoice.currency)}</p>`;
  const html = buildDocumentShell({
    eyebrow: "Invoice",
    title: invoice.title,
    subtitle: invoice.client_name ? `Billed to ${invoice.client_name}` : "",
    accent: "teal",
    bodyHTML,
  });
  await exportHTMLToPDF(html, `${invoice.title}.pdf`);
}

/* ---- tabs ------------------------------------------------------------- */

function switchMoneyTab(tab) {
  document.querySelectorAll("[data-money-tab]").forEach((btn) => btn.dataset.active = String(btn.dataset.moneyTab === tab));
  document.querySelectorAll(".money-panel").forEach((panel) => panel.dataset.active = String(panel.id === `money-panel-${tab}`));
}

/* ---- wiring ------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", async () => {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    console.error("Money: couldn't confirm your session.", err);
    toast("Couldn't confirm your session, try reloading the page.", "error");
    return;
  }
  if (!session) return;
  moneyState.userId = session.user.id;

  document.querySelectorAll("[data-money-tab]").forEach((btn) => btn.addEventListener("click", () => switchMoneyTab(btn.dataset.moneyTab)));

  document.getElementById("invoice-new-btn")?.addEventListener("click", () => openInvoiceBuilder(null));
  document.querySelectorAll("[data-close-invoice-builder]").forEach((el) => el.addEventListener("click", closeInvoiceBuilder));
  document.getElementById("invoice-add-item-btn")?.addEventListener("click", addInvoiceItem);
  document.getElementById("invoice-currency")?.addEventListener("change", updateInvoiceBuilderTotal);
  document.getElementById("invoice-client-select")?.addEventListener("change", (e) => {
    const client = moneyState.clients.find((c) => c.id === e.target.value);
    if (client) {
      document.getElementById("invoice-client-name").value = client.name;
      document.getElementById("invoice-client-email").value = client.email || "";
    }
  });
  document.getElementById("invoice-save-btn")?.addEventListener("click", saveInvoice);
  document.getElementById("invoice-delete-btn")?.addEventListener("click", deleteInvoice);
  document.getElementById("invoice-items-list")?.addEventListener("input", (e) => {
    const row = e.target.closest("[data-item-id]");
    const field = e.target.dataset.field;
    if (!row || !field) return;
    const item = moneyState.builderItems.find((i) => i.id === row.dataset.itemId);
    if (!item) return;
    item[field] = field === "quantity" || field === "unit_price" ? Number(e.target.value) : e.target.value;
    updateInvoiceBuilderTotal();
  });
  document.getElementById("invoice-items-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-invoice-item]");
    if (btn) removeInvoiceItem(btn.dataset.removeInvoiceItem);
  });

  document.querySelectorAll("[data-close-record-payment]").forEach((el) => el.addEventListener("click", closeRecordPayment));
  document.getElementById("payment-save-btn")?.addEventListener("click", saveRecordedPayment);

  document.getElementById("expense-new-btn")?.addEventListener("click", openExpenseModal);
  document.querySelectorAll("[data-close-expense]").forEach((el) => el.addEventListener("click", closeExpenseModal));
  document.getElementById("expense-save-btn")?.addEventListener("click", saveExpense);

  document.getElementById("invoices-list")?.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-edit-invoice]");
    if (editBtn) { openInvoiceBuilder(editBtn.dataset.editInvoice); return; }
    const sendBtn = e.target.closest("[data-send-invoice]");
    if (sendBtn) { sendInvoice(sendBtn.dataset.sendInvoice); return; }
    const copyBtn = e.target.closest("[data-copy-invoice-link]");
    if (copyBtn) { copyInvoiceLink(copyBtn.dataset.copyInvoiceLink); return; }
    const payBtn = e.target.closest("[data-record-payment]");
    if (payBtn) { openRecordPayment(payBtn.dataset.recordPayment); return; }
    const pdfBtn = e.target.closest("[data-download-invoice-pdf]");
    if (pdfBtn) downloadInvoicePDF(pdfBtn.dataset.downloadInvoicePdf);
  });

  document.getElementById("expenses-list")?.addEventListener("click", (e) => {
    const delBtn = e.target.closest("[data-delete-transaction]");
    if (delBtn) deleteTransaction(delBtn.dataset.deleteTransaction);
  });

  document.getElementById("ledger-list")?.addEventListener("click", (e) => {
    const delBtn = e.target.closest("[data-delete-transaction]");
    if (delBtn) deleteTransaction(delBtn.dataset.deleteTransaction);
  });

  document.getElementById("profitability-list")?.addEventListener("change", async (e) => {
    const rateInput = e.target.closest("[data-set-rate]");
    if (!rateInput) return;
    const boardId = rateInput.dataset.setRate;
    const value = rateInput.value === "" ? null : Number(rateInput.value);
    const { error } = await supabaseClient.from("boards").update({ hourly_rate: value }).eq("id", boardId);
    if (error) { toast("Couldn't save rate: " + error.message, "error"); return; }
    const board = moneyState.boards.find((b) => b.id === boardId);
    if (board) board.hourly_rate = value;
    renderProfitability();
  });

  // Everything above is fully interactive without any network call -
  // same discipline the CV Builder bug fix established this project:
  // wire the UI unconditionally first, then let Supabase-dependent
  // loading fail safely into the "run this schema" notice rather than
  // silently freezing the whole page.
  try {
    await checkMoneyReady();
    if (moneyState.ready) await refreshMoney();
  } catch (err) {
    console.error("Money: couldn't load your data.", err);
    toast("Couldn't load Money data, try reloading the page.", "error");
  }
});
