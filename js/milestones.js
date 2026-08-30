/* ==========================================================================
   BOARDLY - milestones.js  (Milestones)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/milestones.js" defer></script>

   Needs supabase/schema_v40_milestones.sql run first. Until then,
   state.milestonesReady stays false, the Milestones list and the
   ticket edit screen's "Milestone" field both quietly explain what to
   do (same pattern every earlier add-on in this project uses).
   ========================================================================== */

state.milestonesReady = false;
state.milestones = [];

async function checkMilestonesReady() {
  const { error } = await supabaseClient.from("milestones").select("id").limit(1);
  state.milestonesReady = !error;
  return state.milestonesReady;
}

async function loadMilestones() {
  if (!state.milestonesReady || !state.currentBoardId) { renderMilestonesList(); return; }
  const { data, error } = await supabaseClient
    .from("milestones")
    .select("*")
    .eq("board_id", state.currentBoardId)
    .order("position", { ascending: true });
  if (error) { console.warn("loadMilestones:", error.message); return; }
  state.milestones = data || [];
  renderMilestonesList();
}

// Always computed live from actual linked tickets - never a stored or
// manually-typed percentage, so it can't drift out of sync with reality.
function milestoneProgress(milestoneId) {
  const linked = state.tasks.filter((t) => t.milestone_id === milestoneId);
  const done = linked.filter((t) => t.status === "done").length;
  return { linked: linked.length, done, percent: linked.length ? Math.round((done / linked.length) * 100) : 0 };
}

function renderMilestonesList() {
  const list = document.getElementById("milestones-list");
  const empty = document.getElementById("milestones-empty");
  const notReady = document.getElementById("milestones-not-ready");
  if (!list) return;

  if (!state.milestonesReady) {
    list.innerHTML = "";
    empty.classList.add("hidden");
    notReady?.classList.remove("hidden");
    return;
  }
  notReady?.classList.add("hidden");

  if (!state.milestones.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  list.innerHTML = state.milestones.map((m) => {
    const { linked, done, percent } = milestoneProgress(m.id);
    const overdue = m.target_date && !m.completed_at && new Date(`${m.target_date}T00:00:00`) < new Date(new Date().toDateString());
    return `
    <div class="ticket p-3 ${m.completed_at ? "opacity-60" : ""}" data-id="${m.id}">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold truncate">${m.completed_at ? '<i class="fa-solid fa-circle-check text-teal mr-1"></i>' : ""}${escapeHTML(m.name)}</p>
          ${m.target_date ? `<p class="text-[11px] ${overdue ? "text-critical font-semibold" : "text-ink-soft"} mt-0.5">${overdue ? "Overdue - " : "Target: "}${new Date(`${m.target_date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>` : ""}
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button type="button" data-toggle-milestone="${m.id}" title="${m.completed_at ? "Mark not complete" : "Mark complete"}" class="text-ink-soft hover:text-teal"><i class="fa-regular ${m.completed_at ? "fa-square-check" : "fa-square"} text-sm"></i></button>
          <button type="button" data-remove-milestone="${m.id}" title="Delete" class="text-ink-soft hover:text-critical"><i class="fa-regular fa-trash-can text-xs"></i></button>
        </div>
      </div>
      <div class="mt-2">
        <div class="h-1.5 rounded-full bg-[var(--paper-2)] overflow-hidden">
          <div class="h-full bg-teal" style="width:${percent}%"></div>
        </div>
        <p class="text-[11px] text-ink-soft mt-1">${linked ? `${done} of ${linked} linked ticket${linked === 1 ? "" : "s"} done (${percent}%)` : "No tickets linked yet"}</p>
      </div>
    </div>`;
  }).join("");
}

async function addMilestone(name, targetDate) {
  if (!state.milestonesReady) { toast("Run supabase/schema_v40_milestones.sql first", "error"); return; }
  const { data, error } = await supabaseClient
    .from("milestones")
    .insert({
      user_id: state.userId,
      board_id: state.currentBoardId,
      name,
      target_date: targetDate || null,
      position: state.milestones.length,
    })
    .select()
    .single();
  if (error) { toast("Couldn't add milestone: " + error.message, "error"); return; }
  state.milestones.push(data);
  renderMilestonesList();
}

async function removeMilestone(id) {
  const item = state.milestones.find((m) => m.id === id);
  state.milestones = state.milestones.filter((m) => m.id !== id); // optimistic
  renderMilestonesList();
  const { error } = await supabaseClient.from("milestones").delete().eq("id", id);
  if (error) {
    if (item) state.milestones.push(item); // roll back
    renderMilestonesList();
    toast("Couldn't delete: " + error.message, "error");
  } else {
    // Tickets that were linked to a deleted milestone fall back to "no
    // milestone" (schema_v40's "on delete set null") - reflect that
    // locally too, so the edit screen's dropdown doesn't still show a
    // milestone that no longer exists until the next full reload.
    state.tasks.forEach((t) => { if (t.milestone_id === id) t.milestone_id = null; });
  }
}

async function toggleMilestoneComplete(id) {
  const milestone = state.milestones.find((m) => m.id === id);
  if (!milestone) return;
  const completedAt = milestone.completed_at ? null : new Date().toISOString();
  milestone.completed_at = completedAt; // optimistic
  renderMilestonesList();
  const { error } = await supabaseClient.from("milestones").update({ completed_at: completedAt }).eq("id", id);
  if (error) {
    milestone.completed_at = completedAt ? null : new Date().toISOString(); // roll back (best-effort toggle)
    renderMilestonesList();
    toast("Couldn't update: " + error.message, "error");
  }
}

// Fills the "Milestone" dropdown in a ticket's edit screen. Called from
// dashboard.js's openEditModal (see the `typeof populateMilestoneSelect
// === "function"` guard there) - this file loads after dashboard.js, but
// by the time anyone actually opens a ticket, every deferred script has
// already run, so the function is guaranteed to exist by then.
function populateMilestoneSelect() {
  const select = document.getElementById("edit-milestone");
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">No milestone</option>' +
    state.milestones.map((m) => `<option value="${m.id}">${escapeHTML(m.name)}</option>`).join("");
  select.value = current;
}

document.addEventListener("DOMContentLoaded", async () => {
  await checkMilestonesReady();
  await loadMilestones();

  const modal = document.getElementById("milestones-modal");
  document.getElementById("milestones-btn")?.addEventListener("click", async () => {
    modal?.classList.remove("hidden");
    await loadMilestones();
  });
  document.querySelectorAll("[data-close-milestones]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("milestone-add-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("milestone-name-input");
    const dateInput = document.getElementById("milestone-date-input");
    const name = nameInput.value.trim();
    if (!name) return;
    await addMilestone(name, dateInput.value);
    nameInput.value = "";
    dateInput.value = "";
    nameInput.focus();
  });

  document.getElementById("milestones-list")?.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest("[data-toggle-milestone]");
    if (toggleBtn) { toggleMilestoneComplete(toggleBtn.dataset.toggleMilestone); return; }
    const removeBtn = e.target.closest("[data-remove-milestone]");
    if (removeBtn) removeMilestone(removeBtn.dataset.removeMilestone);
  });
});
