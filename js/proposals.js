/* ==========================================================================
   BOARDLY - proposals.js  (Proposals / Quotes)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/proposals.js" defer></script>

   Needs supabase/schema_v59_proposals.sql run first.

   Phase 6 (Client/Business): the step before Client Portal or
   Marketplace even come into play - sending a prospective client a
   quote with line items and a total, and getting a clean accept/
   decline back. Deliberately NOT an invoice and processes no payment,
   same boundary Client Work's own notes already draw around its own
   fields. Two modals, same split as Custom Forms: #proposals-modal
   lists them and handles send/copy-link; #proposal-builder-modal is
   the actual line-item editor.
   ========================================================================== */

state.proposalsReady = false;
state.proposals = [];
state.proposalBuilderItems = [];   // line items being assembled in the open builder session
state.proposalBuilderStages = [];  // payment stages (schema_v72) being assembled in the open builder session
state.proposalEditingId = null;    // null while creating a new proposal; the proposal's id while editing one

// A payment stage's amount is always computed live from its percent
// times the current line-item total (same reasoning line_items itself
// uses for its own total), never stored, so it can't drift when line
// items change after a stage was added.
function proposalBuilderItemsTotal() {
  return state.proposalBuilderItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
}

// Feature groups (schema_v72) are edited as one line per category in a
// plain textarea, "Category: item one, item two", rather than a
// nested repeatable-field UI, which would need a lot more markup for
// something that's really just a short, skimmable list. Parsed to/from
// the { category, items:[] } array schema_v72 stores on save/load.
function parseFeatureGroupsText(text) {
  return String(text || "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const idx = line.indexOf(":");
    if (idx === -1) return { category: line, items: [] };
    return {
      category: line.slice(0, idx).trim(),
      items: line.slice(idx + 1).split(",").map((s) => s.trim()).filter(Boolean),
    };
  });
}

function featureGroupsToText(groups) {
  return (groups || []).map((g) => `${g.category}: ${(g.items || []).join(", ")}`).join("\n");
}

async function checkProposalsReady() {
  const { error } = await supabaseClient.from("proposals").select("id").limit(1);
  state.proposalsReady = !error;
  return state.proposalsReady;
}

async function loadProposals() {
  if (!state.proposalsReady || !state.currentBoardId) { state.proposals = []; renderProposalsList(); return; }
  const { data, error } = await supabaseClient
    .from("proposals")
    .select("*")
    .eq("board_id", state.currentBoardId)
    .order("created_at", { ascending: false });
  if (error) { console.warn("loadProposals:", error.message); return; }
  state.proposals = data || [];
  renderProposalsList();
}

function proposalTotal(proposal) {
  return (proposal.line_items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0), 0);
}

function formatProposalMoney(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "NGN" }).format(amount || 0);
  } catch {
    return `${currency || ""} ${(amount || 0).toFixed(2)}`;
  }
}

const PROPOSAL_STATUS_COLOR = { draft: "var(--ink-soft)", sent: "var(--orange)", accepted: "var(--teal)", declined: "var(--critical)" };
const PROPOSAL_STATUS_LABEL = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined" };

function renderProposalsList() {
  const list = document.getElementById("proposals-list");
  const empty = document.getElementById("proposals-empty");
  const notReady = document.getElementById("proposals-not-ready");
  if (!list) return;

  if (!state.proposalsReady) {
    list.innerHTML = "";
    empty.classList.add("hidden");
    notReady?.classList.remove("hidden");
    return;
  }
  notReady?.classList.add("hidden");

  if (!state.proposals.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  list.innerHTML = state.proposals.map((p) => `
    <div class="ticket p-3" data-id="${p.id}">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-semibold truncate">${escapeHTML(p.title)}</p>
          <p class="text-xs text-ink-soft mt-0.5">${p.client_name ? escapeHTML(p.client_name) + " - " : ""}${formatProposalMoney(proposalTotal(p), p.currency)} - <span style="color:${PROPOSAL_STATUS_COLOR[p.status]}">${PROPOSAL_STATUS_LABEL[p.status]}</span></p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          ${p.status !== "draft" ? `<button type="button" data-copy-proposal-link="${p.id}" title="Copy public link" class="text-ink-soft hover:text-orange"><i class="fa-solid fa-link"></i></button>` : ""}
          <button type="button" data-download-proposal-pdf="${p.id}" title="Download as a PDF" class="text-ink-soft hover:text-orange"><i class="fa-solid fa-file-pdf"></i></button>
          ${p.status === "draft" ? `<button type="button" data-send-proposal="${p.id}" title="Send (publish the link)" class="text-ink-soft hover:text-teal"><i class="fa-solid fa-paper-plane"></i></button>` : ""}
          <button type="button" data-edit-proposal="${p.id}" title="Edit" class="text-ink-soft hover:text-orange"><i class="fa-solid fa-pen text-xs"></i></button>
        </div>
      </div>
    </div>`).join("");
}

function renderProposalBuilderItems() {
  const list = document.getElementById("proposal-items-list");
  const empty = document.getElementById("proposal-items-empty");
  if (!list) return;
  if (!state.proposalBuilderItems.length) {
    list.innerHTML = "";
    empty?.classList.remove("hidden");
    updateProposalBuilderTotal();
    renderProposalBuilderStages();
    return;
  }
  empty?.classList.add("hidden");
  const currency = document.getElementById("proposal-currency")?.value || "NGN";
  list.innerHTML = state.proposalBuilderItems.map((item) => `
    <div class="flex items-center gap-2 border border-line rounded-lg px-2.5 py-1.5">
      <div class="min-w-0 flex-1">
        <p class="text-sm truncate">${escapeHTML(item.description)}</p>
        <p class="text-[11px] text-ink-soft">${item.quantity} x ${formatProposalMoney(item.unit_price, currency)} = ${formatProposalMoney(item.quantity * item.unit_price, currency)}</p>
      </div>
      <button type="button" data-remove-proposal-item="${item.id}" class="text-ink-soft hover:text-critical shrink-0"><i class="fa-solid fa-xmark"></i></button>
    </div>`).join("");
  updateProposalBuilderTotal();
  renderProposalBuilderStages();
}

function updateProposalBuilderTotal() {
  const currency = document.getElementById("proposal-currency")?.value || "NGN";
  const total = state.proposalBuilderItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const el = document.getElementById("proposal-builder-total");
  if (el) el.textContent = formatProposalMoney(total, currency);
}

function addProposalItem() {
  const descInput = document.getElementById("proposal-item-description");
  const description = descInput.value.trim();
  if (!description) { toast("Give the line item a description first", "error"); return; }
  const quantity = Number(document.getElementById("proposal-item-quantity").value) || 1;
  const unitPrice = Number(document.getElementById("proposal-item-price").value) || 0;

  state.proposalBuilderItems.push({ id: crypto.randomUUID(), description, quantity, unit_price: unitPrice });
  renderProposalBuilderItems();

  descInput.value = "";
  document.getElementById("proposal-item-quantity").value = "1";
  document.getElementById("proposal-item-price").value = "";
}

function removeProposalItem(id) {
  state.proposalBuilderItems = state.proposalBuilderItems.filter((i) => i.id !== id);
  renderProposalBuilderItems();
}

function renderProposalBuilderStages() {
  const list = document.getElementById("proposal-stages-list");
  const empty = document.getElementById("proposal-stages-empty");
  if (!list) return;
  if (!state.proposalBuilderStages.length) {
    list.innerHTML = "";
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");
  const currency = document.getElementById("proposal-currency")?.value || "NGN";
  const total = proposalBuilderItemsTotal();
  list.innerHTML = state.proposalBuilderStages.map((stage) => `
    <div class="flex items-center gap-2 border border-line rounded-lg px-2.5 py-1.5">
      <div class="min-w-0 flex-1">
        <p class="text-sm truncate">${escapeHTML(stage.label)}</p>
        <p class="text-[11px] text-ink-soft">${stage.percent}% = ${formatProposalMoney(total * stage.percent / 100, currency)}</p>
      </div>
      <button type="button" data-remove-proposal-stage="${stage.id}" class="text-ink-soft hover:text-critical shrink-0"><i class="fa-solid fa-xmark"></i></button>
    </div>`).join("");
}

function addProposalStage() {
  const labelInput = document.getElementById("proposal-stage-label");
  const label = labelInput.value.trim();
  if (!label) { toast("Give the payment stage a label first", "error"); return; }
  const percent = Number(document.getElementById("proposal-stage-percent").value) || 0;
  state.proposalBuilderStages.push({ id: crypto.randomUUID(), label, percent });
  renderProposalBuilderStages();
  labelInput.value = "";
  document.getElementById("proposal-stage-percent").value = "";
}

function removeProposalStage(id) {
  state.proposalBuilderStages = state.proposalBuilderStages.filter((s) => s.id !== id);
  renderProposalBuilderStages();
}

function openProposalBuilder(proposalId) {
  state.proposalEditingId = proposalId || null;
  const proposal = proposalId ? state.proposals.find((p) => p.id === proposalId) : null;

  document.getElementById("proposal-builder-title").textContent = proposal ? "Edit proposal" : "New proposal";
  document.getElementById("proposal-title-input").value = proposal?.title || "";
  document.getElementById("proposal-client-name").value = proposal?.client_name || "";
  document.getElementById("proposal-client-email").value = proposal?.client_email || "";
  document.getElementById("proposal-intro").value = proposal?.intro_text || "";
  document.getElementById("proposal-currency").value = proposal?.currency || "NGN";
  document.getElementById("proposal-delete-btn").classList.toggle("hidden", !proposal);
  document.getElementById("proposal-role").value = proposal?.prepared_by_role || "";
  document.getElementById("proposal-features").value = featureGroupsToText(proposal?.feature_groups);
  document.getElementById("proposal-why-price").value = proposal?.why_price_text || "";
  document.getElementById("proposal-timeline").value = proposal?.timeline_text || "";
  document.getElementById("proposal-notes").value = proposal?.notes_text || "";
  document.getElementById("proposal-closing").value = proposal?.closing_text || "";
  state.proposalBuilderItems = proposal ? JSON.parse(JSON.stringify(proposal.line_items || [])) : [];
  state.proposalBuilderStages = proposal ? JSON.parse(JSON.stringify(proposal.payment_stages || [])) : [];
  renderProposalBuilderItems();

  // Write-with-AI panel always starts closed and empty, every time the
  // builder opens. A leftover brief from a previous proposal has no
  // business surviving into this one.
  document.getElementById("proposal-ai-panel")?.classList.add("hidden");
  const briefEl = document.getElementById("proposal-ai-brief");
  if (briefEl) briefEl.value = "";
  const aiStatusEl = document.getElementById("proposal-ai-status");
  if (aiStatusEl) { aiStatusEl.textContent = ""; aiStatusEl.classList.add("hidden"); }

  document.getElementById("proposals-modal")?.classList.add("hidden");
  document.getElementById("proposal-builder-modal")?.classList.remove("hidden");
}

function closeProposalBuilder(reopenList = true) {
  document.getElementById("proposal-builder-modal")?.classList.add("hidden");
  state.proposalEditingId = null;
  state.proposalBuilderItems = [];
  state.proposalBuilderStages = [];
  if (reopenList) document.getElementById("proposals-modal")?.classList.remove("hidden");
}

async function saveProposal() {
  if (!state.proposalsReady) { toast("Run supabase/schema_v59_proposals.sql first", "error"); return; }
  const title = document.getElementById("proposal-title-input").value.trim();
  if (!title) { toast("Give the proposal a title first", "error"); return; }
  if (!state.proposalBuilderItems.length) { toast("Add at least one line item first", "error"); return; }

  const payload = {
    title,
    client_name: document.getElementById("proposal-client-name").value.trim(),
    client_email: document.getElementById("proposal-client-email").value.trim(),
    intro_text: document.getElementById("proposal-intro").value.trim(),
    currency: document.getElementById("proposal-currency").value,
    line_items: state.proposalBuilderItems,
    prepared_by_role: document.getElementById("proposal-role").value.trim(),
    feature_groups: parseFeatureGroupsText(document.getElementById("proposal-features").value),
    why_price_text: document.getElementById("proposal-why-price").value.trim(),
    timeline_text: document.getElementById("proposal-timeline").value.trim(),
    payment_stages: state.proposalBuilderStages,
    notes_text: document.getElementById("proposal-notes").value.trim(),
    closing_text: document.getElementById("proposal-closing").value.trim(),
  };

  if (state.proposalEditingId) {
    const { data, error } = await supabaseClient.from("proposals").update(payload).eq("id", state.proposalEditingId).select().single();
    if (error) { toast("Couldn't save: " + error.message, "error"); return; }
    state.proposals = state.proposals.map((p) => (p.id === data.id ? data : p));
  } else {
    const { data, error } = await supabaseClient.from("proposals").insert({
      user_id: state.userId, board_id: state.currentBoardId, ...payload,
    }).select().single();
    if (error) { toast("Couldn't save: " + error.message, "error"); return; }
    state.proposals.unshift(data);
  }
  renderProposalsList();
  closeProposalBuilder();
  toast("Proposal saved", "ok");
}

async function deleteProposal() {
  const id = state.proposalEditingId;
  if (!id) return;
  if (!confirm("Delete this proposal? If it's already been sent, the link will stop working.")) return;
  const { error } = await supabaseClient.from("proposals").delete().eq("id", id);
  if (error) { toast("Couldn't delete: " + error.message, "error"); return; }
  state.proposals = state.proposals.filter((p) => p.id !== id);
  renderProposalsList();
  closeProposalBuilder();
  toast("Proposal deleted", "ok");
}

// Sending is a one-way move from draft to sent - there's no "unsend"
// button, on purpose, matching the one-way accept/decline on the
// client's side (see respond-to-proposal's own comment on that).
// Editing is still technically possible afterward from this side, but
// doing so after a client has already seen a specific set of numbers
// is on the owner to communicate - Boardly doesn't silently lock the
// fields, it just doesn't pretend a "sent" proposal is still a draft.
async function sendProposal(id) {
  const proposal = state.proposals.find((p) => p.id === id);
  if (!proposal) return;
  if (!confirm("Send this proposal? This publishes its public link so the client can view and respond to it.")) return;
  const { data, error } = await supabaseClient.from("proposals").update({ status: "sent" }).eq("id", id).select().single();
  if (error) { toast("Couldn't send: " + error.message, "error"); return; }
  state.proposals = state.proposals.map((p) => (p.id === id ? data : p));
  renderProposalsList();
  await copyProposalLink(id);
  toast("Proposal sent - link copied", "ok");
}

async function copyProposalLink(id) {
  const proposal = state.proposals.find((p) => p.id === id);
  if (!proposal) return;
  const url = new URL("proposal.html", window.location.href);
  url.searchParams.set("p", proposal.public_token);
  try {
    await navigator.clipboard.writeText(url.toString());
    toast("Proposal link copied", "ok");
  } catch {
    window.prompt("Copy this proposal link:", url.toString());
  }
}

// A formatted copy of the proposal itself - title, intro, line items,
// and the total - the same content the public proposal.html page shows
// a client, just rendered straight to a PDF instead of a web page.
// Works on a draft too (useful for reviewing one before it's sent).
async function downloadProposalPDF(id) {
  const proposal = state.proposals.find((p) => p.id === id);
  if (!proposal) return;
  const currency = proposal.currency || "NGN";
  const rowsHTML = (proposal.line_items || []).map((item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    return `<tr>
      <td style="padding:8px; border-bottom:1px solid #eee">${escapeHTML(item.description)}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; text-align:right">${qty}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; text-align:right">${formatProposalMoney(price, currency)}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; text-align:right; font-weight:600">${formatProposalMoney(qty * price, currency)}</td>
    </tr>`;
  }).join("");

  const total = proposalTotal(proposal);

  // Feature groups (schema_v72): a category heading plus a plain
  // bullet list per category, mirroring the sample quotation layout
  // Charles asked for. Renders nothing at all when a proposal has no
  // feature groups saved (every proposal from before this migration,
  // or anyone who just skips the field), so the plain line-item-only
  // layout this already was keeps working exactly as before.
  const featureGroupsHTML = (proposal.feature_groups || []).length ? `
    <h3 style="font-family:'Fraunces',Georgia,serif; font-size:15px; margin:26px 0 10px; color:#1c1c1c">What's included</h3>
    ${(proposal.feature_groups || []).map((g) => `
      <div style="margin-bottom:12px">
        <p style="font-size:12.5px; font-weight:700; margin:0 0 4px; color:#1c1c1c">${escapeHTML(g.category)}</p>
        <ul style="margin:0; padding-left:18px; font-size:12.5px; color:#333">
          ${(g.items || []).map((item) => `<li style="margin-bottom:2px">${escapeHTML(item)}</li>`).join("")}
        </ul>
      </div>`).join("")}` : "";

  const whyPriceHTML = proposal.why_price_text ? `
    <h3 style="font-family:'Fraunces',Georgia,serif; font-size:15px; margin:26px 0 8px; color:#1c1c1c">Why the cost is ${formatProposalMoney(total, currency)}</h3>
    <p style="margin:0; white-space:pre-line">${escapeHTML(proposal.why_price_text)}</p>` : "";

  const timelineHTML = proposal.timeline_text ? `
    <h3 style="font-family:'Fraunces',Georgia,serif; font-size:15px; margin:26px 0 8px; color:#1c1c1c">Estimated timeline</h3>
    <p style="margin:0">${escapeHTML(proposal.timeline_text)}</p>` : "";

  // Payment stages (schema_v72): each stage's amount is computed here
  // from its stored percent times the live total, never stored itself,
  // so it's never possible for a stage amount to disagree with the
  // line items it was actually built from.
  const stages = proposal.payment_stages || [];
  const paymentStagesHTML = stages.length ? `
    <h3 style="font-family:'Fraunces',Georgia,serif; font-size:15px; margin:26px 0 8px; color:#1c1c1c">Payment structure</h3>
    <table style="width:100%; border-collapse:collapse; font-size:13px">
      <tbody>
        ${stages.map((s) => `<tr>
          <td style="padding:6px 8px; border-bottom:1px solid #eee">${escapeHTML(s.label)} (${Number(s.percent) || 0}%)</td>
          <td style="padding:6px 8px; border-bottom:1px solid #eee; text-align:right; font-weight:600">${formatProposalMoney(total * (Number(s.percent) || 0) / 100, currency)}</td>
        </tr>`).join("")}
      </tbody>
    </table>` : "";

  const notesHTML = proposal.notes_text ? `
    <h3 style="font-family:'Fraunces',Georgia,serif; font-size:15px; margin:26px 0 8px; color:#1c1c1c">Notes</h3>
    <p style="margin:0; white-space:pre-line">${escapeHTML(proposal.notes_text)}</p>` : "";

  const closingHTML = proposal.closing_text ? `
    <p style="margin:26px 0 0; padding-top:16px; border-top:1px solid #eee; font-style:italic; white-space:pre-line">${escapeHTML(proposal.closing_text)}</p>` : "";

  const bodyHTML = `
    ${proposal.prepared_by_role ? `<p style="margin:0 0 4px; font-size:12px; color:#888">Prepared by ${escapeHTML(proposal.prepared_by_role)}</p>` : ""}
    ${proposal.intro_text ? `<p style="margin:0 0 20px">${escapeHTML(proposal.intro_text)}</p>` : ""}
    ${featureGroupsHTML}
    <h3 style="font-family:'Fraunces',Georgia,serif; font-size:15px; margin:26px 0 10px; color:#1c1c1c">Cost breakdown</h3>
    <table style="width:100%; border-collapse:collapse; font-size:13px">
      <thead>
        <tr>
          <th style="text-align:left; padding:8px; border-bottom:2px solid #1c1c1c; font-size:11.5px; color:#888; font-weight:600">Item</th>
          <th style="text-align:right; padding:8px; border-bottom:2px solid #1c1c1c; font-size:11.5px; color:#888; font-weight:600">Qty</th>
          <th style="text-align:right; padding:8px; border-bottom:2px solid #1c1c1c; font-size:11.5px; color:#888; font-weight:600">Price</th>
          <th style="text-align:right; padding:8px; border-bottom:2px solid #1c1c1c; font-size:11.5px; color:#888; font-weight:600">Total</th>
        </tr>
      </thead>
      <tbody>${rowsHTML}</tbody>
    </table>
    <p style="text-align:right; font-size:16px; font-weight:700; margin-top:16px">Total: ${formatProposalMoney(total, currency)}</p>
    ${whyPriceHTML}
    ${timelineHTML}
    ${paymentStagesHTML}
    ${notesHTML}
    ${closingHTML}`;

  const html = buildDocumentShell({
    eyebrow: "Proposal",
    title: proposal.title,
    subtitle: proposal.client_name ? `Prepared for ${proposal.client_name}` : "",
    accent: "violet",
    bodyHTML,
  });

  try {
    await exportHTMLToPDF(html, `${proposal.title}.pdf`);
  } catch (err) {
    console.error("downloadProposalPDF failed:", err);
    toast("Couldn't create the PDF: " + (err.message || "unknown error"), "error");
  }
}

// Write with AI (schema_v72 + generate-proposal-draft edge function):
// takes a short plain-English brief and writes a full draft into every
// field in the builder: feature groups, cost breakdown, why-price,
// timeline, payment stages, notes, closing. Nothing is saved or sent
// by this call itself; it only fills in form fields the person still
// has to review and click "Save proposal" on, same "AI proposes, you
// approve" boundary as the board's own Ask AI panel.
async function generateProposalDraft() {
  const briefEl = document.getElementById("proposal-ai-brief");
  const brief = briefEl?.value.trim();
  if (!brief) { toast("Describe the project first", "error"); return; }

  const genBtn = document.getElementById("proposal-ai-generate-btn");
  const statusEl = document.getElementById("proposal-ai-status");
  if (genBtn) genBtn.disabled = true;
  if (statusEl) { statusEl.textContent = "Writing a draft…"; statusEl.classList.remove("hidden"); }

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const { data, error } = await supabaseClient.functions.invoke("generate-proposal-draft", {
      body: {
        brief,
        currency: document.getElementById("proposal-currency")?.value || "NGN",
        clientName: document.getElementById("proposal-client-name")?.value.trim() || "",
      },
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    });
    if (error || !data?.draft) throw new Error(data?.error || error?.message || "Couldn't write a draft.");
    applyProposalDraft(data.draft);
    if (statusEl) statusEl.textContent = "Draft written below, review everything before saving.";
    toast("Draft written, review it below", "ok");
  } catch (err) {
    if (statusEl) { statusEl.textContent = ""; statusEl.classList.add("hidden"); }
    toast("Couldn't write a draft: " + (err.message || "unknown error"), "error");
  } finally {
    if (genBtn) genBtn.disabled = false;
  }
}

function applyProposalDraft(draft) {
  if (draft.title) document.getElementById("proposal-title-input").value = draft.title;
  if (draft.intro_text) document.getElementById("proposal-intro").value = draft.intro_text;
  if (draft.prepared_by_role) document.getElementById("proposal-role").value = draft.prepared_by_role;
  if (Array.isArray(draft.feature_groups) && draft.feature_groups.length) {
    document.getElementById("proposal-features").value = featureGroupsToText(draft.feature_groups);
  }
  if (draft.why_price_text) document.getElementById("proposal-why-price").value = draft.why_price_text;
  if (draft.timeline_text) document.getElementById("proposal-timeline").value = draft.timeline_text;
  if (draft.notes_text) document.getElementById("proposal-notes").value = draft.notes_text;
  if (draft.closing_text) document.getElementById("proposal-closing").value = draft.closing_text;

  if (Array.isArray(draft.line_items) && draft.line_items.length) {
    state.proposalBuilderItems = draft.line_items.map((item) => ({
      id: crypto.randomUUID(),
      description: String(item.description || "").slice(0, 150),
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.unit_price) || 0,
    }));
  }
  if (Array.isArray(draft.payment_stages) && draft.payment_stages.length) {
    state.proposalBuilderStages = draft.payment_stages.map((s) => ({
      id: crypto.randomUUID(),
      label: String(s.label || "").slice(0, 100),
      percent: Number(s.percent) || 0,
    }));
  }
  renderProposalBuilderItems(); // also re-renders stages, see its own comment
}

document.addEventListener("DOMContentLoaded", async () => {
  await checkProposalsReady();

  const listModal = document.getElementById("proposals-modal");
  document.getElementById("proposals-btn")?.addEventListener("click", async () => {
    listModal?.classList.remove("hidden");
    await loadProposals();
  });
  document.querySelectorAll("[data-close-proposals]").forEach((el) => el.addEventListener("click", () => listModal?.classList.add("hidden")));
  document.querySelectorAll("[data-close-proposal-builder]").forEach((el) => el.addEventListener("click", () => closeProposalBuilder()));

  document.getElementById("proposal-new-btn")?.addEventListener("click", () => openProposalBuilder(null));
  document.getElementById("proposal-add-item-btn")?.addEventListener("click", addProposalItem);
  document.getElementById("proposal-currency")?.addEventListener("change", renderProposalBuilderItems);
  document.getElementById("proposal-save-btn")?.addEventListener("click", saveProposal);
  document.getElementById("proposal-delete-btn")?.addEventListener("click", deleteProposal);
  document.getElementById("proposal-add-stage-btn")?.addEventListener("click", addProposalStage);

  document.getElementById("proposal-ai-btn")?.addEventListener("click", () => {
    document.getElementById("proposal-ai-panel")?.classList.toggle("hidden");
  });
  document.getElementById("proposal-ai-generate-btn")?.addEventListener("click", generateProposalDraft);

  document.getElementById("proposal-items-list")?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-remove-proposal-item]");
    if (removeBtn) removeProposalItem(removeBtn.dataset.removeProposalItem);
  });

  document.getElementById("proposal-stages-list")?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-remove-proposal-stage]");
    if (removeBtn) removeProposalStage(removeBtn.dataset.removeProposalStage);
  });

  document.getElementById("proposals-list")?.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-edit-proposal]");
    if (editBtn) { openProposalBuilder(editBtn.dataset.editProposal); return; }
    const sendBtn = e.target.closest("[data-send-proposal]");
    if (sendBtn) { sendProposal(sendBtn.dataset.sendProposal); return; }
    const copyBtn = e.target.closest("[data-copy-proposal-link]");
    if (copyBtn) { copyProposalLink(copyBtn.dataset.copyProposalLink); return; }
    const downloadBtn = e.target.closest("[data-download-proposal-pdf]");
    if (downloadBtn) downloadProposalPDF(downloadBtn.dataset.downloadProposalPdf);
  });
});
