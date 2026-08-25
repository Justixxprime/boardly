/* ==========================================================================
   BOARDLY - classroom.js  ("Classroom Command Center" v1)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/classroom.js"></script>

   Needs NOTHING new in Supabase - same reasoning as control-tower.js,
   its sibling for the logistics vertical. Teaching boards already
   store class_name and student_name inside the existing metadata
   jsonb column (schema_v14_vertical_fields.sql), and the teaching
   vertical's own column labels already call "Done" GRADED (see
   TERMINOLOGY.teaching in dashboard.js) - this module leans into that
   existing meaning rather than inventing a new status system:
   marking a lesson done here IS grading it.

   WHAT THIS IS: a dedicated view for "what's still to teach or grade,
   organized by class" - the same shape as the Logistics Control
   Tower, for a teacher instead of a dispatcher. It only ever appears
   on boards whose work_type is "teaching" - every other board is
   unaffected and the button stays hidden.

   The grade itself (a short string like "18/20" or "Pass") and an
   optional feedback line are stored as two more keys inside that same
   metadata column - metadata.grade / metadata.grade_feedback - not a
   new database column, same reasoning schema_v14 already gives.

   v1 → v1.1: added a search box (same pattern as Done Archive's) and
   a "completed today" count, so this whole family of views (Control
   Tower, Classroom, Dispatch, Care Rounds) now behaves consistently.

   v1.1 → v1.2: tasks can now individually override their own type
   (schema_v28_task_type_override.sql) - a handful of lessons on an
   otherwise general board now show up here too, read through
   effectiveWorkType() (dashboard.js) rather than assuming every task
   on the board is a teaching task. The button shows whenever the
   board's default type is teaching OR at least one task has been
   individually set to teaching.
   ========================================================================== */

function isTeachingBoard() {
  const board = state.boards.find((b) => b.id === state.currentBoardId);
  if ((board?.work_type || "general") === "teaching") return true;
  return state.tasks.some((t) => effectiveWorkType(t) === "teaching");
}

function updateClassroomButtonVisibility() {
  document.getElementById("classroom-btn")?.classList.toggle("hidden", !isTeachingBoard());
}

/** Wraps applyTerminology - dashboard.js already calls it every time the
 *  active board changes (on load and on switch) - see file 2g pattern
 *  ("wrap the existing function") used across every earlier add-on. This
 *  chains safely with control-tower.js's own wrap of the same function. */
const _originalApplyTerminologyForClassroom = window.applyTerminology;
if (typeof _originalApplyTerminologyForClassroom === "function") {
  window.applyTerminology = function (...args) {
    const result = _originalApplyTerminologyForClassroom.apply(this, args);
    updateClassroomButtonVisibility();
    return result;
  };
}

/** Also wraps renderBoard, needed now that a single task's type can
 *  change without a board switch happening at all (chains safely with
 *  every other renderBoard wrap in this project, same 2g pattern). */
const _originalRenderBoardForClassroom = window.renderBoard;
if (typeof _originalRenderBoardForClassroom === "function") {
  window.renderBoard = function (...args) {
    const result = _originalRenderBoardForClassroom.apply(this, args);
    updateClassroomButtonVisibility();
    return result;
  };
}

state.classroomQuery = "";

function activeLessons() {
  const q = state.classroomQuery.trim().toLowerCase();
  let lessons = state.tasks.filter((t) => t.status !== "done" && effectiveWorkType(t) === "teaching");
  if (q) {
    lessons = lessons.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      (t.metadata?.student_name || "").toLowerCase().includes(q) ||
      (t.metadata?.class_name || "").toLowerCase().includes(q)
    );
  }
  return lessons;
}

function classroomCompletedTodayCount() {
  const today = new Date().toDateString();
  return state.tasks.filter((t) => t.status === "done" && t.done_at && new Date(t.done_at).toDateString() === today).length;
}

function recentlyGraded() {
  return state.tasks
    .filter((t) => t.status === "done" && t.metadata?.grade && effectiveWorkType(t) === "teaching")
    .slice()
    .sort((a, b) => new Date(b.done_at || b.created_at) - new Date(a.done_at || a.created_at))
    .slice(0, 5);
}

function classKey(task) {
  const name = (task.metadata?.class_name || "").trim();
  return name || "Unassigned class";
}

function renderClassroom() {
  const list = document.getElementById("classroom-list");
  const empty = document.getElementById("classroom-empty");
  const classesWrap = document.getElementById("classroom-classes");
  const statsEl = document.getElementById("classroom-stats");
  if (!list) return;

  const active = activeLessons();
  const graded = recentlyGraded();
  const doneToday = classroomCompletedTodayCount();
  statsEl.textContent = `${active.length} active ${active.length === 1 ? "lesson" : "lessons"} · ${doneToday} graded today`;

  if (!active.length && !graded.length) {
    list.innerHTML = ""; classesWrap.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const byClass = new Map();
  active.forEach((t) => {
    const key = classKey(t);
    if (!byClass.has(key)) byClass.set(key, []);
    byClass.get(key).push(t);
  });

  const sortedClasses = Array.from(byClass.keys()).sort((a, b) => a === "Unassigned class" ? 1 : b === "Unassigned class" ? -1 : a.localeCompare(b));

  classesWrap.innerHTML = sortedClasses.map((c) =>
    `<span class="meta-chip text-ink-soft"><i class="fa-solid fa-chalkboard"></i>${escapeHTML(c)} · ${byClass.get(c).length}</span>`
  ).join("");

  const classSections = sortedClasses.map((c) => `
    <p class="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mt-3 mb-1.5 first:mt-0">${escapeHTML(c)}</p>
    ${byClass.get(c).map(classroomRowHTML).join("")}
  `).join("");

  const gradedSection = graded.length ? `
    <p class="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mt-3 mb-1.5">Recently graded</p>
    ${graded.map((t) => `
      <div class="ticket p-2.5 flex items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm truncate">${escapeHTML(t.title)}</p>
          ${t.metadata?.student_name ? `<p class="text-[11px] text-ink-soft truncate">${escapeHTML(t.metadata.student_name)}</p>` : ""}
        </div>
        <span class="meta-chip shrink-0 text-teal">${escapeHTML(t.metadata.grade)}</span>
      </div>`).join("")}` : "";

  list.innerHTML = classSections + gradedSection;
}

function classroomRowHTML(t) {
  const student = t.metadata?.student_name || "";
  const meetingLink = t.metadata?.meeting_link || "";
  return `
    <div class="ticket p-2.5" data-cls-task="${t.id}">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">${escapeHTML(t.title)}</p>
          ${student ? `<p class="text-[11px] text-ink-soft truncate"><i class="fa-solid fa-user w-3"></i> ${escapeHTML(student)}</p>` : ""}
        </div>
        ${t.due_date ? `<span class="meta-chip shrink-0 text-ink-soft">${escapeHTML(t.due_date)}</span>` : ""}
      </div>
      <div class="flex items-center gap-2 mt-2">
        <button type="button" class="btn btn-primary text-xs !py-1.5 !px-3" data-cls-grade="${t.id}"><i class="fa-solid fa-check mr-1"></i>Mark graded</button>
        ${meetingLink ? `<a href="${escapeHTML(meetingLink)}" target="_blank" rel="noopener" class="btn btn-ghost text-xs !py-1.5 !px-3"><i class="fa-solid fa-video mr-1"></i>Join</a>` : ""}
        <button type="button" class="btn btn-ghost text-xs !py-1.5 !px-3" data-cls-open="${t.id}">Open</button>
      </div>
      <div class="hidden mt-2 flex flex-col gap-1.5" data-cls-grade-box="${t.id}">
        <input type="text" placeholder="Grade — e.g. 18/20, A, Pass" class="input text-sm w-full" data-cls-grade-input="${t.id}" />
        <input type="text" placeholder="Feedback (optional)" class="input text-sm w-full" data-cls-feedback-input="${t.id}" />
        <button type="button" class="btn btn-secondary text-xs !py-1.5 !px-3" data-cls-grade-confirm="${t.id}">Confirm grade</button>
      </div>
    </div>`;
}

async function gradeAndComplete(taskId, grade, feedback) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  task.metadata = { ...(task.metadata || {}), grade: grade || "Graded", ...(feedback ? { grade_feedback: feedback } : {}) };
  const { error } = await runOrQueue({ type: "update", table: "tasks", id: taskId, payload: { metadata: task.metadata } }, () =>
    supabaseClient.from("tasks").update({ metadata: task.metadata }).eq("id", taskId)
  );
  if (error) { toast("Couldn't save grade: " + error.message, "error"); return; }

  await toggleComplete(taskId);
  renderClassroom();
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("classroom-modal");

  document.getElementById("classroom-btn")?.addEventListener("click", () => {
    modal?.classList.remove("hidden");
    state.classroomQuery = "";
    const search = document.getElementById("classroom-search");
    if (search) search.value = "";
    renderClassroom();
  });
  document.querySelectorAll("[data-close-classroom]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("classroom-search")?.addEventListener("input", (e) => {
    state.classroomQuery = e.target.value;
    renderClassroom();
  });

  document.getElementById("classroom-list")?.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-cls-open]");
    if (openBtn) {
      modal?.classList.add("hidden");
      openEditModal(openBtn.dataset.clsOpen);
      return;
    }
    const gradeBtn = e.target.closest("[data-cls-grade]");
    if (gradeBtn) {
      document.querySelector(`[data-cls-grade-box="${gradeBtn.dataset.clsGrade}"]`)?.classList.remove("hidden");
      return;
    }
    const confirmBtn = e.target.closest("[data-cls-grade-confirm]");
    if (confirmBtn) {
      const taskId = confirmBtn.dataset.clsGradeConfirm;
      const gradeInput = document.querySelector(`[data-cls-grade-input="${taskId}"]`);
      const feedbackInput = document.querySelector(`[data-cls-feedback-input="${taskId}"]`);
      gradeAndComplete(taskId, gradeInput?.value.trim() || "", feedbackInput?.value.trim() || "");
    }
  });

  // Initial hidden/visible state on first load, since applyTerminology
  // only runs again on a later board switch.
  updateClassroomButtonVisibility();
});
