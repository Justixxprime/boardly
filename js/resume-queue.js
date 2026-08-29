/* ==========================================================================
   BOARDLY - resume-queue.js  ("Resume Queue" v1)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/resume-queue.js"></script>

   Needs schema_v31_session_log.sql for the "left off at" notes to show
   (falls back gracefully to just showing times if that migration
   hasn't run - see the state.sessionLogReady guard below). No other
   migration needed - "snoozed" is simply any task with a reminder_at
   set, which already exists.

   WHY THIS EXISTS: built directly around how Charles actually works -
   coding on a ticket, snoozing a reminder to come back in a few
   hours, doing that across several different tickets for different
   sites/apps at once (see schema_v31_session_log.sql for the fuller
   story, and the Quick Resume controls added to every task's edit
   modal in dashboard.js). Once you're juggling several snoozed
   tickets, the natural next question is "what's coming back to me,
   and in what order" - that's this view. Cross-board on purpose, same
   reasoning as People and Memory Vault - Charles's actual example was
   "different websites and apps," which means different boards.

   Visually reuses the .resume-card/.resume-ring family from
   css/style.css - the same cinematic language as Routines, its own
   teal color (red once overdue) so the two stay easy to tell apart at
   a glance.
   ========================================================================== */

async function loadResumeQueue() {
  const { data, error } = await supabaseClient
    .from("tasks")
    .select("id, board_id, title, reminder_at, session_log, timezone")
    .neq("status", "done")
    .not("reminder_at", "is", null)
    .order("reminder_at", { ascending: true })
    .limit(50);
  if (error) { console.warn("loadResumeQueue:", error.message); return []; }
  return data || [];
}

function resumeQueueTimeLabel(reminderAtIso, tz) {
  const zone = tz || (window.Timely ? Timely.BROWSER_TZ : undefined);
  return window.Timely ? Timely.formatInZone(reminderAtIso, zone) : new Date(reminderAtIso).toLocaleTimeString();
}

function resumeQueueRelativeLabel(reminderAtIso) {
  const diffMs = new Date(reminderAtIso).getTime() - Date.now();
  const overdue = diffMs < 0;
  const absMinutes = Math.round(Math.abs(diffMs) / 60000);
  let text;
  if (absMinutes < 60) text = `${absMinutes}m`;
  else if (absMinutes < 24 * 60) text = `${Math.round(absMinutes / 60)}h`;
  else text = `${Math.round(absMinutes / (60 * 24))}d`;
  return overdue ? { text: `${text} overdue`, overdue: true } : { text: `in ${text}`, overdue: false };
}

function resumeQueueRowHTML(t, boardName) {
  const rel = resumeQueueRelativeLabel(t.reminder_at);
  const lastNote = state.sessionLogReady && Array.isArray(t.session_log) && t.session_log.length
    ? t.session_log[t.session_log.length - 1].note
    : "";

  return `
    <div class="resume-card ${rel.overdue ? "overdue" : ""}" data-rq-task="${t.id}" data-rq-board="${t.board_id}">
      <div class="resume-ring"><i class="fa-solid fa-play"></i></div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate">${escapeHTML(t.title)}</p>
        <p class="routine-time" style="color:${rel.overdue ? "var(--critical)" : "var(--teal)"}">${escapeHTML(resumeQueueTimeLabel(t.reminder_at, t.timezone))}</p>
        <p class="text-[11px] text-ink-soft truncate">${boardName ? escapeHTML(boardName) + " · " : ""}${rel.text}${lastNote ? ` · Left off: "${escapeHTML(lastNote)}"` : ""}</p>
      </div>
      <button type="button" data-rq-open="${t.id}" data-rq-open-board="${t.board_id}" class="btn-icon-xs shrink-0"><i class="fa-solid fa-arrow-right text-[10px]"></i></button>
    </div>`;
}

async function renderResumeQueue() {
  const list = document.getElementById("resume-queue-list");
  const empty = document.getElementById("resume-queue-empty");
  if (!list) return;

  list.innerHTML = `<p class="text-xs text-ink-soft text-center py-6">Loading…</p>`;
  const tasks = await loadResumeQueue();

  if (!tasks.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const boardNameById = new Map(state.boards.map((b) => [b.id, b.name]));
  list.innerHTML = tasks.map((t) => resumeQueueRowHTML(t, boardNameById.get(t.board_id))).join("");
}

async function openResumeQueueTask(taskId, boardId) {
  document.getElementById("resume-queue-modal")?.classList.add("hidden");
  if (boardId && boardId !== state.currentBoardId) await switchBoard(boardId);
  openEditModal(taskId);
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("resume-queue-modal");

  document.getElementById("resume-queue-btn")?.addEventListener("click", () => {
    modal?.classList.remove("hidden");
    renderResumeQueue();
  });
  document.querySelectorAll("[data-close-resume-queue]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("resume-queue-list")?.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-rq-open]");
    if (openBtn) openResumeQueueTask(openBtn.dataset.rqOpen, openBtn.dataset.rqOpenBoard);
  });

  // Always visible (not gated behind any vertical) once reminders exist at
  // all - matches Commitments/Routines/Memory Vault's own always-on buttons.
  document.getElementById("resume-queue-btn")?.classList.toggle("hidden", !state.remindersReady);
});
