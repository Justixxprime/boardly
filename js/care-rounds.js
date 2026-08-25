/* ==========================================================================
   BOARDLY - care-rounds.js  ("Care Rounds" v1)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/care-rounds.js"></script>

   Needs NOTHING new in Supabase - fourth sibling of control-tower.js,
   classroom.js and dispatch.js, same reasoning: healthcare/care
   boards already store patient_name, visit_address and visit_notes
   inside the existing metadata jsonb column
   (schema_v14_vertical_fields.sql).

   Structurally this is closest to dispatch.js: like field service,
   the healthcare vertical doesn't currently have a "who's doing this
   visit" field to group by, so Care Rounds sorts by urgency instead
   of grouping - overdue visits first, then whichever visit is due
   soonest. Same honest reasoning as Dispatch, not a shortcut.

   Marking a visit done here asks for an optional one-line visit note
   first (metadata.visit_outcome) - another key inside that same
   flexible jsonb column, same reasoning schema_v14 already gives.

   A note on sensitivity: patient_name and visit_notes were already
   being typed into this board before this module existed - Care
   Rounds doesn't collect anything new or send it anywhere new, it
   just displays the same fields in a tidier list. Nothing here should
   be treated as a substitute for whatever record-keeping compliance
   your actual practice requires - it's a personal/small-team
   scheduling view, the same as the rest of Boardly.
   ========================================================================== */

function isHealthcareBoard() {
  const board = state.boards.find((b) => b.id === state.currentBoardId);
  return (board?.work_type || "general") === "healthcare";
}

/** Wraps applyTerminology - chains safely with every other vertical view's
 *  own wrap of the same function (file 2g pattern). */
const _originalApplyTerminologyForCareRounds = window.applyTerminology;
if (typeof _originalApplyTerminologyForCareRounds === "function") {
  window.applyTerminology = function (...args) {
    const result = _originalApplyTerminologyForCareRounds.apply(this, args);
    document.getElementById("care-rounds-btn")?.classList.toggle("hidden", !isHealthcareBoard());
    return result;
  };
}

function activeVisits() {
  return state.tasks
    .filter((t) => t.status !== "done")
    .slice()
    .sort((a, b) => {
      const overdueA = isOverdue(a.due_date, a.status), overdueB = isOverdue(b.due_date, b.status);
      if (overdueA !== overdueB) return overdueA ? -1 : 1; // overdue visits float to the top
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1; // undated visits sink to the bottom
      if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    });
}

function renderCareRounds() {
  const list = document.getElementById("care-rounds-list");
  const empty = document.getElementById("care-rounds-empty");
  const statsEl = document.getElementById("care-rounds-stats");
  if (!list) return;

  const visits = activeVisits();
  const overdueCount = visits.filter((t) => isOverdue(t.due_date, t.status)).length;
  statsEl.textContent = `${visits.length} active ${visits.length === 1 ? "visit" : "visits"}${overdueCount ? ` · ${overdueCount} overdue` : ""}`;

  if (!visits.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  list.innerHTML = visits.map(careRoundsRowHTML).join("");
}

function careRoundsRowHTML(t) {
  const overdue = isOverdue(t.due_date, t.status);
  const patient = t.metadata?.patient_name || "";
  const address = t.metadata?.visit_address || "";
  const notes = t.metadata?.visit_notes || "";
  return `
    <div class="ticket p-2.5" data-cr-task="${t.id}">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">${escapeHTML(t.title)}</p>
          ${patient ? `<p class="text-[11px] text-ink-soft truncate"><i class="fa-solid fa-user w-3"></i> ${escapeHTML(patient)}</p>` : ""}
          ${address ? `<p class="text-[11px] text-ink-soft truncate"><i class="fa-solid fa-location-dot w-3"></i> ${escapeHTML(address)}</p>` : ""}
          ${notes ? `<p class="text-[11px] text-ink-soft truncate"><i class="fa-solid fa-notes-medical w-3"></i> ${escapeHTML(notes)}</p>` : ""}
        </div>
        ${t.due_date ? `<span class="meta-chip shrink-0 ${overdue ? "text-critical" : "text-ink-soft"}">${overdue ? "Overdue" : escapeHTML(t.due_date)}</span>` : ""}
      </div>
      <div class="flex items-center gap-2 mt-2">
        <button type="button" class="btn btn-primary text-xs !py-1.5 !px-3" data-cr-complete="${t.id}"><i class="fa-solid fa-check mr-1"></i>Mark visit complete</button>
        <button type="button" class="btn btn-ghost text-xs !py-1.5 !px-3" data-cr-open="${t.id}">Open ticket</button>
      </div>
      <div class="hidden mt-2" data-cr-complete-box="${t.id}">
        <input type="text" placeholder="Visit outcome (optional) — e.g. vitals stable, follow-up in 2 weeks…" class="input text-sm w-full" data-cr-complete-input="${t.id}" />
        <button type="button" class="btn btn-secondary text-xs !py-1.5 !px-3 mt-1.5" data-cr-complete-confirm="${t.id}">Confirm complete</button>
      </div>
    </div>`;
}

async function completeVisit(taskId, outcomeNote) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  if (outcomeNote) {
    task.metadata = { ...(task.metadata || {}), visit_outcome: outcomeNote };
    const { error } = await runOrQueue({ type: "update", table: "tasks", id: taskId, payload: { metadata: task.metadata } }, () =>
      supabaseClient.from("tasks").update({ metadata: task.metadata }).eq("id", taskId)
    );
    if (error) { toast("Couldn't save visit outcome: " + error.message, "error"); return; }
  }

  await toggleComplete(taskId);
  renderCareRounds();
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("care-rounds-modal");

  document.getElementById("care-rounds-btn")?.addEventListener("click", () => {
    modal?.classList.remove("hidden");
    renderCareRounds();
  });
  document.querySelectorAll("[data-close-care-rounds]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("care-rounds-list")?.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-cr-open]");
    if (openBtn) {
      modal?.classList.add("hidden");
      openEditModal(openBtn.dataset.crOpen);
      return;
    }
    const completeBtn = e.target.closest("[data-cr-complete]");
    if (completeBtn) {
      document.querySelector(`[data-cr-complete-box="${completeBtn.dataset.crComplete}"]`)?.classList.remove("hidden");
      return;
    }
    const confirmBtn = e.target.closest("[data-cr-complete-confirm]");
    if (confirmBtn) {
      const taskId = confirmBtn.dataset.crCompleteConfirm;
      const input = document.querySelector(`[data-cr-complete-input="${taskId}"]`);
      completeVisit(taskId, input?.value.trim() || "");
    }
  });

  document.getElementById("care-rounds-btn")?.classList.toggle("hidden", !isHealthcareBoard());
});
