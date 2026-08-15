/* ==========================================================================
   BOARDLY - datepicker.js
   --------------------------------------------------------------------------
   Native <input type="date"> / type="datetime-local"> popups are drawn by
   the OS/browser, not the page - no CSS can touch them, which is why they
   look like plain system UI instead of part of Boardly. This replaces
   them with a fully custom-styled picker, built from the same design
   tokens (--orange, --card, --line, etc) as the rest of the app, so it
   looks and feels native to Boardly instead of to Windows or iOS.

   The real <input> stays in the DOM (just visually hidden) and stays the
   single source of truth - this only ever writes to `.value` and fires a
   real "input"+"change" event on it, so every bit of dashboard.js/
   timely.js that already reads that field keeps working untouched.

   Usage: attachDatePicker(document.getElementById("edit-due-date")),
   called automatically below for the four date/time fields in the app.
   ========================================================================== */

(function () {
  if (document.getElementById("tdp-styles")) return; // already wired up once

  const style = document.createElement("style");
  style.id = "tdp-styles";
  style.textContent = `
    .tdp-trigger{
      width:100%; text-align:left; display:flex; align-items:center; gap:8px;
      font-family:inherit; cursor:pointer;
    }
    .tdp-trigger .tdp-icon{ color:var(--orange); opacity:.85; }
    .tdp-trigger .tdp-placeholder{ color:var(--ink-soft); }
    .tdp-popover{
      position:fixed; z-index:9500; width:280px;
      max-height:calc(100vh - 24px); overflow-y:auto;
      background:var(--card); border:1px solid var(--line); border-radius:16px;
      box-shadow:var(--shadow-lg, 0 12px 32px rgba(0,0,0,.18));
      padding:14px; animation:tdp-pop .14s ease-out;
    }
    @keyframes tdp-pop{ from{ opacity:0; transform:translateY(-4px) scale(.98) } to{ opacity:1; transform:none } }
    .tdp-cal-header{ display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
    .tdp-month-label{ font-family:'Space Grotesk',sans-serif; font-weight:600; font-size:14px; color:var(--ink); }
    .tdp-nav{ display:flex; gap:4px; }
    .tdp-nav button{
      width:26px; height:26px; border-radius:8px; display:flex; align-items:center; justify-content:center;
      color:var(--ink-soft); transition:background .12s, color .12s;
    }
    .tdp-nav button:hover{ background:var(--paper-2); color:var(--orange); }
    .tdp-weekdays{ display:grid; grid-template-columns:repeat(7,1fr); text-align:center; margin-bottom:2px; }
    .tdp-weekdays span{ font-size:10px; color:var(--ink-soft); font-family:'IBM Plex Mono',monospace; }
    .tdp-days{ display:grid; grid-template-columns:repeat(7,1fr); gap:1px; }
    .tdp-day{
      aspect-ratio:1; display:flex; align-items:center; justify-content:center;
      font-size:12.5px; border-radius:9px; color:var(--ink); cursor:pointer;
      font-family:'IBM Plex Mono',monospace; transition:background .12s, color .12s, transform .1s;
    }
    .tdp-day:hover{ background:var(--paper-2); }
    .tdp-day:active{ transform:scale(.9); }
    .tdp-day.tdp-muted{ color:var(--ink-soft); opacity:.4; }
    .tdp-day.tdp-today{ box-shadow:inset 0 0 0 1px var(--orange); }
    .tdp-day.tdp-selected{ background:var(--orange); color:#fff; font-weight:700; }
    .tdp-time{ display:flex; align-items:stretch; gap:6px; margin-top:12px; padding-top:12px; border-top:1px dashed var(--line); height:112px; position:relative; }
    .tdp-time-col{
      flex:1; overflow-y:auto; scroll-snap-type:y mandatory; border-radius:10px;
      background:var(--paper-2); position:relative; scrollbar-width:none;
    }
    .tdp-time-col::-webkit-scrollbar{ display:none; }
    .tdp-time-col-inner{ padding:44px 0; }
    .tdp-time-cell{
      height:24px; scroll-snap-align:center; display:flex; align-items:center; justify-content:center;
      font-family:'IBM Plex Mono',monospace; font-size:13px; color:var(--ink-soft); cursor:pointer;
      transition:color .1s, font-weight .1s;
    }
    .tdp-time-cell.tdp-time-selected{ color:var(--orange); font-weight:700; font-size:14px; }
    .tdp-time-center-line{
      position:absolute; top:50%; left:4px; right:4px; height:24px; margin-top:-12px;
      border-top:1px solid var(--line); border-bottom:1px solid var(--line); pointer-events:none; border-radius:6px;
    }
    .tdp-footer{ display:flex; align-items:center; justify-content:space-between; margin-top:12px; }
    .tdp-footer button{ font-size:12px; font-weight:600; padding:6px 10px; border-radius:8px; }
    .tdp-footer .tdp-clear, .tdp-footer .tdp-today-btn{ color:var(--ink-soft); }
    .tdp-footer .tdp-clear:hover, .tdp-footer .tdp-today-btn:hover{ color:var(--orange); background:var(--paper-2); }
    .tdp-footer .tdp-done{ background:var(--orange); color:#fff; padding:7px 16px; }
    @media (max-width:480px){
      .tdp-popover{
        position:fixed; left:12px; right:12px; bottom:calc(12px + env(safe-area-inset-bottom));
        margin-top:0; width:auto; top:auto !important;
        max-height:min(calc(100dvh - 24px - env(safe-area-inset-bottom)), calc(var(--vvh, 100vh) - 24px));
      }
    }
  `;
  document.head.appendChild(style);

  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const WEEKDAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

  function pad(n) { return String(n).padStart(2, "0"); }

  function parseValue(input) {
    const isDateTime = input.type === "datetime-local";
    if (!input.value) return { date: new Date(), hasValue: false };
    if (isDateTime) {
      const [datePart, timePart] = input.value.split("T");
      const [y, m, d] = datePart.split("-").map(Number);
      const [hh, mm] = (timePart || "00:00").split(":").map(Number);
      return { date: new Date(y, m - 1, d, hh, mm), hasValue: true };
    }
    const [y, m, d] = input.value.split("-").map(Number);
    return { date: new Date(y, m - 1, d), hasValue: true };
  }

  function formatDisplay(date, isDateTime, hasValue, placeholder) {
    if (!hasValue) return `<span class="tdp-placeholder">${placeholder}</span>`;
    const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    if (!isDateTime) return dateStr;
    const timeStr = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${dateStr} <span style="opacity:.6">·</span> ${timeStr}`;
  }

  function attachDatePicker(input, opts) {
    if (!input || input.dataset.tdpAttached) return;
    input.dataset.tdpAttached = "1";
    const isDateTime = input.type === "datetime-local";
    const placeholder = (opts && opts.placeholder) || (isDateTime ? "Set a time" : "Set a date");

    input.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;";
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:relative; flex:1 1 auto; min-width:0;";
    input.insertAdjacentElement("afterend", wrap);

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = input.className.replace("hidden", "") + " tdp-trigger";
    trigger.innerHTML = `<i class="fa-regular ${isDateTime ? "fa-clock" : "fa-calendar"} tdp-icon"></i><span class="tdp-label"></span>`;
    wrap.appendChild(trigger);

    let state = parseValue(input);
    let viewMonth = state.date.getMonth();
    let viewYear = state.date.getFullYear();

    function refreshTriggerLabel() {
      trigger.querySelector(".tdp-label").innerHTML = formatDisplay(state.date, isDateTime, state.hasValue, placeholder);
    }
    refreshTriggerLabel();

    function commit() {
      if (!state.hasValue) { input.value = ""; }
      else if (isDateTime) {
        input.value = `${state.date.getFullYear()}-${pad(state.date.getMonth() + 1)}-${pad(state.date.getDate())}T${pad(state.date.getHours())}:${pad(state.date.getMinutes())}`;
      } else {
        input.value = `${state.date.getFullYear()}-${pad(state.date.getMonth() + 1)}-${pad(state.date.getDate())}`;
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      refreshTriggerLabel();
    }

    let popover = null;
    function closePopover() { popover?.remove(); popover = null; document.removeEventListener("click", onOutsideClick, true); }
    function onOutsideClick(e) { if (popover && !popover.contains(e.target) && e.target !== trigger) closePopover(); }

    function buildCalendar() {
      const firstOfMonth = new Date(viewYear, viewMonth, 1);
      const startWeekday = firstOfMonth.getDay();
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
      const today = new Date();
      let cells = "";
      for (let i = startWeekday - 1; i >= 0; i--) cells += `<span class="tdp-day tdp-muted">${daysInPrevMonth - i}</span>`;
      for (let d = 1; d <= daysInMonth; d++) {
        const isToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === d;
        const isSelected = state.hasValue && state.date.getFullYear() === viewYear && state.date.getMonth() === viewMonth && state.date.getDate() === d;
        cells += `<span class="tdp-day ${isToday ? "tdp-today" : ""} ${isSelected ? "tdp-selected" : ""}" data-day="${d}">${d}</span>`;
      }
      const totalCells = startWeekday + daysInMonth;
      const trailing = (7 - (totalCells % 7)) % 7;
      for (let d = 1; d <= trailing; d++) cells += `<span class="tdp-day tdp-muted">${d}</span>`;
      return cells;
    }

    function timeColumnHtml(items, selectedIndex, colClass) {
      const cells = items.map((label, i) => `<div class="tdp-time-cell ${i === selectedIndex ? "tdp-time-selected" : ""}" data-idx="${i}">${label}</div>`).join("");
      return `<div class="tdp-time-col" data-col="${colClass}"><div class="tdp-time-col-inner">${cells}</div></div>`;
    }

    function renderPopover() {
      popover.innerHTML = `
        <div class="tdp-cal-header">
          <span class="tdp-month-label">${MONTH_NAMES[viewMonth]} ${viewYear}</span>
          <div class="tdp-nav">
            <button type="button" data-tdp-prev><i class="fa-solid fa-chevron-left" style="font-size:11px"></i></button>
            <button type="button" data-tdp-next><i class="fa-solid fa-chevron-right" style="font-size:11px"></i></button>
          </div>
        </div>
        <div class="tdp-weekdays">${WEEKDAYS.map((w) => `<span>${w}</span>`).join("")}</div>
        <div class="tdp-days">${buildCalendar()}</div>
        ${isDateTime ? renderTimeSection() : ""}
        <div class="tdp-footer">
          <button type="button" class="tdp-clear">Clear</button>
          <div style="display:flex;gap:6px">
            <button type="button" class="tdp-today-btn">Today</button>
            <button type="button" class="tdp-done">Done</button>
          </div>
        </div>`;
      wireCalendarEvents();
      if (isDateTime) wireTimeEvents();
      wireFooterEvents();
    }

    function renderTimeSection() {
      let h = state.date.getHours();
      const period = h >= 12 ? "PM" : "AM";
      let h12 = h % 12; if (h12 === 0) h12 = 12;
      const hours = Array.from({ length: 12 }, (_, i) => pad(i + 1));
      const minutes = Array.from({ length: 60 }, (_, i) => pad(i));
      return `<div class="tdp-time">
        ${timeColumnHtml(hours, h12 - 1, "hour")}
        ${timeColumnHtml(minutes, state.date.getMinutes(), "minute")}
        ${timeColumnHtml(["AM", "PM"], period === "AM" ? 0 : 1, "period")}
        <div class="tdp-time-center-line"></div>
      </div>`;
    }

    function scrollColumnTo(col, index) {
      const cell = col.querySelectorAll(".tdp-time-cell")[index];
      if (cell) col.scrollTop = cell.offsetTop - col.clientHeight / 2 + cell.offsetHeight / 2;
    }

    function wireTimeEvents() {
      popover.querySelectorAll(".tdp-time-col").forEach((col) => {
        const key = col.dataset.col;
        const cells = [...col.querySelectorAll(".tdp-time-cell")];
        const selected = col.querySelector(".tdp-time-selected");
        requestAnimationFrame(() => selected && scrollColumnTo(col, cells.indexOf(selected)));

        cells.forEach((cell, i) => {
          cell.addEventListener("click", () => { applyTimePart(key, i); scrollColumnTo(col, i); highlightCell(col, i); });
        });

        let scrollTimer = null;
        col.addEventListener("scroll", () => {
          clearTimeout(scrollTimer);
          scrollTimer = setTimeout(() => {
            const center = col.scrollTop + col.clientHeight / 2;
            let closest = 0, best = Infinity;
            cells.forEach((c, i) => { const d = Math.abs((c.offsetTop + c.offsetHeight / 2) - center); if (d < best) { best = d; closest = i; } });
            applyTimePart(key, closest);
            highlightCell(col, closest);
          }, 120);
        });
      });
    }

    function highlightCell(col, index) {
      col.querySelectorAll(".tdp-time-cell").forEach((c, i) => c.classList.toggle("tdp-time-selected", i === index));
    }

    function applyTimePart(key, index) {
      state.hasValue = true;
      const d = new Date(state.date);
      if (key === "hour") {
        let h = d.getHours(); const isPM = h >= 12;
        d.setHours((index + 1) % 12 + (isPM ? 12 : 0));
      } else if (key === "minute") {
        d.setMinutes(index);
      } else if (key === "period") {
        let h = d.getHours() % 12;
        d.setHours(index === 1 ? h + 12 : h);
      }
      state.date = d;
    }

    function wireCalendarEvents() {
      popover.querySelector("[data-tdp-prev]").addEventListener("click", () => { viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } renderPopover(); });
      popover.querySelector("[data-tdp-next]").addEventListener("click", () => { viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } renderPopover(); });
      popover.querySelectorAll(".tdp-day[data-day]").forEach((el) => {
        el.addEventListener("click", () => {
          const d = new Date(state.date);
          d.setFullYear(viewYear, viewMonth, Number(el.dataset.day));
          state.date = d;
          state.hasValue = true;
          renderPopover();
        });
      });
    }

    function wireFooterEvents() {
      popover.querySelector(".tdp-clear").addEventListener("click", () => { state.hasValue = false; commit(); closePopover(); });
      popover.querySelector(".tdp-today-btn").addEventListener("click", () => {
        const now = new Date();
        state.date = state.hasValue && isDateTime ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), state.date.getHours(), state.date.getMinutes()) : now;
        state.hasValue = true;
        viewMonth = now.getMonth(); viewYear = now.getFullYear();
        renderPopover();
      });
      popover.querySelector(".tdp-done").addEventListener("click", () => { commit(); closePopover(); });
    }

    function openPopover() {
      if (popover) { closePopover(); return; }
      state = parseValue(input);
      viewMonth = state.date.getMonth();
      viewYear = state.date.getFullYear();
      popover = document.createElement("div");
      popover.className = "tdp-popover";
      // Appended to <body>, not the local wrap - wrap sits inside the
      // scrollable edit-ticket modal, and an absolutely-positioned child
      // of something inside a scrolling/clipping container is exactly
      // what was making this render detached from the trigger and
      // clipped at the top. Fixed positioning + a body-level parent
      // sidesteps all of that; position is computed explicitly below
      // instead of relying on implicit CSS flow placement.
      document.body.appendChild(popover);
      renderPopover();
      positionPopover();
      popover.scrollTop = 0;

      // Scroll events bubble to window (with capture:true) from ANY
      // scrollable descendant - including the popover's own internal
      // scroll (the calendar/time columns), not just the page/modal
      // scrolling around it. Without the target check below, scrolling
      // inside the popover itself kept re-centering and fighting the
      // scroll gesture instead of just letting it scroll normally.
      const reposition = (e) => { if (!popover.contains(e.target)) positionPopover(); };
      window.addEventListener("scroll", reposition, true); // capture: still catches the modal's own scroll
      window.addEventListener("resize", reposition);
      const cleanup = closePopover;
      closePopover = () => {
        window.removeEventListener("scroll", reposition, true);
        window.removeEventListener("resize", reposition);
        cleanup();
        closePopover = cleanup;
      };

      setTimeout(() => document.addEventListener("click", onOutsideClick, true), 0);
    }

    function positionPopover() {
      if (!popover) return;
      if (window.matchMedia("(max-width:480px)").matches) return; // fixed bottom-sheet CSS handles itself
      const triggerRect = trigger.getBoundingClientRect();
      const margin = 8;
      popover.style.maxHeight = "";
      const popoverHeight = Math.min(popover.scrollHeight, window.innerHeight - margin * 2);
      const popoverWidth = popover.offsetWidth || 280;

      // Prefer opening below the field; flip above only if there's
      // genuinely more room there and it still doesn't fit below.
      const spaceBelow = window.innerHeight - triggerRect.bottom - margin;
      const spaceAbove = triggerRect.top - margin;
      let top;
      if (popoverHeight <= spaceBelow || spaceBelow >= spaceAbove) {
        top = triggerRect.bottom + 6;
        popover.style.maxHeight = `${Math.max(spaceBelow, 120)}px`;
      } else {
        top = Math.max(margin, triggerRect.top - 6 - popoverHeight);
        popover.style.maxHeight = `${Math.max(spaceAbove, 120)}px`;
      }
      top = Math.min(Math.max(top, margin), window.innerHeight - margin - 40);

      let left = triggerRect.left;
      if (left + popoverWidth > window.innerWidth - margin) left = window.innerWidth - popoverWidth - margin;
      left = Math.max(left, margin);

      popover.style.top = `${Math.round(top)}px`;
      popover.style.left = `${Math.round(left)}px`;
    }

    trigger.addEventListener("click", openPopover);
  }

  function boot() {
    ["edit-due-date", "edit-reminder-at", "timely-auto-start", "timely-auto-done-at"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) attachDatePicker(el);
    });
    // timely-edit-fields (which holds two of these) is injected by timely.js
    // asynchronously - keep checking for a bit until it exists.
    let tries = 0;
    const poll = setInterval(() => {
      tries++;
      const start = document.getElementById("timely-auto-start");
      const done = document.getElementById("timely-auto-done-at");
      if (start) attachDatePicker(start);
      if (done) attachDatePicker(done);
      if ((start && done) || tries > 40) clearInterval(poll);
    }, 250);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.Timely = window.Timely || {};
  window.Timely.attachDatePicker = attachDatePicker;
})();
