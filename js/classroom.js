/* ==========================================================================
   BOARDLY - classroom.js  ("Classroom Command Center" v2)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/classroom.js"></script>

   v1 needed NOTHING new in Supabase - teaching boards already store
   class_name and student_name inside the existing metadata jsonb column
   (schema_v14_vertical_fields.sql), and the teaching vertical's own
   column labels already call "Done" GRADED (see TERMINOLOGY.teaching in
   dashboard.js) - this module leans into that existing meaning rather
   than inventing a new status system: marking a lesson done here IS
   grading it.

   WHAT THIS IS: a dedicated view for "what's still to teach or grade,
   organized by class" - the same shape as the Logistics Control Tower,
   for a teacher instead of a dispatcher. It only ever appears on boards
   whose work_type is "teaching" - every other board is unaffected and
   the button stays hidden.

   v1 → v1.1: added a search box (same pattern as Done Archive's) and a
   "completed today" count, so this whole family of views (Control
   Tower, Classroom, Dispatch, Care Rounds) behaves consistently.

   v1.1 → v1.2: tasks can now individually override their own type
   (schema_v28_task_type_override.sql) - read through effectiveWorkType()
   rather than assuming every task on the board is a teaching task.

   v1.2 → v2 (THIS UPDATE - needs supabase/schema_v32_classroom_v2.sql):
   the three things v1's own doc said were missing.
     1. REAL ROSTERS - a class can now have actual named students
        (class_rosters table), not just a free-text "Student(s)" field.
     2. PER-STUDENT GRADEBOOK - grading a lesson for a class with a
        roster gives you one grade row per student (assignment_grades
        table) instead of one grade string for the whole lesson. Class
        averages and a CSV export come from this same table.
     3. GRADING RUBRICS - a reusable scoring template (grading_rubrics +
        rubric_criteria) you can attach while grading; Boardly adds up
        the points for you instead of you doing the arithmetic.
   BACKWARDS COMPATIBLE ON PURPOSE: a class with no roster rows, and a
   lesson graded with no rubric selected, behaves EXACTLY like v1 always
   did - one free-text grade, straight onto the ticket's own summary.
   Nothing breaks if you never touch Roster or Rubrics at all, and until
   schema_v32 is run, both buttons say so plainly instead of erroring.
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

// ---------------------------------------------------------------------
// v2 state - rosters, rubrics, and the gradebook. All scoped to
// whichever board is currently open; reloaded fresh every time the
// Classroom modal is opened, so switching boards just works.
// ---------------------------------------------------------------------
state.classroomV2Ready = false;
state.classroomRoster = [];             // class_rosters rows for this board
state.classroomRubrics = [];            // grading_rubrics rows for this board, each with a .criteria array
state.classroomGrades = [];             // assignment_grades rows for this board
state.classroomRubricCriteriaDraft = []; // in-progress rows while building a new rubric

async function checkClassroomV2Ready() {
  const { error } = await supabaseClient.from("class_rosters").select("id").limit(1);
  state.classroomV2Ready = !error;
  return state.classroomV2Ready;
}

async function loadClassroomV2Data() {
  if (!state.classroomV2Ready || !state.currentBoardId) {
    state.classroomRoster = []; state.classroomRubrics = []; state.classroomGrades = [];
    return;
  }
  const boardId = state.currentBoardId;
  const [rosterRes, rubricRes, gradesRes] = await Promise.all([
    supabaseClient.from("class_rosters").select("*").eq("board_id", boardId).eq("archived", false)
      .order("class_name", { ascending: true }).order("student_name", { ascending: true }),
    supabaseClient.from("grading_rubrics").select("*, rubric_criteria(*)").eq("board_id", boardId)
      .order("created_at", { ascending: true }),
    supabaseClient.from("assignment_grades").select("*").eq("board_id", boardId),
  ]);
  if (rosterRes.error) console.warn("loadClassroomV2Data (roster):", rosterRes.error.message);
  if (rubricRes.error) console.warn("loadClassroomV2Data (rubrics):", rubricRes.error.message);
  if (gradesRes.error) console.warn("loadClassroomV2Data (grades):", gradesRes.error.message);
  state.classroomRoster = rosterRes.data || [];
  state.classroomRubrics = (rubricRes.data || []).map((r) => ({
    ...r,
    criteria: (r.rubric_criteria || []).slice().sort((a, b) => a.sort_order - b.sort_order),
  }));
  state.classroomGrades = gradesRes.data || [];
}

function rosterForClass(className) {
  return state.classroomRoster.filter((s) => s.class_name === className);
}

function gradesForTask(taskId) {
  return state.classroomGrades.filter((g) => g.task_id === taskId);
}

function classAveragePct(className) {
  const rows = state.classroomGrades.filter((g) => g.class_name === className && g.max_score);
  if (!rows.length) return null;
  const pct = rows.reduce((sum, g) => sum + g.score / g.max_score, 0) / rows.length;
  return Math.round(pct * 100);
}

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

  classesWrap.innerHTML = sortedClasses.map((c) => {
    const avg = c === "Unassigned class" ? null : classAveragePct(c);
    return `<span class="meta-chip text-ink-soft"><i class="fa-solid fa-chalkboard"></i>${escapeHTML(c)} · ${byClass.get(c).length}${avg != null ? ` · avg ${avg}%` : ""}</span>`;
  }).join("");

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
  const hasRubrics = state.classroomRubrics.length > 0;
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
      <div class="hidden mt-2 flex flex-col gap-2" data-cls-grade-box="${t.id}">
        ${hasRubrics ? `
        <select class="input text-xs w-full" data-cls-rubric-select="${t.id}">
          <option value="">No rubric (simple grade)</option>
          ${state.classroomRubrics.map((r) => `<option value="${r.id}" ${t.metadata?.rubric_id === r.id ? "selected" : ""}>${escapeHTML(r.name)}</option>`).join("")}
        </select>` : ""}
        <div data-cls-grade-rows="${t.id}" class="space-y-1.5"></div>
        <button type="button" class="btn btn-secondary text-xs !py-1.5 !px-3" data-cls-grade-confirm="${t.id}">Confirm grade</button>
      </div>
    </div>`;
}

/** Builds the actual grading inputs for one lesson: one row per roster
 *  student if the lesson's class has a roster, otherwise a single row
 *  (falls back to the lesson's free-text "Student(s)" field, or just
 *  "This lesson" if that's blank too - matches v1 exactly in that case).
 *  If a rubric is selected, each row gets one number input per
 *  criterion instead of one free-text grade box. */
function gradeRowsHTML(task, rubricId) {
  const className = classKey(task);
  const roster = className === "Unassigned class" ? [] : rosterForClass(className);
  const rubric = rubricId ? state.classroomRubrics.find((r) => r.id === rubricId) : null;
  const existing = gradesForTask(task.id);
  const findExisting = (studentName) => existing.find((g) => g.student_name === studentName);
  const students = roster.length ? roster.map((s) => s.student_name) : [(task.metadata?.student_name || "").trim() || "This lesson"];

  return students.map((name) => {
    const prior = findExisting(name);
    if (rubric) {
      const criteriaInputs = rubric.criteria.map((c) => {
        const priorPts = prior?.criteria_scores?.[c.id]?.points;
        return `
          <div class="flex items-center gap-2">
            <span class="text-[11px] text-ink-soft flex-1 truncate">${escapeHTML(c.label)}</span>
            <input type="number" min="0" max="${c.max_points}" step="0.5" placeholder="/${c.max_points}"
              class="input text-xs w-16 !py-1 text-center" data-crit-input="${c.id}" data-crit-max="${c.max_points}"
              value="${priorPts != null ? priorPts : ""}" />
          </div>`;
      }).join("");
      return `
        <div class="border border-line rounded-lg p-2" data-grade-row data-student-name="${escapeHTML(name)}">
          <p class="text-xs font-medium mb-1.5">${escapeHTML(name)}</p>
          ${criteriaInputs}
          <input type="text" placeholder="Feedback (optional)" class="input text-xs w-full mt-1.5" data-grade-feedback value="${escapeHTML(prior?.feedback || "")}" />
        </div>`;
    }
    return `
      <div class="flex items-center gap-2" data-grade-row data-student-name="${escapeHTML(name)}">
        <span class="text-xs flex-1 truncate">${escapeHTML(name)}</span>
        <input type="text" placeholder="Grade: 18/20, A, Pass" class="input text-xs w-28 !py-1" data-grade-simple value="${escapeHTML(prior?.grade_label || "")}" />
      </div>`;
  }).join("");
}

function populateGradeRows(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const select = document.querySelector(`[data-cls-rubric-select="${taskId}"]`);
  const rubricId = select ? select.value : (task.metadata?.rubric_id || "");
  const container = document.querySelector(`[data-cls-grade-rows="${taskId}"]`);
  if (container) container.innerHTML = gradeRowsHTML(task, rubricId || null);
}

/** Reads every grade row the teacher just filled in, saves one
 *  assignment_grades row per student (upsert - re-grading the same
 *  lesson just updates the existing rows), rolls a plain-text summary
 *  back onto the task itself for backward compatibility with the
 *  existing "Recently graded" list, then completes the lesson exactly
 *  like v1 always did. */
async function saveGradesAndComplete(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  const boardId = state.currentBoardId;
  const className = classKey(task);
  const classNameForRow = className === "Unassigned class" ? null : className;
  const select = document.querySelector(`[data-cls-rubric-select="${taskId}"]`);
  const rubricId = select?.value || null;
  const rubric = rubricId ? state.classroomRubrics.find((r) => r.id === rubricId) : null;

  const rows = document.querySelectorAll(`[data-cls-grade-rows="${taskId}"] [data-grade-row]`);
  const upserts = [];
  rows.forEach((row) => {
    const studentName = row.dataset.studentName;
    const rosterRow = classNameForRow ? state.classroomRoster.find((s) => s.class_name === className && s.student_name === studentName) : null;
    if (rubric) {
      const criteriaScores = {};
      let total = 0, maxTotal = 0;
      row.querySelectorAll("[data-crit-input]").forEach((input) => {
        const critId = input.dataset.critInput;
        const max = parseFloat(input.dataset.critMax) || 0;
        const pts = input.value === "" ? 0 : Math.max(0, Math.min(parseFloat(input.value) || 0, max));
        criteriaScores[critId] = { points: pts };
        total += pts; maxTotal += max;
      });
      const feedback = row.querySelector("[data-grade-feedback]")?.value.trim() || null;
      upserts.push({
        task_id: taskId, board_id: boardId, class_name: classNameForRow, student_name: studentName,
        roster_id: rosterRow?.id || null, grade_label: null, score: total, max_score: maxTotal,
        criteria_scores: criteriaScores, feedback, graded_at: new Date().toISOString(),
      });
    } else {
      const label = row.querySelector("[data-grade-simple]")?.value.trim() || "";
      upserts.push({
        task_id: taskId, board_id: boardId, class_name: classNameForRow, student_name: studentName,
        roster_id: rosterRow?.id || null, grade_label: label || "Graded", score: null, max_score: null,
        criteria_scores: {}, feedback: null, graded_at: new Date().toISOString(),
      });
    }
  });

  if (state.classroomV2Ready && upserts.length) {
    const { error } = await supabaseClient.from("assignment_grades").upsert(upserts, { onConflict: "task_id,student_name" });
    if (error) { toast("Couldn't save grades: " + error.message, "error"); return; }
    const { data: refreshed, error: refreshError } = await supabaseClient.from("assignment_grades").select("*").eq("task_id", taskId);
    if (!refreshError) {
      state.classroomGrades = state.classroomGrades.filter((g) => g.task_id !== taskId).concat(refreshed || []);
    }
  }

  // Roll a plain-text summary back onto the task, so every existing v1
  // display (the "Recently graded" list here, anywhere else metadata.grade
  // is read) keeps showing something sensible without any changes there.
  let summary;
  if (upserts.length === 1) {
    summary = upserts[0].grade_label || (upserts[0].max_score ? `${upserts[0].score}/${upserts[0].max_score}` : "Graded");
  } else if (upserts.length > 1) {
    const scored = upserts.filter((u) => u.max_score);
    summary = scored.length
      ? `${upserts.length} graded · avg ${Math.round((scored.reduce((s, u) => s + u.score / u.max_score, 0) / scored.length) * 100)}%`
      : `${upserts.length} graded`;
  } else {
    summary = "Graded";
  }
  task.metadata = { ...(task.metadata || {}), grade: summary, ...(rubricId ? { rubric_id: rubricId } : {}) };
  const { error: taskError } = await runOrQueue({ type: "update", table: "tasks", id: taskId, payload: { metadata: task.metadata } }, () =>
    supabaseClient.from("tasks").update({ metadata: task.metadata }).eq("id", taskId)
  );
  if (taskError) { toast("Couldn't save grade: " + taskError.message, "error"); return; }

  await toggleComplete(taskId);
  renderClassroom();
}

function exportGradebookCSV() {
  if (!state.classroomGrades.length) { toast("No grades saved for this board yet.", "error"); return; }
  const header = ["Class", "Student", "Assignment", "Grade", "Score", "Max score", "Feedback", "Graded at"];
  const rows = state.classroomGrades.map((g) => {
    const task = state.tasks.find((t) => t.id === g.task_id);
    return [
      g.class_name || "", g.student_name, task?.title || "", g.grade_label || "",
      g.score ?? "", g.max_score ?? "", g.feedback || "", g.graded_at ? new Date(g.graded_at).toISOString() : "",
    ];
  });
  const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "boardly-gradebook.csv";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast("Gradebook exported", "ok");
}

// ---------------------------------------------------------------------
// ROSTER MODAL
// ---------------------------------------------------------------------
function renderRosterList() {
  const list = document.getElementById("roster-list");
  const empty = document.getElementById("roster-empty");
  const notReady = document.getElementById("roster-not-ready");
  const datalist = document.getElementById("roster-class-datalist");
  if (!list) return;

  if (!state.classroomV2Ready) {
    list.innerHTML = ""; empty.classList.add("hidden"); notReady.classList.remove("hidden");
    return;
  }
  notReady.classList.add("hidden");

  // Known classes for the datalist: every roster class, plus any
  // class_name already used on this board's lessons - so a class you've
  // typed on a ticket but never rostered yet still gets suggested.
  const known = new Set(state.classroomRoster.map((s) => s.class_name));
  state.tasks.forEach((t) => { if (t.metadata?.class_name) known.add(t.metadata.class_name); });
  if (datalist) datalist.innerHTML = Array.from(known).sort().map((c) => `<option value="${escapeHTML(c)}"></option>`).join("");

  if (!state.classroomRoster.length) {
    list.innerHTML = ""; empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const byClass = new Map();
  state.classroomRoster.forEach((s) => {
    if (!byClass.has(s.class_name)) byClass.set(s.class_name, []);
    byClass.get(s.class_name).push(s);
  });

  list.innerHTML = Array.from(byClass.keys()).sort().map((c) => `
    <div>
      <p class="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1">${escapeHTML(c)} · ${byClass.get(c).length}</p>
      ${byClass.get(c).map((s) => `
        <div class="flex items-center justify-between gap-2 py-1">
          <div class="min-w-0">
            <p class="text-sm truncate">${escapeHTML(s.student_name)}</p>
            ${s.student_email ? `<p class="text-[11px] text-ink-soft truncate">${escapeHTML(s.student_email)}</p>` : ""}
          </div>
          <button type="button" class="btn-icon-xs shrink-0" title="Remove from roster" data-roster-remove="${s.id}"><i class="fa-solid fa-trash-can text-[10px]"></i></button>
        </div>`).join("")}
    </div>`).join("");
}

async function addRosterStudent(className, studentName, email) {
  if (!state.classroomV2Ready) { toast("Run the Classroom v2 database update first. See CLASSROOM_V2_SETUP.md", "error"); return; }
  const row = { board_id: state.currentBoardId, class_name: className, student_name: studentName, student_email: email || null };
  const { data, error } = await supabaseClient.from("class_rosters").insert(row).select().single();
  if (error) { toast("Couldn't add student: " + error.message, "error"); return; }
  state.classroomRoster.push(data);
  state.classroomRoster.sort((a, b) => a.class_name.localeCompare(b.class_name) || a.student_name.localeCompare(b.student_name));
  renderRosterList();
  renderClassroom(); // class chips / avg may need to reflect the newly-rostered class
}

async function archiveRosterStudent(id) {
  const { error } = await supabaseClient.from("class_rosters").update({ archived: true }).eq("id", id);
  if (error) { toast("Couldn't remove student: " + error.message, "error"); return; }
  state.classroomRoster = state.classroomRoster.filter((s) => s.id !== id);
  renderRosterList();
  renderClassroom();
}

// ---------------------------------------------------------------------
// GRADING RUBRICS MODAL
// ---------------------------------------------------------------------
function renderRubricList() {
  const list = document.getElementById("rubric-list");
  const empty = document.getElementById("rubric-empty");
  if (!list) return;
  if (!state.classroomRubrics.length) { list.innerHTML = ""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");
  list.innerHTML = state.classroomRubrics.map((r) => {
    const total = r.criteria.reduce((s, c) => s + Number(c.max_points || 0), 0);
    return `
      <div class="border border-line rounded-lg p-2.5">
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm font-medium truncate">${escapeHTML(r.name)}</p>
          <div class="flex items-center gap-1 shrink-0">
            <span class="meta-chip text-ink-soft">/${total}</span>
            <button type="button" class="btn-icon-xs" title="Delete rubric" data-rubric-delete="${r.id}"><i class="fa-solid fa-trash-can text-[10px]"></i></button>
          </div>
        </div>
        <p class="text-[11px] text-ink-soft mt-1">${r.criteria.map((c) => `${escapeHTML(c.label)} /${c.max_points}`).join(" · ") || "No criteria yet"}</p>
      </div>`;
  }).join("");
}

function renderRubricBuilderRows() {
  const wrap = document.getElementById("rubric-criteria-rows");
  if (!wrap) return;
  wrap.innerHTML = state.classroomRubricCriteriaDraft.map((row, i) => `
    <div class="flex items-center gap-2" data-draft-row="${i}">
      <input type="text" placeholder="Criterion, e.g. Thesis" class="input text-xs flex-1" data-draft-label value="${escapeHTML(row.label)}" />
      <input type="number" min="0" step="0.5" placeholder="Max pts" class="input text-xs w-20" data-draft-max value="${row.max_points}" />
      <button type="button" class="btn-icon-xs" data-draft-remove="${i}"><i class="fa-solid fa-xmark text-[10px]"></i></button>
    </div>`).join("");
}

function syncRubricDraftFromDOM() {
  document.querySelectorAll("#rubric-criteria-rows [data-draft-row]").forEach((rowEl) => {
    const i = parseInt(rowEl.dataset.draftRow, 10);
    if (!state.classroomRubricCriteriaDraft[i]) return;
    state.classroomRubricCriteriaDraft[i].label = rowEl.querySelector("[data-draft-label]")?.value || "";
    state.classroomRubricCriteriaDraft[i].max_points = rowEl.querySelector("[data-draft-max]")?.value || 10;
  });
}

async function saveRubric(name) {
  if (!state.classroomV2Ready) { toast("Run the Classroom v2 database update first. See CLASSROOM_V2_SETUP.md", "error"); return; }
  syncRubricDraftFromDOM();
  const criteria = state.classroomRubricCriteriaDraft
    .map((r) => ({ label: (r.label || "").trim(), max_points: parseFloat(r.max_points) || 0 }))
    .filter((r) => r.label);
  if (!criteria.length) { toast("Add at least one criterion first.", "error"); return; }

  const { data: rubric, error } = await supabaseClient
    .from("grading_rubrics").insert({ board_id: state.currentBoardId, name }).select().single();
  if (error) { toast("Couldn't save rubric: " + error.message, "error"); return; }

  const criteriaRows = criteria.map((c, i) => ({ ...c, rubric_id: rubric.id, board_id: state.currentBoardId, sort_order: i }));
  const { data: savedCriteria, error: critError } = await supabaseClient.from("rubric_criteria").insert(criteriaRows).select();
  if (critError) { toast("Rubric saved, but criteria failed: " + critError.message, "error"); return; }

  state.classroomRubrics.push({ ...rubric, criteria: savedCriteria || [] });
  state.classroomRubricCriteriaDraft = [];
  renderRubricList();
  renderClassroom(); // grade-box rubric dropdowns need the new option
  document.getElementById("rubric-builder-form")?.classList.add("hidden");
  document.getElementById("rubric-name-input").value = "";
}

async function deleteRubric(id) {
  const { error } = await supabaseClient.from("grading_rubrics").delete().eq("id", id);
  if (error) { toast("Couldn't delete rubric: " + error.message, "error"); return; }
  state.classroomRubrics = state.classroomRubrics.filter((r) => r.id !== id);
  renderRubricList();
  renderClassroom();
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("classroom-modal");

  document.getElementById("classroom-btn")?.addEventListener("click", async () => {
    modal?.classList.remove("hidden");
    state.classroomQuery = "";
    const search = document.getElementById("classroom-search");
    if (search) search.value = "";
    await checkClassroomV2Ready();
    await loadClassroomV2Data();
    renderClassroom();
  });
  document.querySelectorAll("[data-close-classroom]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("classroom-search")?.addEventListener("input", (e) => {
    state.classroomQuery = e.target.value;
    renderClassroom();
  });

  document.getElementById("classroom-export-btn")?.addEventListener("click", exportGradebookCSV);

  document.getElementById("classroom-list")?.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-cls-open]");
    if (openBtn) {
      modal?.classList.add("hidden");
      openEditModal(openBtn.dataset.clsOpen);
      return;
    }
    const gradeBtn = e.target.closest("[data-cls-grade]");
    if (gradeBtn) {
      const taskId = gradeBtn.dataset.clsGrade;
      document.querySelector(`[data-cls-grade-box="${taskId}"]`)?.classList.remove("hidden");
      populateGradeRows(taskId);
      return;
    }
    const confirmBtn = e.target.closest("[data-cls-grade-confirm]");
    if (confirmBtn) {
      saveGradesAndComplete(confirmBtn.dataset.clsGradeConfirm);
    }
  });

  // A rubric select's change doesn't bubble as a click, so it needs its
  // own delegated listener - swapping rubrics re-draws that one lesson's
  // rows to match (plain grade box <-> per-criterion inputs).
  document.getElementById("classroom-list")?.addEventListener("change", (e) => {
    const select = e.target.closest("[data-cls-rubric-select]");
    if (select) populateGradeRows(select.dataset.clsRubricSelect);
  });

  // ---------------- Roster modal ----------------
  const rosterModal = document.getElementById("classroom-roster-modal");
  document.getElementById("classroom-roster-btn")?.addEventListener("click", () => {
    modal?.classList.add("hidden");
    rosterModal?.classList.remove("hidden");
    renderRosterList();
  });
  document.querySelectorAll("[data-close-classroom-roster]").forEach((el) =>
    el.addEventListener("click", () => {
      rosterModal?.classList.add("hidden");
      modal?.classList.remove("hidden");
    })
  );
  document.getElementById("roster-add-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const classInput = document.getElementById("roster-class-input");
    const studentInput = document.getElementById("roster-student-input");
    const emailInput = document.getElementById("roster-email-input");
    const className = classInput.value.trim();
    const studentName = studentInput.value.trim();
    if (!className || !studentName) return;
    await addRosterStudent(className, studentName, emailInput.value.trim());
    studentInput.value = ""; emailInput.value = "";
    studentInput.focus();
  });
  document.getElementById("roster-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-roster-remove]");
    if (btn) archiveRosterStudent(btn.dataset.rosterRemove);
  });

  // ---------------- Rubrics modal ----------------
  const rubricModal = document.getElementById("classroom-rubric-modal");
  document.getElementById("classroom-rubric-btn")?.addEventListener("click", () => {
    modal?.classList.add("hidden");
    rubricModal?.classList.remove("hidden");
    document.getElementById("rubric-builder-form")?.classList.add("hidden");
    renderRubricList();
  });
  document.querySelectorAll("[data-close-classroom-rubric]").forEach((el) =>
    el.addEventListener("click", () => {
      rubricModal?.classList.add("hidden");
      modal?.classList.remove("hidden");
    })
  );
  document.getElementById("rubric-new-btn")?.addEventListener("click", () => {
    state.classroomRubricCriteriaDraft = [{ label: "", max_points: 10 }];
    renderRubricBuilderRows();
    document.getElementById("rubric-builder-form")?.classList.remove("hidden");
  });
  document.getElementById("rubric-cancel-btn")?.addEventListener("click", () => {
    document.getElementById("rubric-builder-form")?.classList.add("hidden");
    state.classroomRubricCriteriaDraft = [];
  });
  document.getElementById("rubric-add-criterion-btn")?.addEventListener("click", () => {
    syncRubricDraftFromDOM();
    state.classroomRubricCriteriaDraft.push({ label: "", max_points: 10 });
    renderRubricBuilderRows();
  });
  document.getElementById("rubric-criteria-rows")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-draft-remove]");
    if (!btn) return;
    syncRubricDraftFromDOM();
    state.classroomRubricCriteriaDraft.splice(parseInt(btn.dataset.draftRemove, 10), 1);
    renderRubricBuilderRows();
  });
  document.getElementById("rubric-builder-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("rubric-name-input");
    const name = nameInput.value.trim();
    if (!name) return;
    saveRubric(name);
  });
  document.getElementById("rubric-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-rubric-delete]");
    if (btn) deleteRubric(btn.dataset.rubricDelete);
  });

  // Initial hidden/visible state on first load, since applyTerminology
  // only runs again on a later board switch.
  updateClassroomButtonVisibility();
});
