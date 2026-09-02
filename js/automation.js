/* ==========================================================================
   BOARDLY - automation.js  (Boardly Autopilot)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/automation.js" defer></script>

   Needs supabase/schema_v47_automation.sql run first.

   Scope for v1, on purpose: only fires from the two direct, interactive
   ways a person changes a ticket's status themselves - dragging a card
   (moveTask) and the checkbox (toggleComplete). It deliberately does
   NOT hook into the AI assistant's bulk actions (move_by_status,
   delete_by_status) - those are already a confirmed, deliberate bulk
   action in their own right, and layering more automatic behavior on
   top of an already-bulk operation is exactly the kind of surprising,
   hard-to-predict cascade this feature has to avoid.

   LOOP PREVENTION: a "move to another status" action can itself trigger
   more rules (a real, useful thing - "when moved to Done, move to
   Archived" style chains). To stop A-triggers-B-triggers-A cycles, each
   chain is capped at MAX_CHAIN_DEPTH hops - hitting the cap logs a
   clearly-labeled "stopped: possible loop" run rather than silently
   doing nothing (never fail silently, per the master spec) or spinning
   forever.
   ========================================================================== */

const MAX_CHAIN_DEPTH = 3;

state.automationReady = false;
state.automationRules = [];

async function checkAutomationReady() {
  const { error } = await supabaseClient.from("automation_rules").select("id").limit(1);
  state.automationReady = !error;
  return state.automationReady;
}

async function loadAutomationRules() {
  if (!state.automationReady || !state.currentBoardId) { state.automationRules = []; renderAutomationList(); return; }
  const { data, error } = await supabaseClient.from("automation_rules").select("*").eq("board_id", state.currentBoardId).order("created_at", { ascending: false });
  if (error) { console.warn("loadAutomationRules:", error.message); return; }
  state.automationRules = data || [];
  renderAutomationList();
}

async function logAutomationRun(ruleId, taskId, success, summary) {
  await supabaseClient.from("automation_runs").insert({ rule_id: ruleId, task_id: taskId, success, summary });
  // Also drops a line into the general Activity Log, but only for a
  // real successful action - a "stopped: possible loop" run already has
  // its own home in the Autopilot rule's own run history, and logging
  // it here too would just be noise for Opportunity Radar later (it
  // cares about what actually happened, not what got blocked).
  if (success) {
    const rule = (state.automationRules || []).find((r) => r.id === ruleId);
    const task = (state.tasks || []).find((t) => t.id === taskId);
    logActivity("AUTOMATION_RAN", { rule: rule?.name || "Autopilot rule", summary }, taskId || null, task?.board_id || state.currentBoardId || null);
  }
}

// The actual engine. Called from moveTask() and toggleComplete() right
// after a status change is confirmed - never speculatively, never for
// a change that didn't really happen (fromStatus === toStatus is a
// no-op, not a trigger).
async function runAutomationsForStatusChange(task, fromStatus, toStatus, depth = 0) {
  if (!state.automationReady || fromStatus === toStatus) return;

  const rules = state.automationRules.filter((r) =>
    r.enabled && r.board_id === task.board_id && r.trigger_to_status === toStatus &&
    (!r.condition_category || r.condition_category === task.category)
  );
  if (!rules.length) return;

  if (depth >= MAX_CHAIN_DEPTH) {
    for (const rule of rules) await logAutomationRun(rule.id, task.id, false, `Stopped: this would be automation hop #${depth + 1} on the same ticket in one go - looks like a loop, not a real chain.`);
    return;
  }

  for (const rule of rules) {
    try {
      if (rule.action_type === "move_to_status") {
        const target = rule.action_value;
        if (!target || target === task.status) continue;
        const prevStatus = task.status;
        task.status = target;
        task.position = nextPositionFor(target);
        const { error } = await supabaseClient.from("tasks").update({ status: target, position: task.position }).eq("id", task.id);
        if (error) throw new Error(error.message);
        renderBoard();
        await logAutomationRun(rule.id, task.id, true, `Moved "${task.title}" to ${target}`);
        await runAutomationsForStatusChange(task, prevStatus, target, depth + 1);
      } else if (rule.action_type === "assign_to") {
        if (!state.taskAssignmentReady || !rule.action_value) continue;
        const { error } = await supabaseClient.from("tasks").update({ assigned_to: rule.action_value }).eq("id", task.id);
        if (error) throw new Error(error.message);
        task.assigned_to = rule.action_value;
        await logAutomationRun(rule.id, task.id, true, `Assigned "${task.title}"`);
      } else if (rule.action_type === "notify") {
        // Scoped to notifying the rule's own creator, on purpose - a
        // normal signed-in user can never insert a notification into
        // someone ELSE's bell directly (blocked by RLS, see
        // schema_v36_notifications.sql), and adding a whole Edge
        // Function just so a rule could notify a different person is
        // more machinery than "when this happens, tell me" needs.
        const { error } = await supabaseClient.from("notifications").insert({
          user_id: rule.user_id, type: "automation",
          title: `Autopilot: ${rule.name}`,
          body: `"${task.title}" was moved to ${toStatus}.`,
          link_url: "dashboard.html", board_id: task.board_id,
        });
        if (error) throw new Error(error.message);
        await logAutomationRun(rule.id, task.id, true, `Notified you`);
      }
    } catch (err) {
      await logAutomationRun(rule.id, task.id, false, err.message || "Unknown error");
      toast(`Automation "${rule.name}" failed: ${err.message}`, "error");
    }
  }
}

const ACTION_LABEL = {
  move_to_status: (v) => `move it to ${v}`,
  assign_to: (v) => `assign it to ${v === state.userId ? "me" : (state.boardMembers || []).find((m) => m.user_id === v)?.invited_email || "someone"}`,
  notify: () => "notify me",
};

function renderAutomationList() {
  const list = document.getElementById("automation-list");
  const empty = document.getElementById("automation-empty");
  const notReady = document.getElementById("automation-not-ready");
  if (!list) return;

  if (!state.automationReady) {
    list.innerHTML = "";
    empty.classList.add("hidden");
    notReady?.classList.remove("hidden");
    return;
  }
  notReady?.classList.add("hidden");

  if (!state.automationRules.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  list.innerHTML = state.automationRules.map((r) => `
    <div class="ticket p-3 ${r.enabled ? "" : "opacity-50"}" data-id="${r.id}">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-semibold truncate">${escapeHTML(r.name)}</p>
          <p class="text-xs text-ink-soft mt-1">WHEN moved to <strong>${r.trigger_to_status}</strong>${r.condition_category ? ` IF category is <strong>${escapeHTML(r.condition_category)}</strong>` : ""} THEN <strong>${ACTION_LABEL[r.action_type]?.(r.action_value) || r.action_type}</strong></p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button type="button" data-toggle-automation="${r.id}" title="${r.enabled ? "Turn off" : "Turn on"}" class="text-ink-soft hover:text-teal"><i class="fa-solid ${r.enabled ? "fa-toggle-on text-teal" : "fa-toggle-off"}"></i></button>
          <button type="button" data-remove-automation="${r.id}" title="Delete" class="text-ink-soft hover:text-critical"><i class="fa-regular fa-trash-can text-xs"></i></button>
        </div>
      </div>
    </div>`).join("");
}

async function addAutomationRule({ name, triggerStatus, conditionCategory, actionType, actionValue }) {
  if (!state.automationReady) { toast("Run supabase/schema_v47_automation.sql first", "error"); return; }
  const { data, error } = await supabaseClient.from("automation_rules").insert({
    user_id: state.userId, board_id: state.currentBoardId, name,
    trigger_to_status: triggerStatus, condition_category: conditionCategory || null,
    action_type: actionType, action_value: actionValue || null,
  }).select().single();
  if (error) { toast("Couldn't save: " + error.message, "error"); return; }
  state.automationRules.unshift(data);
  renderAutomationList();
}

async function toggleAutomationRule(id) {
  const rule = state.automationRules.find((r) => r.id === id);
  if (!rule) return;
  rule.enabled = !rule.enabled; // optimistic
  renderAutomationList();
  const { error } = await supabaseClient.from("automation_rules").update({ enabled: rule.enabled }).eq("id", id);
  if (error) { rule.enabled = !rule.enabled; renderAutomationList(); toast("Couldn't update: " + error.message, "error"); }
}

async function removeAutomationRule(id) {
  const item = state.automationRules.find((r) => r.id === id);
  state.automationRules = state.automationRules.filter((r) => r.id !== id); // optimistic
  renderAutomationList();
  const { error } = await supabaseClient.from("automation_rules").delete().eq("id", id);
  if (error) {
    if (item) state.automationRules.unshift(item); // roll back
    renderAutomationList();
    toast("Couldn't delete: " + error.message, "error");
  }
}

function populateAutomationAssigneeSelect() {
  const select = document.getElementById("automation-assignee-value");
  if (!select) return;
  const members = (state.boardMembers || []).filter((m) => m.user_id && m.user_id !== state.userId);
  select.innerHTML = `<option value="${state.userId}">Me</option>` +
    members.map((m) => `<option value="${m.user_id}">${escapeHTML(m.invited_email || "Collaborator")}</option>`).join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  await checkAutomationReady();

  const modal = document.getElementById("automation-modal");
  document.getElementById("automation-btn")?.addEventListener("click", async () => {
    modal?.classList.remove("hidden");
    populateAutomationAssigneeSelect();
    await loadAutomationRules();
  });
  document.querySelectorAll("[data-close-automation]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  const actionTypeSelect = document.getElementById("automation-action-type");
  const moveValueRow = document.getElementById("automation-move-value-row");
  const assigneeValueRow = document.getElementById("automation-assignee-value-row");
  actionTypeSelect?.addEventListener("change", () => {
    moveValueRow?.classList.toggle("hidden", actionTypeSelect.value !== "move_to_status");
    assigneeValueRow?.classList.toggle("hidden", actionTypeSelect.value !== "assign_to");
  });

  document.getElementById("automation-add-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("automation-name").value.trim();
    const triggerStatus = document.getElementById("automation-trigger-status").value;
    const conditionCategory = document.getElementById("automation-condition-category").value;
    const actionType = actionTypeSelect.value;
    const actionValue = actionType === "move_to_status" ? document.getElementById("automation-move-value").value
      : actionType === "assign_to" ? document.getElementById("automation-assignee-value").value
      : null;
    if (!name) return;
    await addAutomationRule({ name, triggerStatus, conditionCategory, actionType, actionValue });
    e.target.reset();
    moveValueRow?.classList.add("hidden");
    assigneeValueRow?.classList.add("hidden");
  });

  document.getElementById("automation-list")?.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest("[data-toggle-automation]");
    if (toggleBtn) { toggleAutomationRule(toggleBtn.dataset.toggleAutomation); return; }
    const removeBtn = e.target.closest("[data-remove-automation]");
    if (removeBtn) removeAutomationRule(removeBtn.dataset.removeAutomation);
  });
});
