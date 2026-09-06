/* ==========================================================================
   BOARDLY - approval-workflow.js  (schema_v56_approval_workflow.sql)
   --------------------------------------------------------------------------
   Phase 3 of the master build spec: "Create a proper approval workflow...
   Approval history must be stored." Internal team review - one teammate
   submits, another (or the board owner) approves or requests changes.
   Deliberately separate from the Client Portal's client-facing
   approve/changes_requested (schema_v27) - different people reviewing
   for a different reason.

   Every action here gets a toast, success or failure - submitting,
   approving, and requesting changes are all real decisions someone is
   making, and none of them should ever happen silently.
   ========================================================================== */

state.approvalReady = false;
state.editingApprovalHistory = [];

const APPROVAL_LABEL = { submitted: "Waiting for approval", approved: "Approved", changes_requested: "Changes requested" };
const APPROVAL_COLOR = { submitted: "var(--orange)", approved: "var(--teal)", changes_requested: "var(--critical)" };
const APPROVAL_ICON = { submitted: "fa-hourglass-half", approved: "fa-circle-check", changes_requested: "fa-triangle-exclamation" };

async function checkApprovalReady() {
  const { error } = await supabaseClient.from("approval_history").select("id").limit(1);
  state.approvalReady = !error;
  return state.approvalReady;
}

async function loadApprovalHistory(taskId) {
  if (!state.approvalReady) { state.editingApprovalHistory = []; return; }
  const { data, error } = await supabaseClient
    .from("approval_history")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });
  state.editingApprovalHistory = error ? [] : data;
}

async function notifyApprovalEvent(task, targetUserId, title, body) {
  if (!targetUserId || targetUserId === state.userId) return; // never notify yourself about your own action
  try {
    await supabaseClient.from("notifications").insert({ user_id: targetUserId, type: "approval_update", title, body, link_url: "dashboard.html" });
  } catch {
    // notifications table may not exist yet - the approval action itself already saved.
  }
}

async function submitForApproval(task) {
  const { error } = await supabaseClient.from("tasks").update({ approval_status: "submitted" }).eq("id", task.id);
  if (error) { toast("Couldn't submit for approval: " + error.message, "error"); return; }
  task.approval_status = "submitted";
  await supabaseClient.from("approval_history").insert({ task_id: task.id, board_id: task.board_id, status: "submitted", changed_by: state.userId });
  const board = state.boards.find((b) => b.id === task.board_id);
  if (board) await notifyApprovalEvent(task, board.user_id, `Approval requested: "${task.title}"`, "A teammate submitted this ticket for your review.");
  toast("Submitted for approval", "ok");
  await loadApprovalHistory(task.id);
  renderApprovalSection(task);
  renderBoard();
}

async function decideApproval(task, decision, note) {
  const { error } = await supabaseClient.from("tasks").update({ approval_status: decision }).eq("id", task.id);
  if (error) { toast("Couldn't save your decision: " + error.message, "error"); return; }
  task.approval_status = decision;
  await supabaseClient.from("approval_history").insert({ task_id: task.id, board_id: task.board_id, status: decision, note: note || null, changed_by: state.userId });
  const lastSubmit = state.editingApprovalHistory.find((h) => h.status === "submitted");
  if (lastSubmit) {
    await notifyApprovalEvent(
      task, lastSubmit.changed_by,
      decision === "approved" ? `Approved: "${task.title}"` : `Changes requested: "${task.title}"`,
      decision === "approved" ? "Your submission was approved." : (note || "Changes were requested on your submission.")
    );
  }
  toast(decision === "approved" ? "Approved" : "Changes requested", "ok");
  await loadApprovalHistory(task.id);
  renderApprovalSection(task);
}

async function requestChangesFlow(task) {
  // showPromptModal resolves null for both an explicit Cancel AND a
  // blank submission - there's no way to tell those apart from its
  // return value alone. Pre-filling a default (same fix used for
  // naming a baseline) means only a genuine Cancel can produce null -
  // submitting without changing anything still carries real text, so
  // this can't silently do nothing when someone actually clicked
  // Submit.
  const note = await showPromptModal("What needs to change?", "Please review and revise");
  if (note === null) return;
  await decideApproval(task, "changes_requested", note);
}

function renderApprovalSection(task) {
  const statusEl = document.getElementById("approval-status-display");
  const actionsEl = document.getElementById("approval-actions");
  const historyEl = document.getElementById("approval-history-list");
  if (!statusEl) return;

  const status = task.approval_status;
  statusEl.innerHTML = status
    ? `<span class="stamp" style="color:${APPROVAL_COLOR[status]}"><i class="fa-solid ${APPROVAL_ICON[status]} mr-1"></i>${APPROVAL_LABEL[status]}</span>`
    : `<span class="text-xs text-ink-soft">Not submitted for review</span>`;

  const lastSubmit = state.editingApprovalHistory.find((h) => h.status === "submitted");
  const submittedByMe = lastSubmit?.changed_by === state.userId;
  const buttons = [];
  if (!status || status === "changes_requested") {
    buttons.push(`<button type="button" id="approval-submit-btn" class="toolbar-btn text-xs"><i class="fa-solid fa-paper-plane mr-1.5"></i>Submit for approval</button>`);
  }
  // Can't approve or request changes on your own submission - a real
  // review needs a second person, even an informal one.
  if (status === "submitted" && !submittedByMe) {
    buttons.push(`<button type="button" id="approval-approve-btn" class="toolbar-btn text-xs !border-teal !text-teal"><i class="fa-solid fa-check mr-1.5"></i>Approve</button>`);
    buttons.push(`<button type="button" id="approval-changes-btn" class="toolbar-btn text-xs !border-critical !text-critical"><i class="fa-solid fa-xmark mr-1.5"></i>Request changes</button>`);
  }
  actionsEl.innerHTML = buttons.join("");
  document.getElementById("approval-submit-btn")?.addEventListener("click", () => submitForApproval(task));
  document.getElementById("approval-approve-btn")?.addEventListener("click", () => decideApproval(task, "approved"));
  document.getElementById("approval-changes-btn")?.addEventListener("click", () => requestChangesFlow(task));

  historyEl.innerHTML = state.editingApprovalHistory
    .map((h) => `<p class="text-[11px] text-ink-soft"><i class="fa-solid ${APPROVAL_ICON[h.status]} mr-1"></i>${APPROVAL_LABEL[h.status]}${h.note ? `: ${escapeHTML(h.note)}` : ""} - ${new Date(h.created_at).toLocaleString()}</p>`)
    .join("");
}

function refreshApprovalUI(task) {
  const section = document.getElementById("approval-section");
  const notReady = document.getElementById("approval-not-ready");
  if (!section) return;
  section.classList.toggle("hidden", !state.approvalReady);
  notReady?.classList.toggle("hidden", state.approvalReady);
  if (state.approvalReady) renderApprovalSection(task);
}

document.addEventListener("DOMContentLoaded", async () => {
  await checkApprovalReady();

  const _originalOpenEditModal = window.openEditModal;
  if (typeof _originalOpenEditModal === "function") {
    window.openEditModal = function (id) {
      const result = _originalOpenEditModal.call(this, id);
      const task = state.tasks.find((t) => t.id === id);
      if (task) loadApprovalHistory(id).then(() => refreshApprovalUI(task));
      return result;
    };
  }
});
