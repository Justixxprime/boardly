/* ==========================================================================
   BOARDLY - workload.js  (Workload Thermostat + Deadline Firewall)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/workload.js" defer></script>

   No database migration needed at all - this only reads task due
   dates that already exist, and remembers "dismissed for today" in
   this browser only (localStorage), nothing server-side.

   WHAT THIS IS: a quiet, honest read on whether the next few days
   look manageable or not, based on how many open tasks are due soon.
   On purpose, this stays silent when things look fine - Boardly's own
   design principle here is "do not create anxiety, help users
   recover," so this only speaks up when there's genuinely something
   worth flagging, and never nags about a day that's actually fine.
   ========================================================================== */

// Thresholds: how many OPEN tasks due within the next 3 days (including
// anything already overdue, which is even more urgent) before each
// level kicks in. These are a reasonable starting point, not a
// scientifically tuned number - see WORKLOAD_THERMOSTAT_SETUP.md for
// how to adjust them if they don't match how you actually work.
const WORKLOAD_LEVELS = [
  { max: 2, key: "healthy", label: "Healthy", dotColor: "var(--teal)" },
  { max: 5, key: "rising", label: "Rising", dotColor: "var(--orange)" },
  { max: 13, key: "heavy", label: "Heavy", dotColor: "var(--orange-dark)" },
  { max: Infinity, key: "overloaded", label: "Overloaded", dotColor: "var(--critical)" },
];

function computeWorkloadLevel() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const horizon = new Date(today); horizon.setDate(horizon.getDate() + 3);

  const dueSoonCount = (state.tasks || []).filter((t) => {
    if (t.status === "done" || !t.due_date) return false;
    const due = new Date(t.due_date + "T00:00:00");
    return due <= horizon; // includes anything already overdue
  }).length;

  const level = WORKLOAD_LEVELS.find((l) => dueSoonCount <= l.max);
  return { ...level, count: dueSoonCount };
}

function renderWorkloadBanner() {
  const banner = document.getElementById("workload-banner");
  if (!banner) return;

  const { key, label, dotColor, count } = computeWorkloadLevel();

  // Healthy is never shown - a banner that shows up even when
  // everything's fine just becomes noise people learn to ignore,
  // which defeats the point of it existing at all.
  if (key === "healthy") { banner.classList.add("hidden"); return; }

  const todayKey = new Date().toISOString().slice(0, 10);
  const dismissedFor = localStorage.getItem("boardly-workload-dismissed");
  if (dismissedFor === todayKey) { banner.classList.add("hidden"); return; }

  const text = {
    rising: `${count} tasks due in the next 3 days - still manageable, worth a glance.`,
    heavy: `${count} tasks due in the next 3 days - getting heavy. Might be worth moving a few.`,
    overloaded: `${count} tasks due in the next 3 days - that's more than a normal window can absorb.`,
  }[key];

  document.getElementById("workload-banner-dot").style.background = dotColor;
  document.getElementById("workload-banner-text").textContent = `${label}: ${text}`;
  banner.classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("workload-banner-dismiss-btn")?.addEventListener("click", () => {
    localStorage.setItem("boardly-workload-dismissed", new Date().toISOString().slice(0, 10));
    document.getElementById("workload-banner")?.classList.add("hidden");
  });

  // "Plan it out" hands off straight to Emergency Mode (see
  // commitments.js) with a sensible default time, rather than building
  // a second, separate planning flow - the two features are solving
  // the same underlying question ("what do I actually do given the
  // time I have"), just arriving at it from different directions.
  document.getElementById("workload-banner-plan-btn")?.addEventListener("click", async () => {
    document.getElementById("ai-panel")?.classList.remove("hidden");
    sendAIMessage("Emergency mode: I have the rest of today. Give me a realistic plan for right now.");
  });

  // Re-check whenever the board's actual data changes, not just once
  // on load - piggybacks on the same renderBoard() hook timeline.js
  // and dashboard-extras.js already use, rather than editing
  // dashboard.js itself.
  const _originalRenderBoardForWorkload = window.renderBoard;
  if (typeof _originalRenderBoardForWorkload === "function") {
    window.renderBoard = function (...args) {
      const result = _originalRenderBoardForWorkload.apply(this, args);
      renderWorkloadBanner();
      return result;
    };
  }
});
