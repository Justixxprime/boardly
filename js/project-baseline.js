/* ==========================================================================
   BOARDLY - project-baseline.js  (schema_v53_project_baselines.sql)
   --------------------------------------------------------------------------
   Phase 2 of the master build spec: "Allow a project manager to save:
   Original Plan. Then compare: Current Plan. Show: original deadline,
   current deadline, variance, original task count, current task count,
   milestone changes."

   A baseline is a frozen JSONB snapshot of the board at the moment it's
   saved - every ticket's title/due date/status/milestone, and every
   milestone's own target date. Nothing about it ever changes once
   saved; comparing it against the board's live current state is what
   surfaces what's actually shifted since then.
   ========================================================================== */

state.baselineReady = false;
state.baselines = [];

async function checkBaselineReady() {
  const { error } = await supabaseClient.from("project_baselines").select("id").limit(1);
  state.baselineReady = !error;
  return state.baselineReady;
}

function buildBoardSnapshot() {
  const boardTasks = state.tasks.filter((t) => t.board_id === state.currentBoardId);
  const boardMilestones = (state.milestones || []).filter((m) => m.board_id === state.currentBoardId);
  return {
    tasks: boardTasks.map((t) => ({ id: t.id, title: t.title, due_date: t.due_date || null, status: t.status, milestone_id: t.milestone_id || null })),
    milestones: boardMilestones.map((m) => ({ id: m.id, name: m.name, target_date: m.target_date || null })),
  };
}

async function saveBaseline() {
  const label = await showPromptModal("Name this baseline (e.g. \"Kickoff plan\")", "Baseline");
  if (!label) return; // cancelled or submitted blank
  const snapshot = buildBoardSnapshot();
  const { error } = await supabaseClient.from("project_baselines").insert({
    board_id: state.currentBoardId, created_by: state.userId, label: label || "Baseline", snapshot,
  });
  if (error) { toast("Couldn't save baseline: " + error.message, "error"); return; }
  toast("Baseline saved", "ok");
  await loadBaselinesForBoard();
  renderBaselineComparison();
}

async function loadBaselinesForBoard() {
  if (!state.baselineReady) { state.baselines = []; return; }
  const { data, error } = await supabaseClient
    .from("project_baselines")
    .select("*")
    .eq("board_id", state.currentBoardId)
    .order("created_at", { ascending: false });
  state.baselines = error ? [] : data;
  const select = document.getElementById("project-baseline-select");
  if (select) {
    select.innerHTML = state.baselines
      .map((b) => `<option value="${b.id}">${escapeHTML(b.label)} - ${new Date(b.created_at).toLocaleDateString()}</option>`)
      .join("");
  }
}

function renderBaselineComparison() {
  const emptyEl = document.getElementById("project-baseline-empty");
  const comparisonEl = document.getElementById("project-baseline-comparison");
  const selectEl = document.getElementById("project-baseline-select");
  if (!state.baselines.length) {
    emptyEl.classList.remove("hidden");
    comparisonEl.classList.add("hidden");
    return;
  }
  emptyEl.classList.add("hidden");
  comparisonEl.classList.remove("hidden");

  const baseline = state.baselines.find((b) => b.id === selectEl.value) || state.baselines[0];
  const snapshot = baseline.snapshot;
  const currentTasks = state.tasks.filter((t) => t.board_id === state.currentBoardId);
  const currentById = new Map(currentTasks.map((t) => [t.id, t]));
  const snapshotById = new Map(snapshot.tasks.map((t) => [t.id, t]));

  document.getElementById("project-baseline-count").textContent = `${snapshot.tasks.length} → ${currentTasks.length}`;
  document.getElementById("project-baseline-date").textContent = new Date(baseline.created_at).toLocaleDateString();

  const added = currentTasks.filter((t) => !snapshotById.has(t.id));
  const removed = snapshot.tasks.filter((t) => !currentById.has(t.id));
  const dueDateShifted = snapshot.tasks
    .filter((t) => currentById.has(t.id))
    .map((t) => ({ before: t, after: currentById.get(t.id) }))
    .filter(({ before, after }) => (before.due_date || null) !== (after.due_date || null));
  const milestoneShifted = snapshot.milestones
    .map((m) => ({ before: m, after: (state.milestones || []).find((mm) => mm.id === m.id) }))
    .filter(({ before, after }) => after && (before.target_date || null) !== (after.target_date || null));

  const rows = [];
  if (added.length) {
    rows.push(reasonRow("fa-plus", "var(--teal)", `${added.length} ticket${added.length === 1 ? "" : "s"} added since this baseline`, added.map((t) => t.title)));
  }
  if (removed.length) {
    rows.push(reasonRow("fa-xmark", "var(--critical)", `${removed.length} ticket${removed.length === 1 ? "" : "s"} from the baseline no longer exist`, removed.map((t) => t.title)));
  }
  if (dueDateShifted.length) {
    rows.push(reasonRow("fa-calendar-days", "var(--orange)", `${dueDateShifted.length} due date${dueDateShifted.length === 1 ? "" : "s"} changed`,
      dueDateShifted.map(({ before, after }) => `${before.title}: ${before.due_date || "no date"} → ${after.due_date || "no date"}`)));
  }
  if (milestoneShifted.length) {
    rows.push(reasonRow("fa-flag-checkered", "var(--violet)", `${milestoneShifted.length} milestone date${milestoneShifted.length === 1 ? "" : "s"} moved`,
      milestoneShifted.map(({ before, after }) => `${before.name}: ${before.target_date || "no date"} → ${after.target_date || "no date"}`)));
  }
  if (!rows.length) {
    rows.push(reasonRow("fa-circle-check", "var(--teal)", "Nothing has changed since this baseline", null));
  }
  document.getElementById("project-baseline-changes").innerHTML = rows.join("");
}

// Same collapsible "reason row" shape Board Health already uses, so
// this feels like the same family of feature rather than a one-off
// design - a click expands the list of exactly which tickets changed.
function reasonRow(icon, color, label, items) {
  const listId = `bl-${Math.random().toString(36).slice(2, 9)}`;
  return `
    <details class="ticket p-2.5">
      <summary class="text-sm cursor-pointer flex items-center gap-2"><i class="fa-solid ${icon}" style="color:${color}"></i>${label}</summary>
      ${items ? `<ul id="${listId}" class="text-xs text-ink-soft mt-2 pl-6 list-disc space-y-1">${items.map((i) => `<li>${escapeHTML(i)}</li>`).join("")}</ul>` : ""}
    </details>`;
}

async function openProjectBaseline() {
  document.getElementById("board-switcher-menu")?.classList.add("hidden");
  const modal = document.getElementById("project-baseline-modal");
  modal.classList.remove("hidden");
  await checkBaselineReady();
  document.getElementById("project-baseline-not-ready").classList.toggle("hidden", state.baselineReady);
  document.getElementById("project-baseline-ready-content").classList.toggle("hidden", !state.baselineReady);
  if (!state.baselineReady) return;
  await loadBaselinesForBoard();
  renderBaselineComparison();
}

function closeProjectBaseline() {
  document.getElementById("project-baseline-modal")?.classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("project-baseline-btn")?.addEventListener("click", openProjectBaseline);
  document.getElementById("project-baseline-save-btn")?.addEventListener("click", saveBaseline);
  document.getElementById("project-baseline-select")?.addEventListener("change", renderBaselineComparison);
  document.getElementById("project-baseline-modal")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-project-baseline]")) closeProjectBaseline();
  });
});
