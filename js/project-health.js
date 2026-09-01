/* Deterministic Board Health. This uses only persisted task facts: status,
   due date, the existing blocked_by_id relationship, and (for staleness)
   status_changed_at from schema_v6_visual.sql. No AI, no guessing - every
   number here traces back to an actual ticket you can click straight
   into. */
(() => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const STALE_DAYS = 7; // "in progress" this long with no status change gets flagged

  function dayStart(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function calculateBoardHealth(tasks) {
    const today = dayStart();
    const now = Date.now();
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
    // Sitting in "in progress" with no status change in a week is its own
    // kind of risk signal, separate from a missed deadline - a ticket
    // with no due date at all can still be quietly stuck.
    const stale = active.filter((task) => {
      if (task.status !== "inprogress") return false;
      const lastMoved = task.status_changed_at || task.created_at;
      if (!lastMoved) return false;
      return now - new Date(lastMoved).getTime() > STALE_DAYS * DAY_MS;
    });
    // "Forgotten" is different from "stale": stale is work someone
    // started and then stopped touching; forgotten is work that never
    // even got picked up - still sitting in To Do, created a while ago,
    // and (once Task Assignment exists) nobody's actually holding it.
    const forgotten = active.filter((task) => {
      if (task.status !== "todo" || !task.created_at) return false;
      if (state.taskAssignmentReady && task.assigned_to) return false;
      return now - new Date(task.created_at).getTime() > STALE_DAYS * DAY_MS;
    });
    // A client-visible ticket the client hasn't approved or requested
    // changes on yet (see client-portal-action/index.ts - client_status
    // only ever becomes "approved" or "changes_requested" once they
    // actually act) sitting untouched this long is worth surfacing on
    // its own - "the client" is a person Boardly has no other way to
    // nudge into paying attention.
    const clientWaiting = state.clientPortalReady ? active.filter((task) => {
      if (!task.client_visible || task.client_status) return false;
      const since = task.status_changed_at || task.created_at;
      if (!since) return false;
      return now - new Date(since).getTime() > STALE_DAYS * DAY_MS;
    }) : [];

    const level = overdue.length || blocked.length >= 2 ? "red" : blocked.length || dueSoon.length || stale.length || forgotten.length || clientWaiting.length ? "yellow" : "green";
    return { level, active, overdue, dueSoon, blocked, noDueDate, stale, forgotten, clientWaiting };
  }

  // Reality Mode: "what did I plan" vs "what's actually happening."
  // Planned = the plain, naive completion percentage everyone already
  // knows how to read. Reality = that same percentage, pulled down by
  // however much of the board is actually carrying a real risk signal
  // right now - the exact same signals calculateBoardHealth already
  // found above, just expressed as one honest number instead of a list.
  // A ticket counted in more than one category (e.g. overdue AND
  // stale) only ever costs the score once - it's still one ticket.
  function calculateReality(tasks, result) {
    const done = tasks.filter((t) => t.status === "done").length;
    const total = tasks.length;
    if (!total) return { planned: 0, reality: 0, total: 0, riskyCount: 0 };

    const planned = Math.round((done / total) * 100);
    const risky = new Set([...result.overdue, ...result.blocked, ...result.stale, ...result.forgotten, ...result.clientWaiting].map((t) => t.id));
    const riskRatio = risky.size / total;
    const reality = Math.max(0, Math.round(planned - riskRatio * 100));
    return { planned, reality, total, riskyCount: risky.size };
  }

  function realityLabel(reality) {
    return reality >= 80 ? "Healthy" : reality >= 50 ? "At risk" : "Critical";
  }

  function realityColor(reality) {
    return reality >= 80 ? "var(--teal)" : reality >= 50 ? "var(--orange)" : "var(--critical)";
  }

  function renderReality(tasks, result) {
    const { planned, reality, total, riskyCount } = calculateReality(tasks, result);
    if (!total) return "";
    const gap = planned - reality;
    return `
      <div class="ticket p-3 mb-4">
        <p class="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-2">Reality check</p>
        <div class="flex items-end gap-4 mb-2">
          <div>
            <p class="text-2xl font-mono font-bold text-ink-soft">${planned}%</p>
            <p class="text-[11px] text-ink-soft">Planned (tickets done)</p>
          </div>
          <i class="fa-solid fa-arrow-right text-ink-soft text-xs mb-4"></i>
          <div>
            <p class="text-2xl font-mono font-bold" style="color:${realityColor(reality)}">${reality}%</p>
            <p class="text-[11px] text-ink-soft">Reality (${realityLabel(reality)})</p>
          </div>
        </div>
        <p class="text-xs text-ink-soft">${gap > 0
          ? `${riskyCount} of ${total} ticket${total === 1 ? "" : "s"} ${riskyCount === 1 ? "carries" : "carry"} a real risk signal right now, which is why this looks ${gap} point${gap === 1 ? "" : "s"} more finished than it actually is.`
          : "No gap right now - the plain completion number and reality agree."}</p>
      </div>`;
  }

  function healthLabel(level) {
    return level === "red" ? "Needs attention" : level === "yellow" ? "Watch closely" : "On track";
  }

  function healthColor(level) {
    return level === "red" ? "var(--critical)" : level === "yellow" ? "var(--orange)" : "var(--teal)";
  }

  // A real ring chart, not a decoration - each colored arc's length is
  // exactly that category's share of active tickets. Flagged tickets can
  // overlap categories (e.g. overdue AND stale), so this uses a single
  // "worst signal wins" bucket per ticket for the chart specifically,
  // just so the arcs always add up to the true active count - the
  // detailed sections below still list every signal a ticket has.
  function renderGauge(result) {
    const size = 112, stroke = 12, r = (size - stroke) / 2, c = 2 * Math.PI * r;
    const total = result.active.length;
    const bucketOf = (task) => {
      if (result.overdue.includes(task)) return "var(--critical)";
      if (result.blocked.includes(task)) return "var(--orange)";
      if (result.clientWaiting.includes(task)) return "#ec4899";
      if (result.stale.includes(task)) return "#a855f7";
      if (result.forgotten.includes(task)) return "#a855f7";
      if (result.dueSoon.includes(task)) return "var(--violet)";
      return "var(--teal)";
    };
    const counts = new Map();
    result.active.forEach((t) => counts.set(bucketOf(t), (counts.get(bucketOf(t)) || 0) + 1));
    // Fixed, meaningful color order so the ring reads the same way every
    // time rather than shuffling based on Map insertion order.
    const order = ["var(--critical)", "var(--orange)", "#ec4899", "#a855f7", "var(--violet)", "var(--teal)"];

    let offset = 0;
    const arcs = total === 0
      ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}" />`
      : order.filter((color) => counts.get(color)).map((color) => {
          const count = counts.get(color);
          const len = (count / total) * c;
          const dash = `${len} ${c - len}`;
          const circle = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}" stroke-linecap="butt" transform="rotate(-90 ${size / 2} ${size / 2})" />`;
          offset += len;
          return circle;
        }).join("");

    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        ${arcs}
        <text x="${size / 2}" y="${size / 2 - 4}" text-anchor="middle" class="font-display font-bold" style="font-size:22px;fill:${healthColor(result.level)}">${total}</text>
        <text x="${size / 2}" y="${size / 2 + 16}" text-anchor="middle" style="font-size:10px;fill:var(--ink-soft)">active ticket${total === 1 ? "" : "s"}</text>
      </svg>`;
  }

  // Every ticket name is a real button - clicking one closes this modal
  // and opens that exact ticket's edit screen, ready to actually fix.
  function taskChips(tasks) {
    const shown = tasks.slice(0, 6);
    const rest = tasks.length - shown.length;
    return `<div class="flex flex-wrap gap-1.5 mt-1.5">${shown.map((t) =>
      `<button type="button" data-open-health-task="${t.id}" class="text-xs px-2 py-1 rounded-full bg-[var(--paper-2)] hover:bg-[var(--paper-3,var(--paper-2))] truncate max-w-[160px]">${escapeHTML(t.title)}</button>`
    ).join("")}${rest > 0 ? `<span class="text-xs px-2 py-1 text-ink-soft">+${rest} more</span>` : ""}</div>`;
  }

  function reason(icon, color, title, tasks, note) {
    return `<div class="border border-line rounded-lg p-3"><div class="flex gap-3"><span class="h-7 w-7 rounded-md flex items-center justify-center shrink-0" style="background:color-mix(in srgb, ${color} 12%, transparent);color:${color}"><i class="fa-solid ${icon} text-xs"></i></span><div class="min-w-0 flex-1"><p class="text-sm font-semibold">${title}</p>${note ? `<p class="text-xs text-ink-soft mt-0.5">${note}</p>` : ""}${tasks ? taskChips(tasks) : ""}</div></div></div>`;
  }

  // Only makes sense once Task Assignment exists (schema_v46) - this
  // stays hidden entirely otherwise, rather than showing a workload
  // breakdown with nobody in it.
  function renderWorkloadByPerson(active) {
    const section = document.getElementById("board-health-workload");
    const bars = document.getElementById("board-health-workload-bars");
    if (!section || !state.taskAssignmentReady) { section?.classList.add("hidden"); return; }

    const counts = new Map(); // userId -> { label, count }
    const label = (userId) => userId === state.userId ? "Me" : (state.boardMembers || []).find((m) => m.user_id === userId)?.invited_email || "Someone";
    active.forEach((task) => {
      if (!task.assigned_to) return;
      const existing = counts.get(task.assigned_to);
      if (existing) existing.count++;
      else counts.set(task.assigned_to, { label: label(task.assigned_to), count: 1 });
    });

    if (!counts.size) { section.classList.add("hidden"); return; }
    section.classList.remove("hidden");

    const people = [...counts.values()].sort((a, b) => b.count - a.count);
    const max = Math.max(...people.map((p) => p.count));
    bars.innerHTML = people.map((p) => `
      <div>
        <div class="flex items-center justify-between text-xs mb-1"><span class="font-medium">${escapeHTML(p.label)}</span><span class="text-ink-soft">${p.count} active</span></div>
        <div class="h-2 rounded-full bg-[var(--paper-2)] overflow-hidden"><div class="h-full bg-violet" style="width:${(p.count / max) * 100}%"></div></div>
      </div>`).join("");
  }

  // ---- Silent Sentinel: the ambient layer ----
  // Everything above (calculateBoardHealth) is the same deterministic
  // detection Board Health has always used - Silent Sentinel isn't a
  // second, separate detection system (that would be duplicating the
  // exact same logic under a different name). What Sentinel actually
  // adds is HOW it's surfaced: quietly, in the board name itself,
  // without anyone needing to open Board Health first to find out
  // something's wrong - "tell me when something needs my attention,
  // don't make me constantly check" is fundamentally a UI/timing
  // property, not a different set of rules.
  function updateSentinelBadge() {
    const badge = document.getElementById("sentinel-badge");
    if (!badge) return;
    const result = calculateBoardHealth(state.tasks || []);
    const count = result.overdue.length + result.blocked.length + result.stale.length + result.forgotten.length + result.clientWaiting.length;
    if (!count) {
      badge.classList.add("hidden");
      badge.classList.remove("flex");
      return;
    }
    badge.classList.remove("hidden");
    badge.classList.add("flex");
    badge.textContent = count > 9 ? "9+" : String(count);
    badge.style.background = result.level === "red" ? "var(--critical)" : "var(--orange)";
    badge.style.color = "#fff";
  }

  function openBoardHealth() {
    const board = state.boards.find((item) => item.id === state.currentBoardId);
    const result = calculateBoardHealth(state.tasks || []);
    const modal = document.getElementById("board-health-modal");
    document.getElementById("board-switcher-menu")?.classList.add("hidden");
    document.getElementById("board-health-title").textContent = `${board?.name || "Board"} health`;
    const realityHost = document.getElementById("board-health-reality");
    if (realityHost) realityHost.innerHTML = renderReality(state.tasks || [], result);
    document.getElementById("board-health-gauge").innerHTML = renderGauge(result);
    document.getElementById("board-health-summary").innerHTML = `<strong style="color:${healthColor(result.level)}">${healthLabel(result.level)}.</strong> Based on ${result.active.length} active ticket${result.active.length === 1 ? "" : "s"}.`;
    document.getElementById("board-health-metrics").innerHTML = [
      ["Overdue", result.overdue.length, "var(--critical)"],
      ["Blocked", result.blocked.length, "var(--orange)"],
      ["Stale", result.stale.length, "#a855f7"],
      ["Forgotten", result.forgotten.length, "#a855f7"],
      ["Due in 3 days", result.dueSoon.length, "var(--violet)"],
      ["Client waiting", result.clientWaiting.length, "#ec4899"],
    ].map(([label, value, color]) => `<div class="border border-line rounded-lg p-3"><p class="font-mono text-xl font-semibold" style="color:${color}">${value}</p><p class="text-[11px] text-ink-soft mt-1">${label}</p></div>`).join("");

    const reasons = [];
    if (result.overdue.length) reasons.push(reason("fa-calendar-xmark", "var(--critical)", `${result.overdue.length} overdue`, result.overdue));
    if (result.blocked.length) reasons.push(reason("fa-link", "var(--orange)", `${result.blocked.length} waiting on a blocker`, result.blocked));
    if (result.stale.length) reasons.push(reason("fa-hourglass-half", "#a855f7", `${result.stale.length} stuck in progress`, result.stale, `In progress for more than ${STALE_DAYS} days with no status change.`));
    if (result.forgotten.length) reasons.push(reason("fa-ghost", "#a855f7", `${result.forgotten.length} forgotten`, result.forgotten, `Still in To Do, created more than ${STALE_DAYS} days ago, and nobody's assigned to it.`));
    if (result.clientWaiting.length) reasons.push(reason("fa-user-clock", "#ec4899", `${result.clientWaiting.length} waiting on the client`, result.clientWaiting, `Shared with the client more than ${STALE_DAYS} days ago with no response yet.`));
    if (result.dueSoon.length) reasons.push(reason("fa-clock", "var(--violet)", `${result.dueSoon.length} due soon`, result.dueSoon));
    if (result.noDueDate.length) reasons.push(reason("fa-calendar-minus", "var(--ink-soft)", `${result.noDueDate.length} without a deadline`, result.noDueDate, "Excluded from deadline risk until you set a due date."));
    if (!reasons.length) reasons.push(reason("fa-circle-check", "var(--teal)", "No tracked risk signals", null, "There are no overdue, blocked, stale, forgotten, or near-term tickets on this board."));
    document.getElementById("board-health-reasons").innerHTML = reasons.join("");
    renderWorkloadByPerson(result.active);
    modal.classList.remove("hidden");
    modal.querySelector("[data-close-board-health]")?.focus();
  }

  function closeBoardHealth() {
    document.getElementById("board-health-modal")?.classList.add("hidden");
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("board-health-btn")?.addEventListener("click", openBoardHealth);
    document.getElementById("board-health-modal")?.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-board-health]")) { closeBoardHealth(); return; }
      const chip = event.target.closest("[data-open-health-task]");
      if (chip) { closeBoardHealth(); openEditModal(chip.dataset.openHealthTask); }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeBoardHealth();
    });

    // Clicking the badge should open Board Health directly, not just
    // toggle the board switcher it happens to sit inside - intercepted
    // in the capturing phase so this runs before the switcher's own
    // click handler ever sees the event.
    document.getElementById("sentinel-badge")?.addEventListener("click", (event) => {
      event.stopPropagation();
      openBoardHealth();
    }, true);

    // Recompute after every board render, the same "wrap the existing
    // function" approach views-menu.js already uses for its own
    // button - this file never touches renderBoard's own logic, just
    // observes when it finishes.
    if (typeof renderBoard === "function") {
      const _originalRenderBoardForSentinel = renderBoard;
      renderBoard = function (...args) {
        const result = _originalRenderBoardForSentinel.apply(this, args);
        updateSentinelBadge();
        return result;
      };
    }
    updateSentinelBadge();
  });
})();
