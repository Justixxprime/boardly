/* Deterministic Board Health. This uses only persisted task facts: status,
   due date, and the existing blocked_by_id relationship. */
(() => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  function dayStart(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function calculateBoardHealth(tasks) {
    const today = dayStart();
    const active = tasks.filter((task) => task.status !== "done");
    const overdue = active.filter((task) => task.due_date && new Date(`${task.due_date}T00:00:00`) < today);
    const dueSoon = active.filter((task) => {
      if (!task.due_date) return false;
      const due = new Date(`${task.due_date}T00:00:00`);
      const daysAway = Math.round((due - today) / DAY_MS);
      return daysAway >= 0 && daysAway <= 3;
    });
    const blocked = active.filter((task) => {
      if (!task.blocked_by_id) return false;
      const blocker = tasks.find((candidate) => candidate.id === task.blocked_by_id);
      return !blocker || blocker.status !== "done";
    });
    const noDueDate = active.filter((task) => !task.due_date);

    const level = overdue.length || blocked.length >= 2 ? "red" : blocked.length || dueSoon.length ? "yellow" : "green";
    return { level, active, overdue, dueSoon, blocked, noDueDate };
  }

  function healthLabel(level) {
    return level === "red" ? "Needs attention" : level === "yellow" ? "Watch closely" : "On track";
  }

  function healthColor(level) {
    return level === "red" ? "var(--critical)" : level === "yellow" ? "var(--orange)" : "var(--teal)";
  }

  function taskNames(tasks) {
    const names = tasks.slice(0, 3).map((task) => escapeHTML(task.title));
    const rest = tasks.length - names.length;
    return names.join(", ") + (rest > 0 ? `, and ${rest} more` : "");
  }

  function reason(icon, color, title, detail) {
    return `<div class="flex gap-3 border border-line rounded-lg p-3"><span class="h-7 w-7 rounded-md flex items-center justify-center shrink-0" style="background:color-mix(in srgb, ${color} 12%, transparent);color:${color}"><i class="fa-solid ${icon} text-xs"></i></span><div class="min-w-0"><p class="text-sm font-semibold">${title}</p><p class="text-xs text-ink-soft mt-0.5">${detail}</p></div></div>`;
  }

  function openBoardHealth() {
    const board = state.boards.find((item) => item.id === state.currentBoardId);
    const result = calculateBoardHealth(state.tasks || []);
    const modal = document.getElementById("board-health-modal");
    document.getElementById("board-switcher-menu")?.classList.add("hidden");
    document.getElementById("board-health-title").textContent = `${board?.name || "Board"} health`;
    document.getElementById("board-health-summary").innerHTML = `<strong style="color:${healthColor(result.level)}">${healthLabel(result.level)}.</strong> Based on ${result.active.length} active ticket${result.active.length === 1 ? "" : "s"}.`;
    document.getElementById("board-health-metrics").innerHTML = [
      ["Overdue", result.overdue.length, "var(--critical)"],
      ["Blocked", result.blocked.length, "var(--orange)"],
      ["Due in 3 days", result.dueSoon.length, "var(--violet)"],
    ].map(([label, value, color]) => `<div class="border border-line rounded-lg p-3"><p class="font-mono text-xl font-semibold" style="color:${color}">${value}</p><p class="text-[11px] text-ink-soft mt-1">${label}</p></div>`).join("");

    const reasons = [];
    if (result.overdue.length) reasons.push(reason("fa-calendar-xmark", "var(--critical)", `${result.overdue.length} overdue`, taskNames(result.overdue)));
    if (result.blocked.length) reasons.push(reason("fa-link", "var(--orange)", `${result.blocked.length} waiting on a blocker`, taskNames(result.blocked)));
    if (result.dueSoon.length) reasons.push(reason("fa-hourglass-half", "var(--violet)", `${result.dueSoon.length} due soon`, taskNames(result.dueSoon)));
    if (result.noDueDate.length) reasons.push(reason("fa-calendar-minus", "var(--ink-soft)", `${result.noDueDate.length} without a deadline`, "These are excluded from deadline risk until you set a due date."));
    if (!reasons.length) reasons.push(reason("fa-circle-check", "var(--teal)", "No tracked risk signals", "There are no overdue, blocked, or near-term tickets on this board."));
    document.getElementById("board-health-reasons").innerHTML = reasons.join("");
    modal.classList.remove("hidden");
    modal.querySelector("[data-close-board-health]")?.focus();
  }

  function closeBoardHealth() {
    document.getElementById("board-health-modal")?.classList.add("hidden");
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("board-health-btn")?.addEventListener("click", openBoardHealth);
    document.getElementById("board-health-modal")?.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-board-health]")) closeBoardHealth();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeBoardHealth();
    });
  });
})();
