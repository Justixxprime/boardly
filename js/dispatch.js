/* ==========================================================================
   BOARDLY - dispatch.js  ("Field Service Dispatch" v1)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/dispatch.js"></script>

   Needs NOTHING new in Supabase - third sibling of control-tower.js
   and classroom.js, same reasoning: field_service boards already
   store customer_name, job_address and job_notes inside the existing
   metadata jsonb column (schema_v14_vertical_fields.sql).

   WHAT'S DIFFERENT FROM CONTROL TOWER: logistics jobs have a driver
   field to group by, so Control Tower groups by driver. Field service
   jobs don't have an equivalent "who's doing this" field yet - so
   instead of grouping, Dispatch sorts by what actually matters for a
   single technician planning their day: overdue jobs first, then
   whichever job is due soonest. That's the honest difference between
   these two verticals' current data, not an oversight.

   Marking a job done here asks for an optional one-line completion
   note first (metadata.completion_note) - another key inside that
   same flexible jsonb column, same reasoning schema_v14 already gives
   for using jsonb instead of dedicated columns.
   ========================================================================== */

function isFieldServiceBoard() {
  const board = state.boards.find((b) => b.id === state.currentBoardId);
  return (board?.work_type || "general") === "field_service";
}

/** Wraps applyTerminology - chains safely with control-tower.js and
 *  classroom.js's own wraps of the same function (file 2g pattern). */
const _originalApplyTerminologyForDispatch = window.applyTerminology;
if (typeof _originalApplyTerminologyForDispatch === "function") {
  window.applyTerminology = function (...args) {
    const result = _originalApplyTerminologyForDispatch.apply(this, args);
    document.getElementById("dispatch-btn")?.classList.toggle("hidden", !isFieldServiceBoard());
    return result;
  };
}

function activeJobs() {
  return state.tasks
    .filter((t) => t.status !== "done")
    .slice()
    .sort((a, b) => {
      const overdueA = isOverdue(a.due_date, a.status), overdueB = isOverdue(b.due_date, b.status);
      if (overdueA !== overdueB) return overdueA ? -1 : 1; // overdue jobs float to the top
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1; // undated jobs sink to the bottom
      if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    });
}

function renderDispatch() {
  const list = document.getElementById("dispatch-list");
  const empty = document.getElementById("dispatch-empty");
  const statsEl = document.getElementById("dispatch-stats");
  if (!list) return;

  const jobs = activeJobs();
  const overdueCount = jobs.filter((t) => isOverdue(t.due_date, t.status)).length;
  statsEl.textContent = `${jobs.length} active ${jobs.length === 1 ? "job" : "jobs"}${overdueCount ? ` · ${overdueCount} overdue` : ""}`;

  if (!jobs.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  list.innerHTML = jobs.map(dispatchRowHTML).join("");
}

function dispatchRowHTML(t) {
  const overdue = isOverdue(t.due_date, t.status);
  const customer = t.metadata?.customer_name || "";
  const address = t.metadata?.job_address || "";
  const notes = t.metadata?.job_notes || "";
  return `
    <div class="ticket p-2.5" data-dsp-task="${t.id}">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">${escapeHTML(t.title)}</p>
          ${customer ? `<p class="text-[11px] text-ink-soft truncate"><i class="fa-solid fa-user w-3"></i> ${escapeHTML(customer)}</p>` : ""}
          ${address ? `<p class="text-[11px] text-ink-soft truncate"><i class="fa-solid fa-location-dot w-3"></i> ${escapeHTML(address)}</p>` : ""}
          ${notes ? `<p class="text-[11px] text-ink-soft truncate"><i class="fa-solid fa-note-sticky w-3"></i> ${escapeHTML(notes)}</p>` : ""}
        </div>
        ${t.due_date ? `<span class="meta-chip shrink-0 ${overdue ? "text-critical" : "text-ink-soft"}">${overdue ? "Overdue" : escapeHTML(t.due_date)}</span>` : ""}
      </div>
      <div class="flex items-center gap-2 mt-2">
        <button type="button" class="btn btn-primary text-xs !py-1.5 !px-3" data-dsp-complete="${t.id}"><i class="fa-solid fa-check mr-1"></i>Mark job complete</button>
        <button type="button" class="btn btn-ghost text-xs !py-1.5 !px-3" data-dsp-open="${t.id}">Open ticket</button>
      </div>
      <div class="hidden mt-2" data-dsp-complete-box="${t.id}">
        <input type="text" placeholder="Completion note (optional) — e.g. parts replaced, follow-up needed…" class="input text-sm w-full" data-dsp-complete-input="${t.id}" />
        <button type="button" class="btn btn-secondary text-xs !py-1.5 !px-3 mt-1.5" data-dsp-complete-confirm="${t.id}">Confirm complete</button>
      </div>
    </div>`;
}

async function completeJob(taskId, completionNote) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  if (completionNote) {
    task.metadata = { ...(task.metadata || {}), completion_note: completionNote };
    const { error } = await runOrQueue({ type: "update", table: "tasks", id: taskId, payload: { metadata: task.metadata } }, () =>
      supabaseClient.from("tasks").update({ metadata: task.metadata }).eq("id", taskId)
    );
    if (error) { toast("Couldn't save completion note: " + error.message, "error"); return; }
  }

  await toggleComplete(taskId);
  renderDispatch();
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("dispatch-modal");

  document.getElementById("dispatch-btn")?.addEventListener("click", () => {
    modal?.classList.remove("hidden");
    renderDispatch();
  });
  document.querySelectorAll("[data-close-dispatch]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("dispatch-list")?.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-dsp-open]");
    if (openBtn) {
      modal?.classList.add("hidden");
      openEditModal(openBtn.dataset.dspOpen);
      return;
    }
    const completeBtn = e.target.closest("[data-dsp-complete]");
    if (completeBtn) {
      document.querySelector(`[data-dsp-complete-box="${completeBtn.dataset.dspComplete}"]`)?.classList.remove("hidden");
      return;
    }
    const confirmBtn = e.target.closest("[data-dsp-complete-confirm]");
    if (confirmBtn) {
      const taskId = confirmBtn.dataset.dspCompleteConfirm;
      const input = document.querySelector(`[data-dsp-complete-input="${taskId}"]`);
      completeJob(taskId, input?.value.trim() || "");
    }
  });

  document.getElementById("dispatch-btn")?.classList.toggle("hidden", !isFieldServiceBoard());
});
