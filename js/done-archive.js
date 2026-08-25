/* ==========================================================================
   BOARDLY - done-archive.js  ("Done Archive")
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/done-archive.js" defer></script>

   Needs NOTHING new in Supabase - it reads the same `tasks` rows the
   Done column already shows, using the `done_at` column that already
   exists (schema_v6_visual.sql). If that migration hasn't been run,
   this still works, it just falls back to `created_at` for sorting.

   THE PROBLEM THIS SOLVES: the Done column has no ceiling. Every task
   you ever finish stays there forever, so a board that's been used for
   a while ends up with a Done column many times longer than the other
   two, and the only existing way to deal with that was the trash icon
   in the column header - which deletes EVERYTHING in Done at once,
   with no way to keep the older ones on record first.

   THE FIX: the Done column itself now only ever shows your most
   recently completed tasks (DONE_COLUMN_LIMIT below). Once you've
   completed more than that, a calm "+N more completed - View all"
   card appears at the bottom of the column instead of an
   ever-growing wall of tickets. Clicking it opens the Done Archive: a
   dedicated, searchable, date-grouped view of every completed task,
   where you can restore one back to your board or clear out old ones
   in a controlled way - never all-or-nothing.

   Nothing is hidden from Supabase and nothing is deleted by this
   module on its own - it only changes how many finished cards render
   inline in the column at once. Every task is still fully there, in
   the archive, until you explicitly restore or delete it.
   ========================================================================== */

const DONE_COLUMN_LIMIT = 6; // how many finished cards stay visible in the Done column itself

state.doneArchiveQuery = "";

/** All of the current board's done tasks, newest-finished first. */
function allDoneTasksSorted() {
  return state.tasks
    .filter((t) => t.status === "done")
    .slice()
    .sort((a, b) => new Date(b.done_at || b.created_at) - new Date(a.done_at || a.created_at));
}

function doneArchiveFooterHTML(hiddenCount) {
  if (hiddenCount <= 0) return "";
  return `
    <button type="button" id="done-archive-open-btn"
      class="w-full text-center text-xs text-ink-soft hover:text-orange transition-colors py-2.5 border border-dashed border-line rounded-[10px] mt-1">
      <i class="fa-solid fa-box-archive mr-1"></i>+${hiddenCount} more completed — View all
    </button>`;
}

/** Wraps renderBoard so the Done column specifically gets capped, without
 *  touching how the other two columns render at all - see file 2g pattern
 *  ("wrap the existing function") used across every earlier add-on. */
const _originalRenderBoardForDoneArchive = window.renderBoard;
if (typeof _originalRenderBoardForDoneArchive === "function") {
  window.renderBoard = function (...args) {
    const result = _originalRenderBoardForDoneArchive.apply(this, args);
    capDoneColumn();
    return result;
  };
}

function capDoneColumn() {
  // Only cap when the board isn't currently filtered/searched - a search
  // result should always show every match, never quietly hide some.
  if (state.filterQuery && state.filterQuery.trim()) return;

  const container = document.getElementById("col-done");
  if (!container) return;

  const doneCards = allDoneTasksSorted();
  if (doneCards.length <= DONE_COLUMN_LIMIT) return; // nothing to cap

  const keepIds = new Set(doneCards.slice(0, DONE_COLUMN_LIMIT).map((t) => t.id));
  container.querySelectorAll("[data-id]").forEach((el) => {
    if (el.dataset.id && !keepIds.has(el.dataset.id) && el.closest("#col-done") === container) {
      el.remove();
    }
  });
  document.getElementById("done-archive-open-btn")?.remove();
  container.insertAdjacentHTML("beforeend", doneArchiveFooterHTML(doneCards.length - DONE_COLUMN_LIMIT));
}

// ---- the archive modal itself ----

function daysAgoLabel(dateStr) {
  const d = new Date(dateStr);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const then = new Date(d); then.setHours(0, 0, 0, 0);
  const diff = Math.round((today - then) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return "This week";
  if (diff < 30) return "This month";
  return "Earlier";
}

const ARCHIVE_GROUP_ORDER = ["Today", "Yesterday", "This week", "This month", "Earlier"];

function renderDoneArchive() {
  const list = document.getElementById("done-archive-list");
  const empty = document.getElementById("done-archive-empty");
  const statsEl = document.getElementById("done-archive-stats");
  if (!list) return;

  const all = allDoneTasksSorted();
  const q = state.doneArchiveQuery.trim().toLowerCase();
  const filtered = q
    ? all.filter((t) => t.title.toLowerCase().includes(q) || (CATEGORY_LABEL[t.category] || "").toLowerCase().includes(q))
    : all;

  if (statsEl) {
    const weekAgo = Date.now() - 7 * 86400000;
    const thisWeek = all.filter((t) => new Date(t.done_at || t.created_at).getTime() >= weekAgo).length;
    statsEl.textContent = `${all.length} completed total · ${thisWeek} in the last 7 days`;
  }

  if (!filtered.length) {
    list.innerHTML = "";
    if (empty) {
      empty.classList.remove("hidden");
      empty.textContent = q ? "No completed tasks match that search." : "Nothing completed yet.";
    }
    return;
  }
  if (empty) empty.classList.add("hidden");

  const groups = new Map();
  filtered.forEach((t) => {
    const g = daysAgoLabel(t.done_at || t.created_at);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(t);
  });

  list.innerHTML = ARCHIVE_GROUP_ORDER
    .filter((g) => groups.has(g))
    .map((g) => `
      <p class="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mt-3 mb-1.5 first:mt-0">${g}</p>
      ${groups.get(g).map(doneArchiveRowHTML).join("")}
    `).join("");
}

function doneArchiveRowHTML(t) {
  const dateLabel = (t.done_at || t.created_at || "").slice(0, 10);
  return `
    <div class="ticket p-2.5 flex items-center gap-2.5" data-archive-row="${t.id}">
      <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:var(--teal)"></span>
      <div class="min-w-0 flex-1">
        <p class="text-sm truncate line-through decoration-1 decoration-ink-soft/40">${escapeHTML(t.title)}</p>
        <p class="text-[11px] text-ink-soft">${escapeHTML(CATEGORY_LABEL[t.category] || "General")} · finished ${escapeHTML(dateLabel)}</p>
      </div>
      <button type="button" data-archive-restore="${t.id}" title="Move back to To do" class="btn-icon-xs shrink-0"><i class="fa-solid fa-rotate-left"></i></button>
      <button type="button" data-archive-delete="${t.id}" title="Delete permanently" class="btn-icon-xs shrink-0"><i class="fa-regular fa-trash-can"></i></button>
    </div>`;
}

/** Deletes every done task older than `days`, in one batch, after a clear confirm. */
async function clearDoneOlderThan(days) {
  const cutoff = Date.now() - days * 86400000;
  const targets = allDoneTasksSorted().filter((t) => new Date(t.done_at || t.created_at).getTime() < cutoff);
  if (!targets.length) { toast(`Nothing completed more than ${days} days ago`, "error"); return; }

  const confirmed = await showConfirmModal(
    `Permanently delete ${targets.length} task${targets.length === 1 ? "" : "s"} completed more than ${days} days ago? This can't be undone.`,
    { title: "Clear old completed tasks?", confirmLabel: `Delete ${targets.length}` }
  );
  if (!confirmed) return;

  const ids = targets.map((t) => t.id);
  const backup = state.tasks;
  state.tasks = state.tasks.filter((t) => !ids.includes(t.id));
  renderBoard();
  renderDoneArchive();

  const { error } = await supabaseClient.from("tasks").delete().in("id", ids);
  if (error) {
    state.tasks = backup;
    renderBoard();
    renderDoneArchive();
    toast("Couldn't clear old tasks: " + error.message, "error");
  } else {
    toast(`${ids.length} old completed task${ids.length === 1 ? "" : "s"} cleared`, "ok");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("done-archive-modal");

  function openDoneArchive() {
    modal?.classList.remove("hidden");
    state.doneArchiveQuery = "";
    const search = document.getElementById("done-archive-search");
    if (search) search.value = "";
    renderDoneArchive();
  }

  document.getElementById("col-done")?.addEventListener("click", (e) => {
    if (e.target.closest("#done-archive-open-btn")) openDoneArchive();
  });
  document.getElementById("done-archive-header-btn")?.addEventListener("click", openDoneArchive);

  document.querySelectorAll("[data-close-done-archive]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("done-archive-search")?.addEventListener("input", (e) => {
    state.doneArchiveQuery = e.target.value;
    renderDoneArchive();
  });

  document.getElementById("done-archive-list")?.addEventListener("click", (e) => {
    const restoreBtn = e.target.closest("[data-archive-restore]");
    if (restoreBtn) {
      toggleComplete(restoreBtn.dataset.archiveRestore);
      setTimeout(renderDoneArchive, 0);
      return;
    }
    const deleteBtn = e.target.closest("[data-archive-delete]");
    if (deleteBtn) {
      deleteTask(deleteBtn.dataset.archiveDelete);
      setTimeout(renderDoneArchive, 0);
    }
  });

  document.getElementById("done-archive-clear-30")?.addEventListener("click", () => clearDoneOlderThan(30));
  document.getElementById("done-archive-clear-90")?.addEventListener("click", () => clearDoneOlderThan(90));
});
