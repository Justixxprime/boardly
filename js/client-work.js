/* ==========================================================================
   BOARDLY - client-work.js  ("Client Work" v1)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/client-work.js"></script>

   Needs NOTHING new in Supabase - sixth sibling of control-tower.js,
   classroom.js, dispatch.js, care-rounds.js and content-calendar.js.
   Freelance boards already store client_name and project_name inside
   the existing metadata jsonb column (schema_v14_vertical_fields.sql).
   It only ever appears on boards whose type is freelance, or that
   have at least one task individually set to it - see
   effectiveWorkType() in dashboard.js and
   schema_v28_task_type_override.sql.

   WHAT THIS IS: freelance work already moves through **To do → In
   progress → Delivered**. Client Work groups active tasks by client
   (like Control Tower groups by driver), sorted by urgency within
   each client's list - "who am I working for, what's due when."

   Marking something delivered here asks for an optional one-line
   delivery note first (metadata.delivery_note) - another key inside
   that same flexible jsonb column, same reasoning schema_v14 already
   gives for using jsonb instead of dedicated columns. This is
   deliberately NOT an invoice or a payment record - Boardly doesn't
   track billing data, and this isn't pretending to.
   ========================================================================== */

function isFreelanceBoard() {
  const board = state.boards.find((b) => b.id === state.currentBoardId);
  if ((board?.work_type || "general") === "freelance") return true;
  return state.tasks.some((t) => effectiveWorkType(t) === "freelance");
}

function updateClientWorkButtonVisibility() {
  document.getElementById("client-work-btn")?.classList.toggle("hidden", !isFreelanceBoard());
}

/** Wraps applyTerminology - chains safely with every other vertical view's
 *  own wrap of the same function (file 2g pattern). */
const _originalApplyTerminologyForClientWork = window.applyTerminology;
if (typeof _originalApplyTerminologyForClientWork === "function") {
  window.applyTerminology = function (...args) {
    const result = _originalApplyTerminologyForClientWork.apply(this, args);
    updateClientWorkButtonVisibility();
    return result;
  };
}

/** Also wraps renderBoard, needed since a single task's type can change
 *  without a board switch happening at all (chains safely with every
 *  other renderBoard wrap in this project, same 2g pattern). */
const _originalRenderBoardForClientWork = window.renderBoard;
if (typeof _originalRenderBoardForClientWork === "function") {
  window.renderBoard = function (...args) {
    const result = _originalRenderBoardForClientWork.apply(this, args);
    updateClientWorkButtonVisibility();
    return result;
  };
}

state.clientWorkQuery = "";

function activeClientWork() {
  const q = state.clientWorkQuery.trim().toLowerCase();
  let work = state.tasks.filter((t) => t.status !== "done" && effectiveWorkType(t) === "freelance");
  if (q) {
    work = work.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      (t.metadata?.client_name || "").toLowerCase().includes(q) ||
      (t.metadata?.project_name || "").toLowerCase().includes(q)
    );
  }
  return work.slice().sort((a, b) => {
    const overdueA = isOverdue(a.due_date, a.status), overdueB = isOverdue(b.due_date, b.status);
    if (overdueA !== overdueB) return overdueA ? -1 : 1;
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return new Date(a.due_date) - new Date(b.due_date);
  });
}

function clientWorkDeliveredTodayCount() {
  const today = new Date().toDateString();
  return state.tasks.filter((t) => t.status === "done" && t.done_at && new Date(t.done_at).toDateString() === today && effectiveWorkType(t) === "freelance").length;
}

function clientKey(task) {
  const name = (task.metadata?.client_name || "").trim();
  return name || "No client set";
}

function renderClientWork() {
  const list = document.getElementById("client-work-list");
  const empty = document.getElementById("client-work-empty");
  const clientsWrap = document.getElementById("client-work-clients");
  const statsEl = document.getElementById("client-work-stats");
  if (!list) return;

  const work = activeClientWork();
  const overdueCount = work.filter((t) => isOverdue(t.due_date, t.status)).length;
  const deliveredToday = clientWorkDeliveredTodayCount();
  statsEl.textContent = `${work.length} active ${work.length === 1 ? "project" : "projects"}${overdueCount ? ` · ${overdueCount} overdue` : ""} · ${deliveredToday} delivered today`;

  if (!work.length) {
    list.innerHTML = ""; clientsWrap.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const byClient = new Map();
  work.forEach((t) => {
    const key = clientKey(t);
    if (!byClient.has(key)) byClient.set(key, []);
    byClient.get(key).push(t);
  });
  const sortedClients = Array.from(byClient.keys()).sort((a, b) => a === "No client set" ? 1 : b === "No client set" ? -1 : a.localeCompare(b));

  clientsWrap.innerHTML = sortedClients.map((c) =>
    `<span class="meta-chip text-ink-soft"><i class="fa-solid fa-user"></i>${escapeHTML(c)} · ${byClient.get(c).length}</span>`
  ).join("");

  list.innerHTML = sortedClients.map((c) => `
    <p class="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mt-3 mb-1.5 first:mt-0">${escapeHTML(c)}</p>
    ${byClient.get(c).map(clientWorkRowHTML).join("")}
  `).join("");
}

function clientWorkRowHTML(t) {
  const overdue = isOverdue(t.due_date, t.status);
  const project = t.metadata?.project_name || "";
  return `
    <div class="ticket p-2.5" data-cw-task="${t.id}">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">${escapeHTML(t.title)}</p>
          ${project ? `<p class="text-[11px] text-ink-soft truncate"><i class="fa-solid fa-folder w-3"></i> ${escapeHTML(project)}</p>` : ""}
        </div>
        ${t.due_date ? `<span class="meta-chip shrink-0 ${overdue ? "text-critical" : "text-ink-soft"}">${overdue ? "Overdue" : escapeHTML(t.due_date)}</span>` : ""}
      </div>
      <div class="flex items-center gap-2 mt-2">
        <button type="button" class="btn btn-primary text-xs !py-1.5 !px-3" data-cw-deliver="${t.id}"><i class="fa-solid fa-check mr-1"></i>Mark delivered</button>
        <button type="button" class="btn btn-ghost text-xs !py-1.5 !px-3" data-cw-open="${t.id}">Open ticket</button>
      </div>
      <div class="hidden mt-2" data-cw-deliver-box="${t.id}">
        <input type="text" placeholder="Delivery note (optional) — e.g. sent via email, awaiting feedback…" class="input text-sm w-full" data-cw-deliver-input="${t.id}" />
        <button type="button" class="btn btn-secondary text-xs !py-1.5 !px-3 mt-1.5" data-cw-deliver-confirm="${t.id}">Confirm delivered</button>
      </div>
    </div>`;
}

async function deliverClientWork(taskId, deliveryNote) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  if (deliveryNote) {
    task.metadata = { ...(task.metadata || {}), delivery_note: deliveryNote };
    const { error } = await runOrQueue({ type: "update", table: "tasks", id: taskId, payload: { metadata: task.metadata } }, () =>
      supabaseClient.from("tasks").update({ metadata: task.metadata }).eq("id", taskId)
    );
    if (error) { toast("Couldn't save delivery note: " + error.message, "error"); return; }
  }

  await toggleComplete(taskId);
  renderClientWork();
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("client-work-modal");

  document.getElementById("client-work-btn")?.addEventListener("click", () => {
    modal?.classList.remove("hidden");
    state.clientWorkQuery = "";
    const search = document.getElementById("client-work-search");
    if (search) search.value = "";
    renderClientWork();
  });
  document.querySelectorAll("[data-close-client-work]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("client-work-search")?.addEventListener("input", (e) => {
    state.clientWorkQuery = e.target.value;
    renderClientWork();
  });

  document.getElementById("client-work-list")?.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-cw-open]");
    if (openBtn) {
      modal?.classList.add("hidden");
      openEditModal(openBtn.dataset.cwOpen);
      return;
    }
    const deliverBtn = e.target.closest("[data-cw-deliver]");
    if (deliverBtn) {
      document.querySelector(`[data-cw-deliver-box="${deliverBtn.dataset.cwDeliver}"]`)?.classList.remove("hidden");
      return;
    }
    const confirmBtn = e.target.closest("[data-cw-deliver-confirm]");
    if (confirmBtn) {
      const taskId = confirmBtn.dataset.cwDeliverConfirm;
      const input = document.querySelector(`[data-cw-deliver-input="${taskId}"]`);
      deliverClientWork(taskId, input?.value.trim() || "");
    }
  });

  updateClientWorkButtonVisibility();
});
