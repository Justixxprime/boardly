/* ==========================================================================
   BOARDLY - timesheets.js  (Timesheets)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/timesheets.js" defer></script>

   Needs supabase/schema_v39_time_entries.sql run first. The live
   Start/Stop timer on each ticket (in dashboard.js) writes one row here
   every time it's stopped - this file only reads that ledger and lets
   you add entries by hand for time that was never tracked live.
   ========================================================================== */

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

state.timesheetsReady = false;
state.timesheetWeekOffset = 0; // 0 = this week, -1 = last week, +1 = next week

async function checkTimesheetsReady() {
  const { error } = await supabaseClient.from("time_entries").select("id").limit(1);
  state.timesheetsReady = !error;
  return state.timesheetsReady;
}

// Monday 00:00 (local time) of the week `offset` weeks from this one,
// and the Monday after it (exclusive end of range).
function timesheetWeekRange(offset) {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, ...
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset + offset * 7);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return { start, end };
}

function formatWeekLabel(start, end) {
  const last = new Date(end.getTime() - 86400000);
  const sameMonth = start.getMonth() === last.getMonth();
  const opts = { month: "short", day: "numeric" };
  return sameMonth
    ? `${start.toLocaleDateString(undefined, opts)} - ${last.getDate()}`
    : `${start.toLocaleDateString(undefined, opts)} - ${last.toLocaleDateString(undefined, opts)}`;
}

// "3:45" (hours:minutes) - a plain running total like the per-ticket
// timer already shows seconds too, but a timesheet table reads better
// without them.
function formatHoursMinutes(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

async function loadTimesheet() {
  const label = document.getElementById("timesheet-week-label");
  const { start, end } = timesheetWeekRange(state.timesheetWeekOffset);
  if (label) label.textContent = formatWeekLabel(start, end);

  if (!state.timesheetsReady) { renderTimesheet([], start); return; }

  const { data, error } = await supabaseClient
    .from("time_entries")
    .select("id, task_id, started_at, duration_seconds, tasks(title)")
    .eq("user_id", state.userId)
    .gte("started_at", start.toISOString())
    .lt("started_at", end.toISOString());

  if (error) { console.warn("loadTimesheet:", error.message); return; }
  renderTimesheet(data || [], start);
}

function renderTimesheet(entries, weekStart) {
  const tbody = document.getElementById("timesheet-rows");
  const totalEl = document.getElementById("timesheet-week-total");
  const emptyEl = document.getElementById("timesheet-empty");
  const notReadyEl = document.getElementById("timesheets-not-ready");
  if (!tbody) return;

  if (!state.timesheetsReady) {
    tbody.innerHTML = "";
    emptyEl.classList.add("hidden");
    notReadyEl?.classList.remove("hidden");
    if (totalEl) totalEl.textContent = "0:00";
    return;
  }
  notReadyEl?.classList.add("hidden");

  if (!entries.length) {
    tbody.innerHTML = "";
    emptyEl.classList.remove("hidden");
    if (totalEl) totalEl.textContent = "0:00";
    return;
  }
  emptyEl.classList.add("hidden");

  // taskId -> { title, days: [Mon..Sun seconds] }
  const byTask = new Map();
  let weekTotal = 0;
  for (const entry of entries) {
    const dayIndex = Math.floor((new Date(entry.started_at) - weekStart) / 86400000);
    if (dayIndex < 0 || dayIndex > 6) continue; // guards against timezone edge-of-week rounding
    const key = entry.task_id || "deleted";
    if (!byTask.has(key)) {
      byTask.set(key, { title: entry.tasks?.title || "Deleted ticket", days: [0, 0, 0, 0, 0, 0, 0] });
    }
    byTask.get(key).days[dayIndex] += entry.duration_seconds;
    weekTotal += entry.duration_seconds;
  }

  const rows = [...byTask.values()].sort((a, b) => b.days.reduce((s, v) => s + v, 0) - a.days.reduce((s, v) => s + v, 0));
  tbody.innerHTML = rows.map((row) => {
    const rowTotal = row.days.reduce((s, v) => s + v, 0);
    return `<tr class="border-b border-line">
      <td class="py-1.5 px-1 truncate max-w-[140px]">${escapeHTML(row.title)}</td>
      ${row.days.map((s) => `<td class="text-center py-1.5 px-1 ${s ? "" : "text-ink-soft/50"}">${s ? formatHoursMinutes(s) : "-"}</td>`).join("")}
      <td class="text-right py-1.5 px-1 font-semibold">${formatHoursMinutes(rowTotal)}</td>
    </tr>`;
  }).join("");

  if (totalEl) totalEl.textContent = formatHoursMinutes(weekTotal);
}

function exportTimesheetCSV() {
  const { start, end } = timesheetWeekRange(state.timesheetWeekOffset);
  const rows = [...document.querySelectorAll("#timesheet-rows tr")];
  if (!rows.length) { toast("Nothing to export this week", "error"); return; }

  const lines = [["Ticket", ...DAY_LABELS, "Total"].join(",")];
  rows.forEach((tr) => {
    const cells = [...tr.querySelectorAll("td")].map((td) => td.textContent.trim());
    lines.push(cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(","));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `boardly-timesheet-${start.toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function populateTimesheetTaskSelect() {
  const select = document.getElementById("timesheet-manual-task");
  if (!select) return;
  select.innerHTML = state.tasks
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((t) => `<option value="${t.id}">${escapeHTML(t.title)}</option>`)
    .join("");
}

async function addManualTimeEntry(taskId, dateStr, hours, note) {
  if (!state.timesheetsReady) { toast("Run supabase/schema_v39_time_entries.sql first", "error"); return; }
  const durationSeconds = Math.round(hours * 3600);
  if (!durationSeconds || durationSeconds <= 0) { toast("Enter a number of hours greater than 0", "error"); return; }

  const task = state.tasks.find((t) => t.id === taskId);
  const startedAt = new Date(`${dateStr}T12:00:00`); // midday on the chosen date - only the DAY matters for the timesheet grid

  const { error } = await supabaseClient.from("time_entries").insert({
    user_id: state.userId,
    task_id: taskId,
    board_id: task?.board_id || state.currentBoardId,
    started_at: startedAt.toISOString(),
    duration_seconds: durationSeconds,
    note: note || null,
    source: "manual",
  });
  if (error) { toast("Couldn't log time: " + error.message, "error"); return; }

  // Keep the ticket's own running total (the little clock badge, the
  // number shown in its edit screen) consistent with time logged here.
  if (task) {
    const newTotal = (task.time_tracked_seconds || 0) + durationSeconds;
    task.time_tracked_seconds = newTotal;
    await supabaseClient.from("tasks").update({ time_tracked_seconds: newTotal }).eq("id", taskId);
    renderBoard();
  }

  toast("Time logged", "ok");
  await loadTimesheet();
}

document.addEventListener("DOMContentLoaded", async () => {
  await checkTimesheetsReady();

  const modal = document.getElementById("timesheets-modal");
  document.getElementById("timesheets-btn")?.addEventListener("click", async () => {
    modal?.classList.remove("hidden");
    populateTimesheetTaskSelect();
    document.getElementById("timesheet-manual-date").valueAsDate = new Date();
    await loadTimesheet();
  });
  document.querySelectorAll("[data-close-timesheets]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("timesheet-prev-week-btn")?.addEventListener("click", () => {
    state.timesheetWeekOffset--;
    loadTimesheet();
  });
  document.getElementById("timesheet-next-week-btn")?.addEventListener("click", () => {
    state.timesheetWeekOffset++;
    loadTimesheet();
  });
  document.getElementById("timesheet-export-btn")?.addEventListener("click", exportTimesheetCSV);

  document.getElementById("timesheet-manual-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const taskId = document.getElementById("timesheet-manual-task").value;
    const dateStr = document.getElementById("timesheet-manual-date").value;
    const hours = parseFloat(document.getElementById("timesheet-manual-hours").value);
    const note = document.getElementById("timesheet-manual-note").value.trim();
    if (!taskId || !dateStr) return;
    await addManualTimeEntry(taskId, dateStr, hours, note);
    document.getElementById("timesheet-manual-hours").value = "";
    document.getElementById("timesheet-manual-note").value = "";
  });
});
