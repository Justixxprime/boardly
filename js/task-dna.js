/* ==========================================================================
   BOARDLY - task-dna.js  ("Task DNA" v1)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/task-dna.js"></script>

   Needs NOTHING new in Supabase - it's built entirely on top of the two
   counters Friction Detector already added (postponement_count,
   reopen_count - schema_v26_friction_detector.sql) plus columns that
   already existed before that (created_at, done_at). If
   schema_v26 hasn't been run yet, the counters simply read as 0/undefined
   and the strip just shows nothing extra - same "explain, don't break"
   rule as every other add-on here.

   WHAT THIS IS: Friction Detector already tells you, on the Insights
   page, which tasks board-wide have been pushed back 3+ times or
   reopened 2+ times. What it never did is show you a task's own story
   while you're actually looking at IT - so this adds two small,
   honest things instead of a full history log (deliberately - see the
   comment in schema_v26 explaining why two counters were chosen over
   a full audit trail; this keeps that same discipline):

     1. A small subtle badge on the card itself, on the board, for ANY
        task with at least one postponement or reopen on record - not
        just the ones severe enough to make the Insights list. It's a
        quiet grey dna icon normally, and only turns orange once a
        task crosses Friction Detector's own severity bar (3+
        postponements or 2+ reopens) - so the color language stays
        consistent between the board and Insights instead of inventing
        a second scale.

     2. A "Task DNA" strip inside the edit modal - when you actually
        open a ticket, it shows how long it took to finish (if done),
        how long it's been open (if not), and, only when the number is
        actually greater than zero, how many times it's been pushed
        back or reopened. A task with a clean record shows nothing
        here at all - the strip stays fully hidden rather than
        printing "0 times" at you, same rule stats.js already follows
        for Friction Detector itself.

   The card badge is added directly inside taskCardHTML in dashboard.js
   (one line, right next to the existing Blocked badge) rather than as
   a separate wrap, because taskCardHTML is a pure string-builder, not
   a place that lends itself to the "wrap the function" pattern used
   everywhere else in this file. Everything else here follows that
   pattern normally.
   ========================================================================== */

function taskDnaDaysBetween(a, b) {
  const start = new Date(a); start.setHours(0, 0, 0, 0);
  const end = new Date(b); end.setHours(0, 0, 0, 0);
  return Math.round((end - start) / 86400000);
}

function taskDnaChipsHTML(task) {
  const chips = [];

  if (task.status === "done" && task.done_at && task.created_at) {
    const took = taskDnaDaysBetween(task.created_at, task.done_at);
    chips.push(`<span class="meta-chip text-teal"><i class="fa-solid fa-flag-checkered"></i>Took ${took <= 0 ? "less than a day" : took === 1 ? "1 day" : `${took} days`}</span>`);
  } else if (task.status !== "done" && task.created_at) {
    const open = taskDnaDaysBetween(task.created_at, new Date());
    if (open >= 1) chips.push(`<span class="meta-chip text-ink-soft"><i class="fa-regular fa-hourglass-half"></i>Open ${open} day${open === 1 ? "" : "s"}</span>`);
  }

  if (task.postponement_count >= 1) {
    chips.push(`<span class="meta-chip ${task.postponement_count >= 3 ? "text-orange" : "text-ink-soft"}"><i class="fa-solid fa-calendar-days"></i>Pushed back ${task.postponement_count}x</span>`);
  }
  if (task.reopen_count >= 1) {
    chips.push(`<span class="meta-chip ${task.reopen_count >= 2 ? "text-orange" : "text-ink-soft"}"><i class="fa-solid fa-rotate-left"></i>Reopened ${task.reopen_count}x</span>`);
  }

  return chips;
}

function renderTaskDnaStrip(task) {
  const strip = document.getElementById("task-dna-strip");
  if (!strip) return;
  const chips = taskDnaChipsHTML(task);
  if (!chips.length) { strip.classList.add("hidden"); strip.innerHTML = ""; return; }
  strip.innerHTML = chips.join("");
  strip.classList.remove("hidden");
}

/** Wraps the existing openEditModal so Task DNA fills in right after
 *  everything else the modal already sets up - see file 2g pattern
 *  ("wrap the existing function") used across every earlier add-on. */
const _originalOpenEditModalForTaskDna = window.openEditModal;
if (typeof _originalOpenEditModalForTaskDna === "function") {
  window.openEditModal = function (id) {
    const result = _originalOpenEditModalForTaskDna.apply(this, arguments);
    const task = state.tasks.find((t) => t.id === id);
    if (task) renderTaskDnaStrip(task);
    return result;
  };
}
