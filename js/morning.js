/* ==========================================================================
   BOARDLY - morning.js  (Boardly Personal Operating System / "Good morning")
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER commitments.js and waiting-room.js on
   dashboard.html:
     <script src="js/morning.js" defer></script>

   No new database migration needed - this is pure presentation, pulling
   together data from features that already exist: tasks, commitments
   (schema_v24), waiting items (schema_v23), the workload level already
   computed by workload.js, and recurring routines (reminder_repeat,
   surfaced through routines.js's own boardRoutines()/relativeNextLabel
   helpers). If any of those aren't set up yet, this still works, it
   just shows less (see the guards throughout).

   WHAT THIS DELIBERATELY LEAVES OUT: "Money" and "Meetings," even
   though the master plan's original sketch of this screen mentioned
   them. Boardly doesn't track real invoices or a real calendar of
   meetings distinct from tasks, so showing either section would mean
   either making something up or mislabeling a task as a meeting - both
   against Boardly's own "no fake statistics" rule. Only sections
   backed by real data made it in.
   ========================================================================== */

function morningTodaysPriorities() {
  const today = new Date().toISOString().slice(0, 10);
  return (state.tasks || [])
    .filter((t) => t.status !== "done" && t.due_date && t.due_date <= today)
    .sort((a, b) => a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0) // overdue (earlier dates) first
    .slice(0, 6);
}

function morningFocusTask(priorities) {
  if (priorities.length) return priorities[0]; // the single most overdue/urgent of today's priorities
  // Nothing due today or overdue - fall back to the oldest still-open task, so there's always something to point to.
  const open = (state.tasks || []).filter((t) => t.status !== "done").sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return open[0] || null;
}

/** Routines (js/routines.js) whose next occurrence lands today, in their
 *  own timezone - reuses that file's own helpers rather than
 *  re-implementing the recurrence math a second time here. */
function morningTodaysRoutines() {
  if (typeof boardRoutines !== "function" || typeof relativeNextLabel !== "function" || !window.Timely) return [];
  return boardRoutines().filter((t) => {
    const tz = t.timezone || Timely.BROWSER_TZ;
    const next = Timely.nextZonedOccurrence(t.reminder_at, tz, t.reminder_repeat);
    return next && relativeNextLabel(next) === "today";
  });
}

async function renderMorningView() {
  document.getElementById("morning-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  // Pull fresh commitment/waiting-room data rather than trusting
  // whatever's already in state - those only load when their own
  // modals have been opened, and someone might open Good Morning
  // first thing, before ever touching either one.
  if (typeof loadCommitments === "function") await loadCommitments();
  if (typeof loadWaitingItems === "function") await loadWaitingItems();

  // ---- Today's priorities ----
  const priorities = morningTodaysPriorities();
  const priorityEl = document.getElementById("morning-priorities");
  priorityEl.innerHTML = priorities.length
    ? priorities.map((t) => {
        const overdue = t.due_date < new Date().toISOString().slice(0, 10);
        return `<div class="flex items-center gap-2"><i class="fa-solid fa-circle text-[6px] ${overdue ? "text-critical" : "text-orange"}"></i><span class="truncate">${escapeHTML(t.title)}</span>${overdue ? '<span class="text-[10px] text-critical font-semibold ml-auto shrink-0">overdue</span>' : ""}</div>`;
      }).join("")
    : `<p class="text-ink-soft">Nothing due today. A clean slate.</p>`;

  // ---- At risk (commitments + workload) ----
  const atRiskEl = document.getElementById("morning-at-risk");
  const atRiskSection = document.getElementById("morning-at-risk-section");
  const atRiskItems = [];
  if (typeof state !== "undefined" && state.commitments) {
    state.commitments.forEach((c) => {
      const status = typeof commitmentStatus === "function" ? commitmentStatus(c.due_date) : null;
      if (status === "at-risk" || status === "missed") {
        atRiskItems.push(`<div class="flex items-center gap-2"><i class="fa-solid fa-handshake text-[11px] ${status === "missed" ? "text-critical" : "text-orange"}"></i><span class="truncate">${escapeHTML(c.what)}</span></div>`);
      }
    });
  }
  if (typeof computeWorkloadLevel === "function") {
    const level = computeWorkloadLevel();
    if (level.key === "heavy" || level.key === "overloaded") {
      atRiskItems.push(`<div class="flex items-center gap-2"><i class="fa-solid fa-gauge-high text-[11px]" style="color:${level.dotColor}"></i><span>Workload is ${level.label.toLowerCase()} - ${level.count} tasks due in the next 3 days</span></div>`);
    }
  }
  atRiskSection.classList.toggle("hidden", atRiskItems.length === 0);
  atRiskEl.innerHTML = atRiskItems.join("");

  // ---- People (waiting on) ----
  const peopleEl = document.getElementById("morning-people");
  const peopleSection = document.getElementById("morning-people-section");
  const peopleItems = (state.waitingItems || []).slice(0, 4).map((w) =>
    `<div class="flex items-center gap-2"><i class="fa-solid fa-hourglass-half text-[11px] text-ink-soft"></i><span class="truncate">${escapeHTML(w.what)}${w.who ? ` <span class="text-ink-soft">(${escapeHTML(w.who)})</span>` : ""}</span></div>`
  );
  peopleSection.classList.toggle("hidden", peopleItems.length === 0);
  peopleEl.innerHTML = peopleItems.join("");

  // ---- Today's routines ----
  const routinesEl = document.getElementById("morning-routines");
  const routinesSection = document.getElementById("morning-routines-section");
  const todaysRoutines = morningTodaysRoutines();
  routinesSection.classList.toggle("hidden", todaysRoutines.length === 0);
  routinesEl.innerHTML = todaysRoutines.map((t) => {
    const tz = t.timezone || Timely.BROWSER_TZ;
    const timeLabel = Timely.formatInZone(t.reminder_at, tz);
    return `<div class="flex items-center gap-2"><i class="fa-solid fa-bell text-[11px] text-orange"></i><span class="truncate">${escapeHTML(t.title)}</span><span class="text-[10px] text-ink-soft font-mono ml-auto shrink-0">${escapeHTML(timeLabel)}</span></div>`;
  }).join("");

  // ---- Focus ----
  const focusTask = morningFocusTask(priorities);
  document.getElementById("morning-focus").textContent = focusTask
    ? focusTask.title
    : "Nothing urgent on the board - a good day to plan ahead or catch up on something you've been putting off.";
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("morning-modal");
  document.getElementById("morning-btn")?.addEventListener("click", async () => {
    modal?.classList.remove("hidden");
    await renderMorningView();
  });
  document.querySelectorAll("[data-close-morning]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("morning-start-btn")?.addEventListener("click", () => {
    modal?.classList.add("hidden");
  });

  // Reuses the exact same daily-briefing prompt already used by the
  // existing AI briefing button, rather than inventing a third,
  // slightly different phrasing of the same request.
  document.getElementById("morning-ask-ai-btn")?.addEventListener("click", () => {
    modal?.classList.add("hidden");
    document.getElementById("ai-panel")?.classList.remove("hidden");
    sendAIMessage("Give me a short daily briefing: what should I prioritize today, what's overdue, and anything time-sensitive coming up. Keep it to a few sentences, plain language, no headers.");
  });
});
