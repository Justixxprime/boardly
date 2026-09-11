/* ==========================================================================
   BOARDLY 2.0: js/clients.js
   --------------------------------------------------------------------------
   Powers clients.html. Standalone page, own small state, same pattern as
   money.js and cv-builder.js. Needs schema_v64_clients.sql run first.

   The per-client Billed/Received/Outstanding numbers are a plain sum
   over that client's linked invoices and confirmed transactions, the
   same computed-not-AI approach money.js uses for its own summary
   strip. This is not a "client health score," it is arithmetic.
   ========================================================================== */

const clientsState = {
  userId: null,
  ready: false,
  clients: [],
  invoices: [],
  transactions: [],
  editingClientId: null,
};

function escClient(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function fmtClientMoney(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "NGN" }).format(amount || 0);
  } catch {
    return `${currency || ""} ${(amount || 0).toFixed(2)}`;
  }
}

async function checkClientsReady() {
  const { error } = await supabaseClient.from("clients").select("id").limit(1);
  clientsState.ready = !error;
  document.getElementById("clients-not-ready")?.classList.toggle("hidden", clientsState.ready);
  return clientsState.ready;
}

async function loadClientsData() {
  if (!clientsState.ready) return;
  const [clientsRes, invoicesRes, transactionsRes] = await Promise.all([
    supabaseClient.from("clients").select("*").order("name", { ascending: true }),
    supabaseClient.from("invoices").select("id, client_id, title, currency, line_items, status, due_date"),
    supabaseClient.from("transactions").select("invoice_id, type, amount, status").eq("status", "confirmed").in("type", ["payment", "refund"]),
  ]);
  clientsState.clients = clientsRes.data || [];
  clientsState.invoices = invoicesRes.data || [];
  clientsState.transactions = transactionsRes.data || [];
}

function invoiceLineTotal(invoice) {
  return (invoice.line_items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0), 0);
}

function paidForInvoice(invoiceId) {
  return clientsState.transactions
    .filter((t) => t.invoice_id === invoiceId)
    .reduce((sum, t) => sum + (t.type === "payment" ? Number(t.amount) : -Number(t.amount)), 0);
}

function summaryForClient(clientId) {
  const invoices = clientsState.invoices.filter((inv) => inv.client_id === clientId);
  let billed = 0, received = 0;
  invoices.forEach((inv) => {
    const total = invoiceLineTotal(inv);
    billed += total;
    received += paidForInvoice(inv.id);
  });
  return { count: invoices.length, billed, received, outstanding: Math.max(billed - received, 0), invoices };
}

function renderClients() {
  const list = document.getElementById("clients-list");
  const empty = document.getElementById("clients-empty");
  if (!clientsState.clients.length) { list.innerHTML = ""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");
  list.innerHTML = clientsState.clients.map((client) => {
    const summary = summaryForClient(client.id);
    const currency = summary.invoices[0]?.currency || "NGN";
    return `<tr class="cursor-pointer" data-view-client="${client.id}">
      <td><span class="font-medium">${escClient(client.name)}</span>${client.company ? `<br><span class="text-xs text-ink-soft">${escClient(client.company)}</span>` : ""}</td>
      <td>${escClient(client.email || client.phone || "")}</td>
      <td class="table-num">${summary.count}</td>
      <td class="table-num">${fmtClientMoney(summary.billed, currency)}</td>
      <td class="table-num" style="color:${summary.outstanding > 0.005 ? "var(--warning)" : "var(--ink-soft)"}">${fmtClientMoney(summary.outstanding, currency)}</td>
      <td class="text-right"><button type="button" class="btn-icon-xs" title="Edit" data-edit-client="${client.id}"><i class="fa-solid fa-pen"></i></button></td>
    </tr>`;
  }).join("");
}

/* ---- add/edit modal ------------------------------------------------------ */

function openClientModal(id) {
  clientsState.editingClientId = id;
  const client = id ? clientsState.clients.find((c) => c.id === id) : null;
  document.getElementById("client-modal-title").textContent = client ? "Edit client" : "New client";
  document.getElementById("client-name-input").value = client?.name || "";
  document.getElementById("client-email-input").value = client?.email || "";
  document.getElementById("client-phone-input").value = client?.phone || "";
  document.getElementById("client-company-input").value = client?.company || "";
  document.getElementById("client-notes-input").value = client?.notes || "";
  document.getElementById("client-delete-btn").classList.toggle("hidden", !client);
  document.getElementById("client-modal").classList.remove("hidden");
}

function closeClientModal() {
  document.getElementById("client-modal").classList.add("hidden");
  clientsState.editingClientId = null;
}

async function saveClient() {
  const name = document.getElementById("client-name-input").value.trim();
  if (!name) { toast("Enter a name", "error"); return; }
  const payload = {
    user_id: clientsState.userId,
    name,
    email: document.getElementById("client-email-input").value.trim() || null,
    phone: document.getElementById("client-phone-input").value.trim() || null,
    company: document.getElementById("client-company-input").value.trim() || null,
    notes: document.getElementById("client-notes-input").value.trim() || null,
  };
  let error;
  if (clientsState.editingClientId) {
    ({ error } = await supabaseClient.from("clients").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", clientsState.editingClientId));
  } else {
    ({ error } = await supabaseClient.from("clients").insert(payload));
  }
  if (error) { toast("Couldn't save client: " + error.message, "error"); return; }
  toast("Client saved");
  closeClientModal();
  await refreshClients();
}

async function deleteClient() {
  if (!clientsState.editingClientId) return;
  if (!confirm("Delete this client? Invoices already billed to them keep their own name and email, they just stop linking to this record.")) return;
  const { error } = await supabaseClient.from("clients").delete().eq("id", clientsState.editingClientId);
  if (error) { toast("Couldn't delete client: " + error.message, "error"); return; }
  toast("Client deleted");
  closeClientModal();
  await refreshClients();
}

/* ---- detail view ---------------------------------------------------------- */

function openClientDetail(id) {
  const client = clientsState.clients.find((c) => c.id === id);
  if (!client) return;
  const summary = summaryForClient(id);
  const currency = summary.invoices[0]?.currency || "NGN";

  document.getElementById("client-detail-name").textContent = client.name;
  document.getElementById("client-detail-contact").textContent = [client.email, client.phone].filter(Boolean).join(" | ") || "No contact info yet";
  document.getElementById("client-detail-billed").textContent = fmtClientMoney(summary.billed, currency);
  document.getElementById("client-detail-received").textContent = fmtClientMoney(summary.received, currency);
  document.getElementById("client-detail-outstanding").textContent = fmtClientMoney(summary.outstanding, currency);

  const invoicesEl = document.getElementById("client-detail-invoices");
  invoicesEl.innerHTML = summary.invoices.length
    ? summary.invoices.map((inv) => `<div class="flex items-center justify-between text-sm py-1.5 border-b border-line last:border-0">
        <span>${escClient(inv.title)}</span>
        <span class="text-ink-soft">${fmtClientMoney(invoiceLineTotal(inv), inv.currency)}</span>
      </div>`).join("")
    : `<p class="text-sm text-ink-soft">No invoices linked to this client yet.</p>`;

  const notesEl = document.getElementById("client-detail-notes");
  if (client.notes) { notesEl.textContent = client.notes; notesEl.classList.remove("hidden"); }
  else { notesEl.classList.add("hidden"); }

  document.getElementById("client-detail-modal").classList.remove("hidden");
}

/* ---- refresh + wiring ------------------------------------------------------ */

async function refreshClients() {
  await loadClientsData();
  renderClients();
}

document.addEventListener("DOMContentLoaded", async () => {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    console.error("Clients: couldn't confirm your session.", err);
    toast("Couldn't confirm your session, try reloading the page.", "error");
    return;
  }
  if (!session) return;
  clientsState.userId = session.user.id;

  document.getElementById("client-new-btn")?.addEventListener("click", () => openClientModal(null));
  document.querySelectorAll("[data-close-client]").forEach((el) => el.addEventListener("click", closeClientModal));
  document.getElementById("client-save-btn")?.addEventListener("click", saveClient);
  document.getElementById("client-delete-btn")?.addEventListener("click", deleteClient);
  document.querySelectorAll("[data-close-client-detail]").forEach((el) => el.addEventListener("click", () => document.getElementById("client-detail-modal").classList.add("hidden")));

  document.getElementById("clients-list")?.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-edit-client]");
    if (editBtn) { openClientModal(editBtn.dataset.editClient); return; }
    const row = e.target.closest("[data-view-client]");
    if (row) openClientDetail(row.dataset.viewClient);
  });

  try {
    await checkClientsReady();
    if (clientsState.ready) await refreshClients();
  } catch (err) {
    console.error("Clients: couldn't load your data.", err);
    toast("Couldn't load Clients data, try reloading the page.", "error");
  }
});
