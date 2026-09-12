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
  pipelineReady: false,  // whether clients.pipeline_stage exists yet (schema_v66)
  activeTab: "active",   // active | leads | all
  clients: [],
  invoices: [],
  transactions: [],
  editingClientId: null,
};

const STAGE_LABEL = {
  new: "New", contacted: "Contacted", qualified: "Qualified", proposal: "Proposal",
  negotiation: "Negotiation", won: "Won", onboarding: "Onboarding", active_client: "Active client",
};
const STAGE_COLOR = {
  new: "var(--ink-soft)", contacted: "var(--info)", qualified: "var(--violet)", proposal: "var(--warning)",
  negotiation: "var(--warning)", won: "var(--secondary)", onboarding: "var(--secondary)", active_client: "var(--secondary)",
};
const LEAD_STAGES = ["new", "contacted", "qualified", "proposal", "negotiation"];

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
  if (!clientsState.ready) return false;

  const { error: stageError } = await supabaseClient.from("clients").select("pipeline_stage").limit(1);
  clientsState.pipelineReady = !stageError;
  document.getElementById("pipeline-not-ready")?.classList.toggle("hidden", clientsState.pipelineReady);
  return true;
}

async function loadClientsData() {
  if (!clientsState.ready) return;
  const [clientsRes, invoicesRes, transactionsRes] = await Promise.all([
    supabaseClient.from("clients").select("*").order("name", { ascending: true }),
    supabaseClient.from("invoices").select("id, client_id, client_name, title, currency, line_items, status, due_date, viewed_at, issue_date, created_at"),
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

function clientsForActiveTab() {
  if (!clientsState.pipelineReady || clientsState.activeTab === "all") return clientsState.clients;
  if (clientsState.activeTab === "leads") return clientsState.clients.filter((c) => LEAD_STAGES.includes(c.pipeline_stage));
  return clientsState.clients.filter((c) => !LEAD_STAGES.includes(c.pipeline_stage)); // "active": won, onboarding, active_client
}

function renderClients() {
  const list = document.getElementById("clients-list");
  const empty = document.getElementById("clients-empty");
  const visible = clientsForActiveTab();
  if (!visible.length) { list.innerHTML = ""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");
  list.innerHTML = visible.map((client) => {
    const summary = summaryForClient(client.id);
    const currency = summary.invoices[0]?.currency || "NGN";
    const stage = client.pipeline_stage || "active_client";
    const stageCell = clientsState.pipelineReady
      ? `<select class="input text-xs" style="padding:.25rem .4rem" data-set-stage="${client.id}">
          ${Object.keys(STAGE_LABEL).map((s) => `<option value="${s}" ${s === stage ? "selected" : ""}>${STAGE_LABEL[s]}</option>`).join("")}
        </select>`
      : `<span class="badge" style="color:${STAGE_COLOR.active_client}">Active client</span>`;
    return `<tr class="cursor-pointer" data-view-client="${client.id}">
      <td><span class="font-medium">${escClient(client.name)}</span>${client.company ? `<br><span class="text-xs text-ink-soft">${escClient(client.company)}</span>` : ""}</td>
      <td>${escClient(client.email || client.phone || "")}</td>
      <td onclick="event.stopPropagation()">${stageCell}</td>
      <td class="table-num">${summary.count}</td>
      <td class="table-num">${fmtClientMoney(summary.billed, currency)}</td>
      <td class="table-num" style="color:${summary.outstanding > 0.005 ? "var(--warning)" : "var(--ink-soft)"}">${fmtClientMoney(summary.outstanding, currency)}</td>
      <td class="text-right"><button type="button" class="btn-icon-xs" title="Edit" data-edit-client="${client.id}"><i class="fa-solid fa-pen"></i></button></td>
    </tr>`;
  }).join("");
}

/* ---- add/edit modal ------------------------------------------------------ */

function openClientModal(id, defaultStage) {
  clientsState.editingClientId = id;
  const client = id ? clientsState.clients.find((c) => c.id === id) : null;
  document.getElementById("client-modal-title").textContent = client ? "Edit client" : defaultStage === "new" ? "New lead" : "New client";
  document.getElementById("client-name-input").value = client?.name || "";
  document.getElementById("client-email-input").value = client?.email || "";
  document.getElementById("client-phone-input").value = client?.phone || "";
  document.getElementById("client-company-input").value = client?.company || "";
  document.getElementById("client-notes-input").value = client?.notes || "";
  document.getElementById("client-stage-input").value = client?.pipeline_stage || defaultStage || "active_client";
  document.getElementById("client-stage-input").closest("div").classList.toggle("hidden", !clientsState.pipelineReady);
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
  if (clientsState.pipelineReady) {
    payload.pipeline_stage = document.getElementById("client-stage-input").value;
  }
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
  const stage = client.pipeline_stage || "active_client";
  const stageBadge = document.getElementById("client-detail-stage");
  if (clientsState.pipelineReady) {
    stageBadge.textContent = STAGE_LABEL[stage];
    stageBadge.style.color = STAGE_COLOR[stage];
    stageBadge.style.background = `color-mix(in srgb, ${STAGE_COLOR[stage]} 14%, transparent)`;
    stageBadge.classList.remove("hidden");
  } else {
    stageBadge.classList.add("hidden");
  }
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

/* ---- follow-ups (Section 15) --------------------------------------------
   Deterministic, not AI: an invoice qualifies once it has been sent (or
   viewed) and is still unpaid after a fixed threshold, 5 days, the same
   kind of stated fixed cutoff Money's Profitability tab uses for its
   margin bands. This only ever produces a DRAFT the owner can edit or
   discard, it never sends anything itself, matching Section 15's "never
   automatically spam clients without explicit user configuration." --- */

const FOLLOWUP_THRESHOLD_DAYS = 5;

function daysSince(dateString) {
  if (!dateString) return null;
  const then = new Date(dateString).getTime();
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

function followUpCandidates() {
  return clientsState.invoices
    .filter((inv) => ["sent", "viewed", "partially_paid", "overdue"].includes(inv.status))
    .map((inv) => {
      const balance = Math.max(invoiceLineTotal(inv) - paidForInvoice(inv.id), 0);
      const referenceDate = inv.viewed_at || inv.issue_date || inv.created_at;
      const days = daysSince(referenceDate);
      return { invoice: inv, balance, days };
    })
    .filter((c) => c.balance > 0.005 && c.days !== null && c.days >= FOLLOWUP_THRESHOLD_DAYS)
    .sort((a, b) => b.days - a.days);
}

function renderFollowUps() {
  const list = document.getElementById("followups-list");
  const empty = document.getElementById("followups-empty");
  const candidates = followUpCandidates();
  if (!candidates.length) { list.innerHTML = ""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");
  list.innerHTML = candidates.map(({ invoice, balance, days }) => {
    const client = clientsState.clients.find((c) => c.id === invoice.client_id);
    const clientName = client?.name || invoice.client_name || "this client";
    return `<div class="ticket p-3 flex items-center justify-between gap-3">
      <div>
        <p class="font-medium text-sm">${escClient(invoice.title)}</p>
        <p class="text-xs text-ink-soft">${escClient(clientName)}, ${fmtClientMoney(balance, invoice.currency)} outstanding, sent ${days} day${days === 1 ? "" : "s"} ago</p>
      </div>
      <button type="button" class="btn text-xs whitespace-nowrap" data-draft-followup="${invoice.id}">Draft follow-up</button>
    </div>`;
  }).join("");
}

function openFollowUpDraft(invoiceId) {
  const invoice = clientsState.invoices.find((i) => i.id === invoiceId);
  if (!invoice) return;
  const client = clientsState.clients.find((c) => c.id === invoice.client_id);
  const clientName = client?.name || invoice.client_name || "there";
  const balance = Math.max(invoiceLineTotal(invoice) - paidForInvoice(invoice.id), 0);
  const days = daysSince(invoice.viewed_at || invoice.issue_date || invoice.created_at);

  const draft = `Hi ${clientName},

Just following up on invoice "${invoice.title}" for ${fmtClientMoney(balance, invoice.currency)}, sent ${days} day${days === 1 ? "" : "s"} ago. Let me know if you have any questions, or if there is anything holding up payment on your end.

Thanks!`;

  document.getElementById("followup-draft-text").value = draft;
  document.getElementById("followup-modal").classList.remove("hidden");
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

  document.getElementById("client-new-btn")?.addEventListener("click", () => openClientModal(null, "active_client"));
  document.getElementById("lead-new-btn")?.addEventListener("click", () => openClientModal(null, "new"));
  document.querySelectorAll("[data-close-client]").forEach((el) => el.addEventListener("click", closeClientModal));
  document.getElementById("client-save-btn")?.addEventListener("click", saveClient);
  document.getElementById("client-delete-btn")?.addEventListener("click", deleteClient);
  document.querySelectorAll("[data-close-client-detail]").forEach((el) => el.addEventListener("click", () => document.getElementById("client-detail-modal").classList.add("hidden")));

  document.querySelectorAll("[data-clients-tab]").forEach((btn) => btn.addEventListener("click", () => {
    clientsState.activeTab = btn.dataset.clientsTab;
    document.querySelectorAll("[data-clients-tab]").forEach((b) => b.dataset.active = String(b === btn));
    const isFollowUps = clientsState.activeTab === "followups";
    document.getElementById("clients-table-view").classList.toggle("hidden", isFollowUps);
    document.getElementById("followups-view").classList.toggle("hidden", !isFollowUps);
    if (isFollowUps) renderFollowUps(); else renderClients();
  }));

  document.getElementById("followups-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-draft-followup]");
    if (btn) openFollowUpDraft(btn.dataset.draftFollowup);
  });
  document.querySelectorAll("[data-close-followup]").forEach((el) => el.addEventListener("click", () => document.getElementById("followup-modal").classList.add("hidden")));
  document.getElementById("followup-copy-btn")?.addEventListener("click", () => {
    const text = document.getElementById("followup-draft-text").value;
    navigator.clipboard.writeText(text).then(
      () => toast("Draft copied"),
      () => toast("Couldn't copy, select the text manually", "error")
    );
  });

  document.getElementById("clients-list")?.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-edit-client]");
    if (editBtn) { openClientModal(editBtn.dataset.editClient); return; }
    const row = e.target.closest("[data-view-client]");
    if (row) openClientDetail(row.dataset.viewClient);
  });

  document.getElementById("clients-list")?.addEventListener("change", async (e) => {
    const stageSelect = e.target.closest("[data-set-stage]");
    if (!stageSelect) return;
    const clientId = stageSelect.dataset.setStage;
    const { error } = await supabaseClient.from("clients").update({ pipeline_stage: stageSelect.value }).eq("id", clientId);
    if (error) { toast("Couldn't update stage: " + error.message, "error"); return; }
    const client = clientsState.clients.find((c) => c.id === clientId);
    if (client) client.pipeline_stage = stageSelect.value;
    renderClients();
  });

  try {
    await checkClientsReady();
    if (clientsState.ready) await refreshClients();
  } catch (err) {
    console.error("Clients: couldn't load your data.", err);
    toast("Couldn't load Clients data, try reloading the page.", "error");
  }
});
