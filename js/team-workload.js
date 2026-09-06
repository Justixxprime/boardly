/* ==========================================================================
   BOARDLY - team-workload.js  (schema_v55_team_capacity.sql)
   --------------------------------------------------------------------------
   Phase 3 of the master build spec: "Compare: AVAILABLE vs ASSIGNED...
   Make overload obvious." ASSIGNED comes from summing estimated_minutes
   (schema_v54) across each person's active assigned tickets on this
   board; AVAILABLE is whatever weekly capacity that person has chosen
   to record for themselves - nobody else's number to set, on purpose
   (see set-my-capacity's own comment on why).

   If estimates or assignment aren't set up (or a person just hasn't
   estimated their tickets yet), this says so rather than showing a
   number that would look precise but isn't grounded in anything real -
   same "don't guess" discipline as Critical Path and Board Health.
   ========================================================================== */

state.teamCapacityReady = false;

async function checkTeamCapacityReady() {
  const { error } = await supabaseClient.from("board_members").select("weekly_capacity_hours").limit(1);
  state.teamCapacityReady = !error;
  return state.teamCapacityReady;
}

function assignedMinutesFor(personId) {
  return state.tasks
    .filter((t) => t.board_id === state.currentBoardId && t.status !== "done")
    .filter((t) => (personId === "owner" ? (!t.assigned_to || t.assigned_to === personId) : t.assigned_to === personId))
    .reduce((sum, t) => sum + (t.estimated_minutes || 0), 0);
}

function workloadBarColor(assignedHours, capacityHours) {
  if (!capacityHours) return "var(--ink-soft)";
  const ratio = assignedHours / capacityHours;
  if (ratio >= 1) return "var(--critical)";
  if (ratio >= 0.75) return "var(--orange)";
  return "var(--teal)";
}

function renderWorkloadRow({ id, label, isSelf, assignedMinutes, capacityHours }) {
  const assignedHours = Math.round((assignedMinutes / 60) * 10) / 10;
  const color = workloadBarColor(assignedHours, capacityHours);
  const pct = capacityHours ? Math.min(100, Math.round((assignedHours / capacityHours) * 100)) : 0;
  const capacityDisplay = isSelf
    ? `<input type="number" min="0" step="1" data-capacity-input="${id}" value="${capacityHours || ""}" placeholder="hrs/week" class="input input-sm w-20 text-xs">`
    : `<span class="text-xs text-ink-soft">${capacityHours ? `${capacityHours}h/wk` : "not set"}</span>`;
  return `
    <div class="border border-line rounded-lg p-3">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-sm font-medium truncate">${escapeHTML(label)}${isSelf ? " (you)" : ""}</span>
        ${capacityDisplay}
      </div>
      <div class="h-2 rounded-full bg-[var(--paper-2)] overflow-hidden">
        <div class="h-full rounded-full" style="width:${capacityHours ? pct : 0}%; background:${color}"></div>
      </div>
      <p class="text-[11px] text-ink-soft mt-1">${assignedHours}h assigned${capacityHours ? ` of ${capacityHours}h/week` : " - no weekly capacity set yet"}</p>
    </div>`;
}

async function openTeamWorkload() {
  document.getElementById("board-switcher-menu")?.classList.add("hidden");
  const modal = document.getElementById("team-workload-modal");
  modal.classList.remove("hidden");
  await checkTeamCapacityReady();
  document.getElementById("team-workload-not-ready").classList.toggle("hidden", state.teamCapacityReady);
  document.getElementById("team-workload-ready-content").classList.toggle("hidden", !state.teamCapacityReady);
  if (!state.teamCapacityReady) return;

  const board = state.boards.find((b) => b.id === state.currentBoardId);
  const isOwner = board?.user_id === state.userId;
  const rows = [];

  rows.push(renderWorkloadRow({
    id: "owner",
    label: isOwner ? (state.userEmail || "You") : "Board owner",
    isSelf: isOwner,
    assignedMinutes: assignedMinutesFor("owner"),
    capacityHours: board?.owner_weekly_capacity_hours || null,
  }));

  (state.boardMembers || [])
    .filter((m) => m.accepted_at && m.user_id)
    .forEach((m) => {
      rows.push(renderWorkloadRow({
        id: m.user_id,
        label: m.invited_email,
        isSelf: m.user_id === state.userId,
        assignedMinutes: assignedMinutesFor(m.user_id),
        capacityHours: m.weekly_capacity_hours || null,
      }));
    });

  document.getElementById("team-workload-rows").innerHTML = rows.join("");
}

async function saveMyCapacity(personId, hoursValue) {
  const hours = hoursValue === "" ? null : Number(hoursValue);
  if (hours !== null && (!Number.isFinite(hours) || hours < 0)) { toast("Enter a valid number of hours", "error"); return; }

  const board = state.boards.find((b) => b.id === state.currentBoardId);
  const isOwner = board?.user_id === state.userId;

  if (isOwner && personId === "owner") {
    // The owner already has full update rights on their own board row
    // (schema_v2's own RLS) - no edge function needed for this path.
    const { error } = await supabaseClient.from("boards").update({ owner_weekly_capacity_hours: hours }).eq("id", board.id);
    if (error) { toast("Couldn't save: " + error.message, "error"); return; }
    board.owner_weekly_capacity_hours = hours;
  } else {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/set-my-capacity`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ boardId: state.currentBoardId, weeklyCapacityHours: hours }),
    });
    const result = await res.json();
    if (!res.ok) { toast(result.error || "Couldn't save capacity", "error"); return; }
    const member = state.boardMembers.find((m) => m.user_id === state.userId);
    if (member) member.weekly_capacity_hours = hours;
  }
  toast("Capacity saved", "ok");
  openTeamWorkload();
}

function closeTeamWorkload() {
  document.getElementById("team-workload-modal")?.classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("team-workload-btn")?.addEventListener("click", openTeamWorkload);
  document.getElementById("team-workload-modal")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-team-workload]")) closeTeamWorkload();
  });
  document.getElementById("team-workload-rows")?.addEventListener("change", (event) => {
    const input = event.target.closest("[data-capacity-input]");
    if (input) saveMyCapacity(input.dataset.capacityInput, input.value.trim());
  });
});
