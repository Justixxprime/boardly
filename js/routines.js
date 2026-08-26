/* ==========================================================================
   BOARDLY - routines.js  ("Routines" v1)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js AND timely.js on
   dashboard.html:
     <script src="js/routines.js" defer></script>

   Needs schema_v7_reminder_repeat.sql (state.reminderRepeatReady) and
   Timely (js/timely.js, for Timely.nextZonedOccurrence /
   Timely.zonedTimeToUtc / Timely.formatInZone / Timely.TZ_LIST /
   Timely.BROWSER_TZ - all already built and exposed on window.Timely).
   No new database columns - a "routine" is simply defined as any task
   that has reminder_repeat set. Nothing new to store, only a new way
   to see and create that specific kind of task.

   WHY THIS EXISTS: "wake me up weekdays at 6am" is a real thing people
   need Boardly for, but it isn't really a TASK - it has no deadline,
   nothing gets "delivered," and it never truly finishes. Before this,
   creating one meant going through the full ticket editor and it then
   sat in the To-do column looking exactly like a piece of unfinished
   work, forever, which it isn't. Routines pulls anything with a
   repeating reminder out of that framing entirely: a dedicated panel,
   a form built for exactly this (title + time + repeat pattern, no
   due date, no status to manage), and a visual style (see the
   .routine-card / .routine-ring / .routine-time rules in
   css/style.css) that reads as "a recurring signal" rather than "an
   item on a list."

   Routines still show up as ordinary cards on the board itself (this
   file doesn't hide them from the kanban view) - this panel is an
   additional, better front door for creating and reviewing them, not
   a replacement data model.
   ========================================================================== */

function isRoutineTask(t) {
  return state.reminderRepeatReady && !!t.reminder_repeat && !!t.reminder_at;
}

function boardRoutines() {
  return state.tasks.filter(isRoutineTask);
}

function updateRoutinesButtonVisibility() {
  document.getElementById("routines-btn")?.classList.toggle("hidden", !state.reminderRepeatReady);
}

const _originalRenderBoardForRoutines = window.renderBoard;
if (typeof _originalRenderBoardForRoutines === "function") {
  window.renderBoard = function (...args) {
    const result = _originalRenderBoardForRoutines.apply(this, args);
    updateRoutinesButtonVisibility();
    return result;
  };
}

function populateRoutineTimezoneOptions() {
  const select = document.getElementById("routine-timezone");
  if (!select || select.options.length || !window.Timely) return;
  const zones = Timely.TZ_LIST || [Timely.BROWSER_TZ];
  select.innerHTML = zones.map((z) => `<option value="${z}" ${z === Timely.BROWSER_TZ ? "selected" : ""}>${z.replace(/_/g, " ")}</option>`).join("");
}

function renderRoutines() {
  const list = document.getElementById("routines-list");
  const empty = document.getElementById("routines-empty");
  if (!list || !window.Timely) return;

  const routines = boardRoutines().slice().sort((a, b) => {
    const nextA = Timely.nextZonedOccurrence(a.reminder_at, a.timezone, a.reminder_repeat);
    const nextB = Timely.nextZonedOccurrence(b.reminder_at, b.timezone, b.reminder_repeat);
    return (nextA ? nextA.getTime() : Infinity) - (nextB ? nextB.getTime() : Infinity);
  });

  if (!routines.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  list.innerHTML = routines.map(routineCardHTML).join("");
}

function routineCardHTML(t) {
  const tz = t.timezone || Timely.BROWSER_TZ;
  const timeLabel = Timely.formatInZone(t.reminder_at, tz);
  const next = Timely.nextZonedOccurrence(t.reminder_at, tz, t.reminder_repeat);
  const nextLabel = next ? relativeNextLabel(next) : "";
  return `
    <div class="routine-card" data-repeat="${t.reminder_repeat}" data-routine-id="${t.id}">
      <div class="routine-ring"><i class="fa-solid fa-bell"></i></div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate">${escapeHTML(t.title)}</p>
        <p class="routine-time" style="color:var(--routine-color)">${escapeHTML(timeLabel)}</p>
        <p class="text-[11px] text-ink-soft">${escapeHTML(REMINDER_REPEAT_LABEL[t.reminder_repeat] || "")}${nextLabel ? ` · Next: ${escapeHTML(nextLabel)}` : ""}</p>
      </div>
      <div class="flex flex-col gap-1 shrink-0">
        <button type="button" data-routine-edit="${t.id}" title="Edit" class="btn-icon-xs"><i class="fa-solid fa-pen text-[10px]"></i></button>
        <button type="button" data-routine-delete="${t.id}" title="Delete" class="btn-icon-xs"><i class="fa-solid fa-trash text-[10px]"></i></button>
      </div>
    </div>`;
}

/** "today" / "tomorrow" / "Mon" - close enough in time to feel immediate
 *  without needing a live-ticking countdown. */
function relativeNextLabel(nextDate) {
  const now = new Date();
  const diffDays = Math.round((new Date(nextDate).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  return nextDate.toLocaleDateString(undefined, { weekday: "short" });
}

async function createRoutine(title, time, repeat, timezone) {
  const [hh, mm] = time.split(":");
  const today = new Date();
  const localDateTimeStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}T${hh}:${mm}`;
  const reminderAt = Timely.zonedTimeToUtc(localDateTimeStr, timezone);
  if (!reminderAt) { toast("Couldn't schedule that time - try again", "error"); return; }

  const payload = {
    title,
    category: "general",
    status: "todo",
    due_date: null,
    position: nextPositionFor("todo"),
    user_id: state.userId,
    board_id: state.currentBoardId,
    reminder_at: reminderAt.toISOString(),
    reminder_repeat: repeat,
    timezone,
  };

  const { data, error } = await supabaseClient.from("tasks").insert(payload).select().single();
  if (error) { toast("Couldn't create routine: " + error.message, "error"); return; }

  state.tasks.push(data);
  renderBoard();
  renderRoutines();
  toast("Routine created", "ok");
}

async function deleteRoutine(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const confirmed = await showConfirmModal(`Delete the routine "${task.title}"? This can't be undone.`, { title: "Delete routine?", confirmLabel: "Delete" });
  if (!confirmed) return;

  state.tasks = state.tasks.filter((t) => t.id !== taskId);
  renderBoard();
  renderRoutines();
  const { error } = await supabaseClient.from("tasks").delete().eq("id", taskId);
  if (error) toast("Couldn't delete: " + error.message, "error");
  else toast("Routine deleted", "ok");
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("routines-modal");

  document.getElementById("routines-btn")?.addEventListener("click", () => {
    modal?.classList.remove("hidden");
    populateRoutineTimezoneOptions();
    renderRoutines();
  });
  document.querySelectorAll("[data-close-routines]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("routines-add-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("routine-title").value.trim();
    const time = document.getElementById("routine-time").value;
    const repeat = document.getElementById("routine-repeat").value;
    const timezone = document.getElementById("routine-timezone").value || Timely.BROWSER_TZ;
    if (!title || !time) return;
    await createRoutine(title, time, repeat, timezone);
    e.target.reset();
    document.getElementById("routine-repeat").value = "weekdays";
  });

  document.getElementById("routines-list")?.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-routine-edit]");
    if (editBtn) {
      modal?.classList.add("hidden");
      openEditModal(editBtn.dataset.routineEdit);
      return;
    }
    const deleteBtn = e.target.closest("[data-routine-delete]");
    if (deleteBtn) deleteRoutine(deleteBtn.dataset.routineDelete);
  });

  updateRoutinesButtonVisibility();
});
