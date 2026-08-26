/* ==========================================================================
   BOARDLY - dev-board.js  ("Dev Board" v1)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/dev-board.js"></script>

   Needs NOTHING new in Supabase - seventh sibling of control-tower.js,
   classroom.js, dispatch.js, care-rounds.js, content-calendar.js and
   client-work.js, for the new Software / Web Dev vertical
   (TERMINOLOGY.software / VERTICAL_FIELDS.software in dashboard.js:
   Backlog → Building → Shipped, plus Repository / Tech stack /
   Staging link). It only ever appears on boards whose type is
   software, or that have at least one task individually set to it -
   see effectiveWorkType() in dashboard.js and
   schema_v28_task_type_override.sql.

   WHY THIS DOESN'T DUPLICATE THE EXISTING GIT_BRANCH/GIT_PR_URL
   FIELDS: those two (from schema_v11_dev_features.sql, gated behind
   state.devReady) are already generic "Pro" fields available on ANY
   task regardless of vertical - they're about the unit of work
   itself (which branch, which pull request). The new Repository /
   Tech stack / Staging link fields here are about the PROJECT a task
   belongs to, which is why Dev Board groups by Repository rather than
   duplicating branch/PR info.

   Marking something shipped here reuses the existing published_url /
   performance_note "Pro" columns (schema_v9_pro.sql) rather than
   inventing new metadata keys - the exact same reuse Content
   Calendar's "Mark published" already does, since "link to the live
   thing + a quick note" is the same shape whether the live thing is a
   social post or a shipped feature.
   ========================================================================== */

function isSoftwareBoard() {
  const board = state.boards.find((b) => b.id === state.currentBoardId);
  if ((board?.work_type || "general") === "software") return true;
  return state.tasks.some((t) => effectiveWorkType(t) === "software");
}

function updateDevBoardButtonVisibility() {
  document.getElementById("dev-board-btn")?.classList.toggle("hidden", !isSoftwareBoard());
}

/** Wraps applyTerminology - chains safely with every other vertical view's
 *  own wrap of the same function (file 2g pattern). */
const _originalApplyTerminologyForDevBoard = window.applyTerminology;
if (typeof _originalApplyTerminologyForDevBoard === "function") {
  window.applyTerminology = function (...args) {
    const result = _originalApplyTerminologyForDevBoard.apply(this, args);
    updateDevBoardButtonVisibility();
    return result;
  };
}

/** Also wraps renderBoard, needed since a single task's type can change
 *  without a board switch happening at all (chains safely with every
 *  other renderBoard wrap in this project, same 2g pattern). */
const _originalRenderBoardForDevBoard = window.renderBoard;
if (typeof _originalRenderBoardForDevBoard === "function") {
  window.renderBoard = function (...args) {
    const result = _originalRenderBoardForDevBoard.apply(this, args);
    updateDevBoardButtonVisibility();
    return result;
  };
}

state.devBoardQuery = "";

function activeDevTasks() {
  const q = state.devBoardQuery.trim().toLowerCase();
  let tasks = state.tasks.filter((t) => t.status !== "done" && effectiveWorkType(t) === "software");
  if (q) {
    tasks = tasks.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      (t.metadata?.repo_url || "").toLowerCase().includes(q) ||
      (t.metadata?.tech_stack || "").toLowerCase().includes(q)
    );
  }
  return tasks.slice().sort((a, b) => {
    const overdueA = isOverdue(a.due_date, a.status), overdueB = isOverdue(b.due_date, b.status);
    if (overdueA !== overdueB) return overdueA ? -1 : 1;
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return new Date(a.due_date) - new Date(b.due_date);
  });
}

function devBoardShippedTodayCount() {
  const today = new Date().toDateString();
  return state.tasks.filter((t) => t.status === "done" && t.done_at && new Date(t.done_at).toDateString() === today && effectiveWorkType(t) === "software").length;
}

function repoKey(task) {
  const repo = (task.metadata?.repo_url || "").trim();
  return repo || "No repository set";
}

function renderDevBoard() {
  const list = document.getElementById("dev-board-list");
  const empty = document.getElementById("dev-board-empty");
  const reposWrap = document.getElementById("dev-board-repos");
  const statsEl = document.getElementById("dev-board-stats");
  if (!list) return;

  const tasks = activeDevTasks();
  const overdueCount = tasks.filter((t) => isOverdue(t.due_date, t.status)).length;
  const shippedToday = devBoardShippedTodayCount();
  statsEl.textContent = `${tasks.length} active ${tasks.length === 1 ? "task" : "tasks"}${overdueCount ? ` · ${overdueCount} overdue` : ""} · ${shippedToday} shipped today`;

  if (!tasks.length) {
    list.innerHTML = ""; reposWrap.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const byRepo = new Map();
  tasks.forEach((t) => {
    const key = repoKey(t);
    if (!byRepo.has(key)) byRepo.set(key, []);
    byRepo.get(key).push(t);
  });
  const sortedRepos = Array.from(byRepo.keys()).sort((a, b) => a === "No repository set" ? 1 : b === "No repository set" ? -1 : a.localeCompare(b));

  reposWrap.innerHTML = sortedRepos.map((r) =>
    `<span class="meta-chip text-ink-soft"><i class="fa-solid fa-code-branch"></i>${escapeHTML(r)} · ${byRepo.get(r).length}</span>`
  ).join("");

  list.innerHTML = sortedRepos.map((r) => `
    <p class="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mt-3 mb-1.5 first:mt-0">${escapeHTML(r)}</p>
    ${byRepo.get(r).map(devBoardRowHTML).join("")}
  `).join("");
}

function devBoardRowHTML(t) {
  const overdue = isOverdue(t.due_date, t.status);
  const techStack = t.metadata?.tech_stack || "";
  const stagingUrl = t.metadata?.staging_url || "";
  return `
    <div class="ticket p-2.5" data-db-task="${t.id}">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">${escapeHTML(t.title)}</p>
          ${techStack ? `<p class="text-[11px] text-ink-soft truncate"><i class="fa-solid fa-layer-group w-3"></i> ${escapeHTML(techStack)}</p>` : ""}
        </div>
        ${t.due_date ? `<span class="meta-chip shrink-0 ${overdue ? "text-critical" : "text-ink-soft"}">${overdue ? "Overdue" : escapeHTML(t.due_date)}</span>` : ""}
      </div>
      <div class="flex items-center gap-2 mt-2">
        <button type="button" class="btn btn-primary text-xs !py-1.5 !px-3" data-db-ship="${t.id}"><i class="fa-solid fa-rocket mr-1"></i>Mark shipped</button>
        ${stagingUrl ? `<a href="${escapeHTML(stagingUrl)}" target="_blank" rel="noopener" class="btn btn-ghost text-xs !py-1.5 !px-3"><i class="fa-solid fa-flask mr-1"></i>Preview</a>` : ""}
        ${t.published_url ? `<a href="${escapeHTML(t.published_url)}" target="_blank" rel="noopener" class="btn btn-ghost text-xs !py-1.5 !px-3"><i class="fa-solid fa-arrow-up-right-from-square mr-1"></i>Live</a>` : ""}
        <button type="button" class="btn btn-ghost text-xs !py-1.5 !px-3" data-db-open="${t.id}">Open</button>
      </div>
      <div class="hidden mt-2 flex flex-col gap-1.5" data-db-ship-box="${t.id}">
        <input type="url" placeholder="Link to the live deploy (optional)" class="input text-sm w-full" data-db-url-input="${t.id}" />
        <input type="text" placeholder="Quick note, e.g. deployed to prod, no errors (optional)" class="input text-sm w-full" data-db-note-input="${t.id}" />
        <button type="button" class="btn btn-secondary text-xs !py-1.5 !px-3" data-db-ship-confirm="${t.id}">Confirm shipped</button>
      </div>
    </div>`;
}

async function shipAndComplete(taskId, publishedUrl, performanceNote) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  if (state.proReady && (publishedUrl || performanceNote)) {
    const payload = {};
    if (publishedUrl) { task.published_url = publishedUrl; payload.published_url = publishedUrl; }
    if (performanceNote) { task.performance_note = performanceNote; payload.performance_note = performanceNote; }
    const { error } = await runOrQueue({ type: "update", table: "tasks", id: taskId, payload }, () =>
      supabaseClient.from("tasks").update(payload).eq("id", taskId)
    );
    if (error) { toast("Couldn't save the deploy link/note: " + error.message, "error"); return; }
  }

  await toggleComplete(taskId);
  renderDevBoard();
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("dev-board-modal");

  document.getElementById("dev-board-btn")?.addEventListener("click", () => {
    modal?.classList.remove("hidden");
    state.devBoardQuery = "";
    const search = document.getElementById("dev-board-search");
    if (search) search.value = "";
    renderDevBoard();
  });
  document.querySelectorAll("[data-close-dev-board]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("dev-board-search")?.addEventListener("input", (e) => {
    state.devBoardQuery = e.target.value;
    renderDevBoard();
  });

  document.getElementById("dev-board-list")?.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-db-open]");
    if (openBtn) {
      modal?.classList.add("hidden");
      openEditModal(openBtn.dataset.dbOpen);
      return;
    }
    const shipBtn = e.target.closest("[data-db-ship]");
    if (shipBtn) {
      document.querySelector(`[data-db-ship-box="${shipBtn.dataset.dbShip}"]`)?.classList.remove("hidden");
      return;
    }
    const confirmBtn = e.target.closest("[data-db-ship-confirm]");
    if (confirmBtn) {
      const taskId = confirmBtn.dataset.dbShipConfirm;
      const urlInput = document.querySelector(`[data-db-url-input="${taskId}"]`);
      const noteInput = document.querySelector(`[data-db-note-input="${taskId}"]`);
      shipAndComplete(taskId, urlInput?.value.trim() || "", noteInput?.value.trim() || "");
    }
  });

  updateDevBoardButtonVisibility();
});
