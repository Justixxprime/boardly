/* ==========================================================================
   BOARDLY - control-tower.js  ("Logistics Control Tower" v1)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/control-tower.js"></script>

   Needs NOTHING new in Supabase. Boards already have a work_type
   ("logistics" being one of them - schema_v12_work_type.sql) and
   logistics tasks already store customer_name, delivery_address and
   driver inside the existing metadata jsonb column
   (schema_v14_vertical_fields.sql). This module is pure presentation
   over data that already exists - it reads that same metadata, groups
   it by driver, and adds one small new habit: a "Mark delivered" flow
   that asks for a one-line proof note before checking a delivery off,
   storing it in metadata.proof_note - a new KEY inside that same
   flexible jsonb column, not a new database column, exactly the
   reasoning schema_v14's own comment already gives for using jsonb in
   the first place.

   WHAT THIS IS: a dedicated operational view for logistics boards -
   "what's still moving, who's carrying it, is it late" - the same
   three questions a dispatcher actually asks, instead of scrolling a
   general kanban board hunting for them. It only ever appears on
   boards whose work_type is "logistics" - every other board is
   completely unaffected, and the button that opens it stays hidden
   the rest of the time.

   v1 → v1.1: added a search box (same pattern as Done Archive's) and
   a "completed today" count, so this whole family of views (Control
   Tower, Classroom, Dispatch, Care Rounds) now behaves consistently.

   v1.1 → v1.2: tasks can now individually override their own type
   (schema_v28_task_type_override.sql), so a board doesn't have to be
   ALL logistics for this view to matter - a handful of delivery tasks
   on an otherwise general board now show up here too, and read
   through effectiveWorkType() (dashboard.js) rather than assuming
   every task on the board is a logistics task. The button itself now
   shows whenever the board's default type is logistics OR at least
   one task has been individually set to logistics - whichever gets
   you here, only genuinely logistics tasks appear inside.
   ========================================================================== */

function isLogisticsBoard() {
  const board = state.boards.find((b) => b.id === state.currentBoardId);
  if ((board?.work_type || "general") === "logistics") return true;
  return state.tasks.some((t) => effectiveWorkType(t) === "logistics");
}

function updateControlTowerButtonVisibility() {
  document.getElementById("control-tower-btn")?.classList.toggle("hidden", !isLogisticsBoard());
}

/** Wraps applyTerminology, which dashboard.js already calls every time the
 *  active board changes (on load and on switch) - see file 2g pattern
 *  ("wrap the existing function") used across every earlier add-on. This
 *  is the natural, already-existing hook for "something about the board
 *  changed" rather than adding a second board-switch listener. */
const _originalApplyTerminologyForControlTower = window.applyTerminology;
if (typeof _originalApplyTerminologyForControlTower === "function") {
  window.applyTerminology = function (...args) {
    const result = _originalApplyTerminologyForControlTower.apply(this, args);
    updateControlTowerButtonVisibility();
    return result;
  };
}

/** Also wraps renderBoard, which runs after every task save/create/delete
 *  - needed now that a single task's type can change without a board
 *  switch happening at all (chains safely with every other renderBoard
 *  wrap in this project, same 2g pattern). */
const _originalRenderBoardForControlTower = window.renderBoard;
if (typeof _originalRenderBoardForControlTower === "function") {
  window.renderBoard = function (...args) {
    const result = _originalRenderBoardForControlTower.apply(this, args);
    updateControlTowerButtonVisibility();
    return result;
  };
}

state.controlTowerQuery = "";

function activeLogisticsTasks() {
  const q = state.controlTowerQuery.trim().toLowerCase();
  let tasks = state.tasks.filter((t) => t.status !== "done" && effectiveWorkType(t) === "logistics");
  if (q) {
    tasks = tasks.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      (t.metadata?.customer_name || "").toLowerCase().includes(q) ||
      (t.metadata?.delivery_address || "").toLowerCase().includes(q) ||
      (t.metadata?.driver || "").toLowerCase().includes(q)
    );
  }
  return tasks;
}

function controlTowerCompletedTodayCount() {
  const today = new Date().toDateString();
  return state.tasks.filter((t) => t.status === "done" && t.done_at && new Date(t.done_at).toDateString() === today).length;
}

function driverKey(task) {
  const name = (task.metadata?.driver || "").trim();
  return name || "Unassigned";
}

function ctIsOverdue(task) {
  return isOverdue(task.due_date, task.status);
}

function renderControlTower() {
  const list = document.getElementById("control-tower-list");
  const empty = document.getElementById("control-tower-empty");
  const driversWrap = document.getElementById("control-tower-drivers");
  const statsEl = document.getElementById("control-tower-stats");
  if (!list) return;

  const active = activeLogisticsTasks();
  const overdueCount = active.filter(ctIsOverdue).length;
  const doneToday = controlTowerCompletedTodayCount();
  statsEl.textContent = `${active.length} active ${active.length === 1 ? "delivery" : "deliveries"}${overdueCount ? ` · ${overdueCount} overdue` : ""} · ${doneToday} completed today`;

  if (!active.length) {
    list.innerHTML = ""; driversWrap.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const byDriver = new Map();
  active.forEach((t) => {
    const key = driverKey(t);
    if (!byDriver.has(key)) byDriver.set(key, []);
    byDriver.get(key).push(t);
  });

  const sortedDrivers = Array.from(byDriver.keys()).sort((a, b) => a === "Unassigned" ? 1 : b === "Unassigned" ? -1 : a.localeCompare(b));

  driversWrap.innerHTML = sortedDrivers.map((d) =>
    `<span class="meta-chip text-ink-soft"><i class="fa-solid fa-id-badge"></i>${escapeHTML(d)} · ${byDriver.get(d).length}</span>`
  ).join("");

  list.innerHTML = sortedDrivers.map((d) => `
    <p class="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mt-3 mb-1.5 first:mt-0">${escapeHTML(d)}</p>
    ${byDriver.get(d).map(controlTowerRowHTML).join("")}
  `).join("");
}

function controlTowerRowHTML(t) {
  const overdue = ctIsOverdue(t);
  const customer = t.metadata?.customer_name || "";
  const address = t.metadata?.delivery_address || "";
  return `
    <div class="ticket p-2.5" data-ct-task="${t.id}">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">${escapeHTML(t.title)}</p>
          ${customer ? `<p class="text-[11px] text-ink-soft truncate"><i class="fa-solid fa-user w-3"></i> ${escapeHTML(customer)}</p>` : ""}
          ${address ? `<p class="text-[11px] text-ink-soft truncate"><i class="fa-solid fa-location-dot w-3"></i> ${escapeHTML(address)}</p>` : ""}
        </div>
        ${t.due_date ? `<span class="meta-chip shrink-0 ${overdue ? "text-critical" : "text-ink-soft"}">${overdue ? "Overdue" : escapeHTML(t.due_date)}</span>` : ""}
      </div>
      <div class="flex items-center gap-2 mt-2">
        <button type="button" class="btn btn-primary text-xs !py-1.5 !px-3" data-ct-deliver="${t.id}"><i class="fa-solid fa-check mr-1"></i>Mark delivered</button>
        <button type="button" class="btn btn-ghost text-xs !py-1.5 !px-3" data-ct-open="${t.id}">Open ticket</button>
      </div>
      <div class="hidden mt-2" data-ct-proof-box="${t.id}">
        <input type="text" placeholder="Proof of delivery (optional): e.g. signed by, left at door…" class="input text-sm w-full" data-ct-proof-input="${t.id}" />
        <button type="button" class="btn btn-secondary text-xs !py-1.5 !px-3 mt-1.5" data-ct-proof-confirm="${t.id}">Confirm delivered</button>
      </div>
    </div>`;
}

async function markDelivered(taskId, proofNote) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  if (proofNote) {
    task.metadata = { ...(task.metadata || {}), proof_note: proofNote };
    const { error } = await runOrQueue({ type: "update", table: "tasks", id: taskId, payload: { metadata: task.metadata } }, () =>
      supabaseClient.from("tasks").update({ metadata: task.metadata }).eq("id", taskId)
    );
    if (error) { toast("Couldn't save proof note: " + error.message, "error"); return; }
  }

  await toggleComplete(taskId);
  renderControlTower();
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("control-tower-modal");

  document.getElementById("control-tower-btn")?.addEventListener("click", () => {
    modal?.classList.remove("hidden");
    state.controlTowerQuery = "";
    const search = document.getElementById("control-tower-search");
    if (search) search.value = "";
    renderControlTower();
  });
  document.querySelectorAll("[data-close-control-tower]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("control-tower-search")?.addEventListener("input", (e) => {
    state.controlTowerQuery = e.target.value;
    renderControlTower();
  });

  document.getElementById("control-tower-list")?.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-ct-open]");
    if (openBtn) {
      modal?.classList.add("hidden");
      openEditModal(openBtn.dataset.ctOpen);
      return;
    }
    const deliverBtn = e.target.closest("[data-ct-deliver]");
    if (deliverBtn) {
      document.querySelector(`[data-ct-proof-box="${deliverBtn.dataset.ctDeliver}"]`)?.classList.remove("hidden");
      return;
    }
    const confirmBtn = e.target.closest("[data-ct-proof-confirm]");
    if (confirmBtn) {
      const taskId = confirmBtn.dataset.ctProofConfirm;
      const input = document.querySelector(`[data-ct-proof-input="${taskId}"]`);
      markDelivered(taskId, input?.value.trim() || "");
    }
  });

  // The button also needs its initial hidden/visible state set once on
  // first load, since applyTerminology only runs again on a later switch.
  updateControlTowerButtonVisibility();
});
