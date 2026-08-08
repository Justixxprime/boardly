/* ==========================================================================
   BOARDLY - visual.js  ("v6: visual upgrades" add-on)
   --------------------------------------------------------------------------
   Same drop-in pattern as timely.js: loaded after dashboard.js (and after
   timely.js), reads the same global `state` / `supabaseClient` / rendering
   functions. Needs schema_v6_visual.sql run once (adds status_changed_at
   and done_at to tasks - see VISUAL_SETUP.md).

   Note: Focus mode and a 2-state density toggle already existed in
   dashboard.js before this file - not rebuilt here. This file extends
   density to a 3rd "detailed" state and adds everything else: swimlanes,
   inline title editing, time-in-column badges, custom column colors/
   icons, drag-to-reschedule on the calendar, a streak + activity panel,
   and an opt-in sunrise/sunset theme switch.
   ========================================================================== */

(function () {
  const HAS_STATE = typeof state !== "undefined";
  const HAS_SUPABASE = typeof supabaseClient !== "undefined";
  if (!HAS_STATE || !HAS_SUPABASE) return;

  // -------------------------------------------------------------------------
  // Stamp status_changed_at / done_at whenever a ticket moves. Everything
  // else in this file (time-in-column, streak, activity chart) reads off
  // these two columns, so this patch has to run before any of it matters.
  // -------------------------------------------------------------------------

  if (typeof window.moveTask === "function" && !window.moveTask.__timelyPatched) {
    const originalMoveTask = window.moveTask;
    const patchedMoveTask = async function (id, newStatus, position) {
      const result = await originalMoveTask(id, newStatus, position);
      const nowIso = new Date().toISOString();
      const patch = { status_changed_at: nowIso };
      if (newStatus === "done") patch.done_at = nowIso;
      const task = state.tasks.find((t) => t.id === id);
      if (task) Object.assign(task, patch);
      try { await supabaseClient.from("tasks").update(patch).eq("id", id); } catch (err) { /* non-critical, ignore */ }
      return result;
    };
    patchedMoveTask.__timelyPatched = true;
    window.moveTask = patchedMoveTask;
  }

  // -------------------------------------------------------------------------
  // 9. INLINE QUICK-EDIT - click a card's title to edit it right there.
  // -------------------------------------------------------------------------

  document.addEventListener("click", (e) => {
    if (state.bulkMode) return;
    const title = e.target.closest(".task-title");
    if (!title || title.isContentEditable) return;
    const card = title.closest("[data-id]");
    if (!card) return;
    e.stopPropagation();
    beginInlineEdit(title, card.dataset.id);
  }, true); // capture: get in ahead of dashboard.js's own card-click-opens-modal handler

  function beginInlineEdit(titleEl, taskId) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const original = task.title;
    titleEl.contentEditable = "true";
    titleEl.classList.add("ring-1", "ring-orange", "rounded", "px-1", "-mx-1");
    titleEl.focus();
    document.execCommand?.("selectAll", false, null);

    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      titleEl.contentEditable = "false";
      titleEl.classList.remove("ring-1", "ring-orange", "rounded", "px-1", "-mx-1");
      const newTitle = titleEl.textContent.trim();
      if (save && newTitle && newTitle !== original) {
        titleEl.textContent = newTitle;
        task.title = newTitle;
        await supabaseClient.from("tasks").update({ title: newTitle }).eq("id", taskId);
      } else {
        titleEl.textContent = original;
      }
      titleEl.removeEventListener("blur", onBlur);
      titleEl.removeEventListener("keydown", onKeydown);
    };
    const onBlur = () => finish(true);
    const onKeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
    };
    titleEl.addEventListener("blur", onBlur);
    titleEl.addEventListener("keydown", onKeydown);
  }

  // -------------------------------------------------------------------------
  // 10. TIME-IN-COLUMN BADGE
  // -------------------------------------------------------------------------

  function timeAgoShort(iso) {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${Math.max(mins, 0)}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  function renderTimeInColumnBadges() {
    document.querySelectorAll('#board [data-id]').forEach((card) => {
      const task = state.tasks.find((t) => t.id === card.dataset.id);
      if (!task || task.status === "done" || !task.status_changed_at) return;
      let badge = card.querySelector(".timely-in-col-badge");
      const label = timeAgoShort(task.status_changed_at);
      if (!label) return;
      if (!badge) {
        const meta = card.querySelector(".flex.items-center.gap-2.flex-wrap, .flex.flex-wrap") || card;
        badge = document.createElement("span");
        badge.className = "timely-in-col-badge font-mono text-[10px] text-ink-soft flex items-center gap-1 opacity-70";
        badge.title = "Time in this column";
        badge.innerHTML = '<i class="fa-regular fa-hourglass-half"></i>';
        meta.appendChild(badge);
      }
      badge.lastChild.nodeType === 3 ? (badge.lastChild.textContent = " " + label) : badge.appendChild(document.createTextNode(" " + label));
    });
  }

  // -------------------------------------------------------------------------
  // 3. SWIMLANES - regroup each column's cards into per-category bands
  //    after dashboard.js's own render, instead of a flat list.
  // -------------------------------------------------------------------------

  function applySwimlanes() {
    if (localStorage.getItem("boardly-swimlanes") !== "1") return;
    ["todo", "inprogress", "done"].forEach((col) => {
      const container = document.getElementById(`col-${col}`);
      if (!container || container.dataset.swimlaned === "1") return;
      const cards = [...container.children].filter((el) => el.dataset && el.dataset.id);
      if (!cards.length) return;
      const groups = new Map();
      cards.forEach((card) => {
        const task = state.tasks.find((t) => t.id === card.dataset.id);
        const cat = task?.category || "general";
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat).push(card);
      });
      if (groups.size <= 1) return; // nothing to actually group
      const frag = document.createDocumentFragment();
      [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([cat, catCards]) => {
        const lane = document.createElement("div");
        lane.className = "swimlane mb-2";
        lane.innerHTML = `<p class="text-[10px] uppercase tracking-wide text-ink-soft mb-1.5 flex items-center gap-1.5"><span class="h-1.5 w-1.5 rounded-full" style="background:${(typeof CATEGORY_COLOR !== "undefined" && CATEGORY_COLOR[cat]) || "var(--ink)"}"></span>${cat}</p>`;
        catCards.forEach((c) => lane.appendChild(c));
        frag.appendChild(lane);
      });
      container.innerHTML = "";
      container.appendChild(frag);
      container.dataset.swimlaned = "1";
    });
  }

  function injectSwimlaneToggle() {
    const anchor = document.getElementById("density-toggle");
    if (!anchor || document.getElementById("swimlane-toggle")) return;
    const btn = document.createElement("button");
    btn.id = "swimlane-toggle";
    btn.className = anchor.className;
    btn.title = "Group cards by category within each column";
    btn.innerHTML = '<i class="fa-solid fa-layer-group"></i>';
    btn.classList.toggle("active", localStorage.getItem("boardly-swimlanes") === "1");
    anchor.insertAdjacentElement("afterend", btn);
    btn.addEventListener("click", () => {
      const on = localStorage.getItem("boardly-swimlanes") === "1";
      localStorage.setItem("boardly-swimlanes", on ? "0" : "1");
      btn.classList.toggle("active", !on);
      renderBoard();
    });
  }

  // -------------------------------------------------------------------------
  // 4. DENSITY - dashboard.js already toggles compact <-> comfortable;
  //    this intercepts that button (capture phase, stops the original
  //    handler) and drives a 3rd "detailed" state instead.
  // -------------------------------------------------------------------------

  const DENSITY_STATES = ["comfortable", "compact", "detailed"];
  document.getElementById("density-toggle")?.addEventListener("click", (e) => {
    e.stopImmediatePropagation();
    const cur = DENSITY_STATES.includes(state.density) ? state.density : "comfortable";
    const next = DENSITY_STATES[(DENSITY_STATES.indexOf(cur) + 1) % DENSITY_STATES.length];
    state.density = next;
    localStorage.setItem("boardly-density", next);
    document.getElementById("board")?.classList.toggle("density-compact", next === "compact");
    document.getElementById("board")?.classList.toggle("density-detailed", next === "detailed");
    const btn = document.getElementById("density-toggle");
    if (btn) btn.innerHTML = next === "compact" ? '<i class="fa-solid fa-expand"></i>' : next === "detailed" ? '<i class="fa-solid fa-list"></i>' : '<i class="fa-solid fa-compress"></i>';
    typeof renderBoard === "function" && renderBoard();
  }, true);

  // -------------------------------------------------------------------------
  // 8. CUSTOM COLUMN COLORS/ICONS PER BOARD
  // -------------------------------------------------------------------------

  function columnStyleKey() { return `boardly-column-style-${state.currentBoardId || "default"}`; }
  function readColumnStyle() {
    try { return JSON.parse(localStorage.getItem(columnStyleKey()) || "{}"); } catch { return {}; }
  }
  function applyColumnStyle() {
    const style = readColumnStyle();
    ["todo", "inprogress", "done"].forEach((col) => {
      const section = document.querySelector(`[data-col="${col}"]`);
      if (!section || !style[col]) return;
      const dot = section.querySelector(".h-2.w-2.rounded-full");
      if (dot && style[col].color) dot.style.background = style[col].color;
      const h2 = section.querySelector("h2");
      if (h2 && style[col].icon) {
        let iconEl = h2.querySelector(".col-custom-icon");
        if (!iconEl) {
          iconEl = document.createElement("i");
          iconEl.className = `col-custom-icon ${style[col].icon} text-xs`;
          h2.prepend(iconEl);
        } else {
          iconEl.className = `col-custom-icon ${style[col].icon} text-xs`;
        }
      }
    });
  }

  const COLUMN_ICON_CHOICES = ["", "fa-solid fa-inbox", "fa-solid fa-fire", "fa-solid fa-flag", "fa-solid fa-bolt", "fa-solid fa-star", "fa-solid fa-check"];

  function showColumnStylePanel() {
    const style = readColumnStyle();
    const rows = ["todo", "inprogress", "done"].map((col) => {
      const label = col === "todo" ? "To do" : col === "inprogress" ? "In progress" : "Done";
      const cur = style[col] || {};
      return `<div class="flex items-center gap-2 py-2">
        <span class="text-sm flex-1">${label}</span>
        <input type="color" data-col-color="${col}" value="${cur.color || "#f97316"}" class="h-7 w-9 rounded border border-line bg-card">
        <select data-col-icon="${col}" class="border border-line rounded-lg px-1.5 py-1 text-xs bg-card focus:border-orange outline-none">
          ${COLUMN_ICON_CHOICES.map((ic) => `<option value="${ic}" ${cur.icon === ic ? "selected" : ""}>${ic ? ic.replace("fa-solid fa-", "") : "(none)"}</option>`).join("")}
        </select>
      </div>`;
    }).join("");
    renderVisualPanel("Column style for this board", `${rows}<p class="text-[11px] text-ink-soft mt-1">Saved per board, on this device.</p>`);
    document.querySelectorAll("[data-col-color]").forEach((el) => el.addEventListener("input", saveColumnStyleFromPanel));
    document.querySelectorAll("[data-col-icon]").forEach((el) => el.addEventListener("change", saveColumnStyleFromPanel));
  }
  function saveColumnStyleFromPanel() {
    const style = {};
    ["todo", "inprogress", "done"].forEach((col) => {
      style[col] = {
        color: document.querySelector(`[data-col-color="${col}"]`)?.value,
        icon: document.querySelector(`[data-col-icon="${col}"]`)?.value || "",
      };
    });
    localStorage.setItem(columnStyleKey(), JSON.stringify(style));
    applyColumnStyle();
  }

  // -------------------------------------------------------------------------
  // 5. DRAG-TO-RESCHEDULE ON THE CALENDAR
  // -------------------------------------------------------------------------

  function setupCalendarDragReschedule() {
    const grid = document.getElementById("cal-grid");
    if (!grid || grid.dataset.dragWired === "1") return;
    grid.dataset.dragWired = "1";

    grid.addEventListener("dragstart", (e) => {
      const chip = e.target.closest(".edit-target[data-id]");
      if (!chip) return;
      e.dataTransfer.setData("text/plain", chip.dataset.id);
      e.dataTransfer.effectAllowed = "move";
    });
    grid.addEventListener("dragover", (e) => {
      const cell = e.target.closest("[data-add-date]")?.closest(".kanban-col");
      if (cell) { e.preventDefault(); cell.classList.add("drag-over-day"); }
    });
    grid.addEventListener("dragleave", (e) => {
      e.target.closest(".kanban-col")?.classList.remove("drag-over-day");
    });
    grid.addEventListener("drop", async (e) => {
      const cell = e.target.closest(".kanban-col");
      cell?.classList.remove("drag-over-day");
      const dateBtn = cell?.querySelector("[data-add-date]");
      const taskId = e.dataTransfer.getData("text/plain");
      if (!dateBtn || !taskId) return;
      e.preventDefault();
      const newDate = dateBtn.dataset.addDate;
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task || task.due_date === newDate) return;
      task.due_date = newDate;
      await supabaseClient.from("tasks").update({ due_date: newDate }).eq("id", taskId);
      typeof renderCalendar === "function" && renderCalendar();
      typeof renderBoard === "function" && renderBoard();
      typeof toast === "function" && toast("Rescheduled", "ok");
    });
  }

  function makeCalendarChipsDraggable() {
    document.querySelectorAll("#cal-grid .edit-target[data-id]").forEach((chip) => {
      chip.draggable = true;
      chip.style.cursor = "grab";
    });
  }

  // -------------------------------------------------------------------------
  // 6 + 7. STREAK TRACKER + ACTIVITY PANEL (bar chart + heatmap)
  // -------------------------------------------------------------------------

  function completionDayCounts(days) {
    const counts = {};
    const now = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(now.getTime() - i * 86400000);
      counts[d.toISOString().slice(0, 10)] = 0;
    }
    (state.tasks || []).forEach((t) => {
      if (!t.done_at) return;
      const day = t.done_at.slice(0, 10);
      if (day in counts) counts[day]++;
    });
    return counts;
  }

  function computeStreak() {
    const counts = completionDayCounts(120);
    const days = Object.keys(counts).sort().reverse(); // today first
    let streak = 0;
    let i = 0;
    if (counts[days[0]] === 0) i = 1; // today's not over yet - don't break the streak on a zero-so-far today
    for (; i < days.length; i++) {
      if (counts[days[i]] > 0) streak++;
      else break;
    }
    return streak;
  }

  function renderStreakBadge() {
    let el = document.getElementById("timely-streak-badge");
    const streak = computeStreak();
    if (!streak) { el?.remove(); return; }
    if (!el) {
      const anchor = document.getElementById("density-toggle");
      if (!anchor) return;
      el = document.createElement("button");
      el.id = "timely-streak-badge";
      el.type = "button";
      el.title = "Open activity";
      el.className = "toolbar-btn !px-2.5";
      anchor.parentElement?.insertBefore(el, anchor);
      el.addEventListener("click", showActivityPanel);
    }
    el.innerHTML = `<i class="fa-solid fa-fire" style="color:var(--orange)"></i> ${streak}`;
  }

  function showActivityPanel() {
    const counts = completionDayCounts(14);
    const days = Object.keys(counts).sort();
    const barData = days.map((d) => ({
      label: new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2),
      value: counts[d],
      color: "var(--orange)",
    }));

    const heatCounts = completionDayCounts(91);
    const heatDays = Object.keys(heatCounts).sort();
    const max = Math.max(1, ...Object.values(heatCounts));
    const heatCells = heatDays.map((d) => {
      const v = heatCounts[d];
      const alpha = v === 0 ? 0.06 : Math.min(1, 0.25 + (v / max) * 0.75);
      return `<div title="${d}: ${v} completed" style="width:10px;height:10px;border-radius:2px;background:color-mix(in srgb, var(--orange) ${Math.round(alpha * 100)}%, transparent)"></div>`;
    }).join("");

    renderVisualPanel("Activity", `
      <p class="text-xs text-ink-soft mb-1">Completed, last 14 days</p>
      <div id="activity-bar-chart" style="height:110px" class="mb-4"></div>
      <p class="text-xs text-ink-soft mb-1">Last ~13 weeks</p>
      <div style="display:grid;grid-template-columns:repeat(13,10px);grid-auto-flow:column;gap:2px">${heatCells}</div>
      <p class="text-xs text-ink-soft mt-3">🔥 ${computeStreak()}-day streak</p>
    `);
    const chartEl = document.getElementById("activity-bar-chart");
    if (chartEl && typeof renderBarChart === "function") renderBarChart(chartEl, barData);
  }

  // -------------------------------------------------------------------------
  // 11. SUNRISE/SUNSET AUTO THEME (opt-in)
  // -------------------------------------------------------------------------

  // Simplified NOAA solar calculation - accurate to within a couple of
  // minutes, plenty for "is it dark yet".
  function sunTimes(date, lat, lon) {
    const rad = Math.PI / 180;
    const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
    const zenith = 90.833 * rad;
    const latRad = lat * rad;

    function calc(isSunrise) {
      const lngHour = lon / 15;
      const t = dayOfYear + ((isSunrise ? 6 : 18) - lngHour) / 24;
      const M = 0.9856 * t - 3.289;
      const Mrad = M * rad;
      let L = M + 1.916 * Math.sin(Mrad) + 0.02 * Math.sin(2 * Mrad) + 282.634;
      L = ((L % 360) + 360) % 360;
      const Lrad = L * rad;
      let RA = Math.atan2(0.91764 * Math.tan(Lrad), 1) / rad;
      RA = ((RA % 360) + 360) % 360;
      RA += (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90);
      RA /= 15;
      const sinDec = 0.39782 * Math.sin(Lrad);
      const cosDec = Math.cos(Math.asin(sinDec));
      const cosH = (Math.cos(zenith) - sinDec * Math.sin(latRad)) / (cosDec * Math.cos(latRad));
      if (cosH > 1 || cosH < -1) return null; // sun never rises/sets there today
      const H = (isSunrise ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad) / 15;
      const localT = H + RA - 0.06571 * t - 6.622;
      let UT = ((localT - lngHour) % 24 + 24) % 24;
      const h = Math.floor(UT), m = Math.floor((UT - h) * 60);
      const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h, m));
      return result;
    }
    return { sunrise: calc(true), sunset: calc(false) };
  }

  async function applyAutoTheme() {
    if (localStorage.getItem("boardly-auto-theme") !== "1") return;
    let coords = JSON.parse(localStorage.getItem("boardly-auto-theme-coords") || "null");
    if (!coords && navigator.geolocation) {
      coords = await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
          () => resolve(null),
          { timeout: 8000 }
        );
      });
      if (coords) localStorage.setItem("boardly-auto-theme-coords", JSON.stringify(coords));
    }
    if (!coords) return;
    const { sunrise, sunset } = sunTimes(new Date(), coords.lat, coords.lon);
    if (!sunrise || !sunset) return;
    const now = new Date();
    const isDark = now < sunrise || now > sunset;
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("boardly-theme", isDark ? "dark" : "light");
  }

  function injectAutoThemeToggle() {
    const menu = document.getElementById("more-menu");
    if (!menu || document.getElementById("timely-auto-theme-toggle")) return;
    const label = document.createElement("label");
    label.className = "w-full flex items-center gap-1.5 text-xs text-ink-soft hover:text-orange cursor-pointer";
    label.innerHTML = `<input id="timely-auto-theme-toggle" type="checkbox" class="rounded border-line">Dark mode follows sunset (uses location)`;
    menu.appendChild(label);
    const cb = document.getElementById("timely-auto-theme-toggle");
    cb.checked = localStorage.getItem("boardly-auto-theme") === "1";
    cb.addEventListener("change", () => {
      localStorage.setItem("boardly-auto-theme", cb.checked ? "1" : "0");
      if (cb.checked) applyAutoTheme();
    });
  }

  function injectColumnStyleMenuItem() {
    const menu = document.getElementById("more-menu");
    if (!menu || document.getElementById("timely-column-style-btn")) return;
    const btn = document.createElement("button");
    btn.id = "timely-column-style-btn";
    btn.type = "button";
    btn.className = "w-full text-left text-xs text-ink-soft hover:text-orange flex items-center gap-1.5";
    btn.innerHTML = '<i class="fa-solid fa-palette w-3.5"></i>Column style';
    menu.appendChild(btn);
    btn.addEventListener("click", () => { menu.classList.add("hidden"); showColumnStylePanel(); });
  }

  // -------------------------------------------------------------------------
  // Shared small popup panel (same look as Timely's, kept local so this
  // file doesn't depend on timely.js internals).
  // -------------------------------------------------------------------------

  function renderVisualPanel(title, bodyHtml) {
    document.getElementById("visual-panel-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "visual-panel-overlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:9997;background:rgba(10,10,15,.5);display:flex;align-items:center;justify-content:center;padding:16px";
    overlay.innerHTML = `<div class="ticket p-4 w-full" style="max-width:400px;max-height:80vh;overflow-y:auto">
      <div class="flex items-center justify-between mb-3">
        <p class="font-display font-semibold">${title}</p>
        <button type="button" id="visual-panel-close" class="text-ink-soft hover:text-orange"><i class="fa-solid fa-xmark"></i></button>
      </div>
      ${bodyHtml}
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById("visual-panel-close").addEventListener("click", () => overlay.remove());
  }

  // -------------------------------------------------------------------------
  // BOOT
  // -------------------------------------------------------------------------

  function afterEveryRender() {
    applySwimlanes();
    renderTimeInColumnBadges();
    applyColumnStyle();
    renderStreakBadge();
    makeCalendarChipsDraggable();
  }

  function boot() {
    injectSwimlaneToggle();
    injectColumnStyleMenuItem();
    injectAutoThemeToggle();
    setupCalendarDragReschedule();
    applyColumnStyle();
    renderStreakBadge();
    applyAutoTheme();
    setInterval(applyAutoTheme, 30 * 60000);
    setInterval(renderTimeInColumnBadges, 60000);

    // dashboard.js re-renders the board on every task change via its own
    // renderBoard() - wrapping it (same global-binding trick as moveTask
    // above) is what lets swimlanes/badges/column-style/streak reapply
    // after every one of those re-renders, not just once at load.
    if (typeof window.renderBoard === "function" && !window.renderBoard.__visualPatched) {
      const originalRenderBoard = window.renderBoard;
      const patched = function (...args) {
        ["todo", "inprogress", "done"].forEach((c) => { const el = document.getElementById(`col-${c}`); if (el) delete el.dataset.swimlaned; });
        const result = originalRenderBoard.apply(this, args);
        afterEveryRender();
        return result;
      };
      patched.__visualPatched = true;
      window.renderBoard = patched;
    }
  }

  const bootPoll = setInterval(() => {
    if (state.loaded) {
      clearInterval(bootPoll);
      boot();
    }
  }, 200);
  setTimeout(() => clearInterval(bootPoll), 15000);
})();
