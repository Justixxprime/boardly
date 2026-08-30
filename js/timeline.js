/* ==========================================================================
   BOARDLY - timeline.js  ("Timeline view" add-on)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/timeline.js" defer></script>

   No database migration needed for this one - it only reads data that
   already exists on every task: due_date (already in schema.sql) and
   blocked_by_id (already in schema_v11_dev_features.sql, the same field
   the "Blocked" chip on a task card already uses). Nothing new to run
   in Supabase.

   HOW A TASK'S BAR IS CALCULATED (since Boardly has no "start date"
   field, only "created" and "due"):
     bar start  = the day the task was created
     bar end    = the task's due date
   That's a reasonable stand-in for "how long this will take" without
   inventing a new database column nobody asked for. If a task has no
   due date, it doesn't have a bar - it just isn't shown here (it's
   still on the Kanban board and in Calendar's "No due date" section).
   ========================================================================== */

state.timelineZoom = "week";          // "week" (7px-ish per day, tight) or "month" (wider range, thin bars)
state.timelineCursor = startOfDay(new Date()); // left edge of the visible window

function startOfDay(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
function addDays(d, n) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}
function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

const TL_DAY_WIDTH = { week: 72, month: 28 };
const TL_VISIBLE_DAYS = { week: 14, month: 42 };
const TL_ROW_HEIGHT = 40;

// ---------------------------------------------------------------------------
// 1. SHOW / HIDE
// ---------------------------------------------------------------------------
function toggleTimelineView(show) {
  document.getElementById("board")?.classList.toggle("hidden", show);
  document.getElementById("calendar-view")?.classList.add("hidden"); // only one alternate view at a time
  document.getElementById("timeline-view")?.classList.toggle("hidden", !show);
  document.getElementById("timeline-view-btn")?.classList.toggle("active", show);
  document.getElementById("calendar-view-btn")?.classList.remove("active");
  if (show) {
    localStorage.setItem("boardly-view", "timeline");
    renderTimeline();
  } else if (localStorage.getItem("boardly-view") === "timeline") {
    localStorage.setItem("boardly-view", "board");
  }
}

// ---------------------------------------------------------------------------
// 2. RENDER
// ---------------------------------------------------------------------------
function renderTimeline() {
  const grid = document.getElementById("tl-grid");
  const titles = document.getElementById("tl-titles");
  const empty = document.getElementById("tl-empty");
  const label = document.getElementById("tl-range-label");
  if (!grid || !titles) return;

  const dayWidth = TL_DAY_WIDTH[state.timelineZoom];
  const visibleDays = TL_VISIBLE_DAYS[state.timelineZoom];
  const windowStart = state.timelineCursor;
  const windowEnd = addDays(windowStart, visibleDays);

  if (label) {
    const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    label.textContent = `${fmt(windowStart)} to ${fmt(addDays(windowEnd, -1))}`;
  }

  // Only tasks that have a due date show up on a timeline - a task with
  // no due date has no meaningful bar to draw.
  const tasksWithDates = (state.tasks || [])
    .filter((t) => t.due_date)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  if (empty) empty.classList.toggle("hidden", tasksWithDates.length > 0);
  if (!tasksWithDates.length) { grid.innerHTML = ""; titles.innerHTML = ""; return; }

  const totalWidth = visibleDays * dayWidth;
  const totalHeight = (tasksWithDates.length + 1) * TL_ROW_HEIGHT; // +1 for the date header row

  // ---- day header (sticky-top inside the scroll area) ----
  let headerHTML = `<div class="tl-header" style="height:${TL_ROW_HEIGHT}px;width:${totalWidth}px;">`;
  for (let i = 0; i < visibleDays; i++) {
    const day = addDays(windowStart, i);
    const isToday = daysBetween(day, new Date()) === 0;
    const isWeekStart = state.timelineZoom === "month" && day.getDay() === 1;
    headerHTML += `<div class="tl-day-col${isToday ? " today" : ""}" style="left:${i * dayWidth}px;width:${dayWidth}px;">
      ${state.timelineZoom === "week" || isWeekStart || i === 0 ? `<span>${day.toLocaleDateString(undefined, { weekday: state.timelineZoom === "week" ? "short" : undefined, day: "numeric", month: i === 0 || day.getDate() === 1 ? "short" : undefined })}</span>` : ""}
    </div>`;
  }
  headerHTML += `</div>`;

  // ---- bars, one row per task ----
  let barsHTML = "";
  let titlesHTML = `<div style="height:${TL_ROW_HEIGHT}px;" class="tl-title-header"></div>`;
  const rowIndexById = {};

  tasksWithDates.forEach((task, i) => {
    rowIndexById[task.id] = i;
    const top = (i + 1) * TL_ROW_HEIGHT;
    const start = task.created_at ? startOfDay(new Date(task.created_at)) : startOfDay(new Date(task.due_date));
    let end = startOfDay(new Date(task.due_date));
    if (end < start) end = start; // guard against odd/imported data

    const left = daysBetween(windowStart, start) * dayWidth;
    const width = Math.max((daysBetween(start, end) + 1) * dayWidth - 4, dayWidth - 4);
    const isDone = task.status === "done";
    const isOverdue = !isDone && end < startOfDay(new Date());

    titlesHTML += `<div class="tl-title-row" style="height:${TL_ROW_HEIGHT}px;" title="${escapeHTML(task.title)}">
      <span class="truncate">${escapeHTML(task.title)}</span>
    </div>`;

    barsHTML += `<div class="tl-bar${isDone ? " done" : ""}${isOverdue ? " overdue" : ""}"
      data-task-id="${task.id}"
      style="top:${top + 4}px;left:${left}px;width:${width}px;height:${TL_ROW_HEIGHT - 8}px;">
      <span class="truncate px-2">${escapeHTML(task.title)}</span>
    </div>`;
  });

  // ---- dependency lines (blocked_by_id -> this task) ----
  let linesHTML = "";
  tasksWithDates.forEach((task, i) => {
    if (!task.blocked_by_id || !(task.blocked_by_id in rowIndexById)) return;
    const fromIdx = rowIndexById[task.blocked_by_id];
    const toIdx = i;
    const fromTask = tasksWithDates[fromIdx];
    const fromEnd = startOfDay(new Date(fromTask.due_date));
    const toStart = task.created_at ? startOfDay(new Date(task.created_at)) : startOfDay(new Date(task.due_date));
    const x1 = daysBetween(windowStart, fromEnd) * dayWidth + dayWidth - 2;
    const y1 = (fromIdx + 1) * TL_ROW_HEIGHT + TL_ROW_HEIGHT / 2;
    const x2 = daysBetween(windowStart, toStart) * dayWidth + 2;
    const y2 = (toIdx + 1) * TL_ROW_HEIGHT + TL_ROW_HEIGHT / 2;
    const midX = (x1 + x2) / 2;
    linesHTML += `<path d="M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}" class="tl-dep-line" marker-end="url(#tl-arrow)" />`;
  });

  grid.style.width = totalWidth + "px";
  grid.style.height = totalHeight + "px";
  grid.innerHTML = `
    ${headerHTML}
    <svg class="tl-dep-svg" width="${totalWidth}" height="${totalHeight}">
      <defs>
        <marker id="tl-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" class="tl-dep-arrow" />
        </marker>
      </defs>
      ${linesHTML}
    </svg>
    ${barsHTML}
  `;
  titles.innerHTML = titlesHTML;
  titles.style.height = totalHeight + "px";

  attachBarInteractions();
}

// ---------------------------------------------------------------------------
// 3. INTERACTIONS - click a bar to open the task, drag a bar to reschedule
//    its due date (dragging moves the WHOLE bar, so the task keeps the
//    same length, just shifts to a new due date).
// ---------------------------------------------------------------------------
function attachBarInteractions() {
  const dayWidth = TL_DAY_WIDTH[state.timelineZoom];
  document.querySelectorAll(".tl-bar").forEach((bar) => {
    let dragging = false;
    let startX = 0;
    let startLeft = 0;
    let moved = false;

    bar.addEventListener("pointerdown", (e) => {
      dragging = true;
      moved = false;
      startX = e.clientX;
      startLeft = parseFloat(bar.style.left);
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const deltaPx = e.clientX - startX;
      if (Math.abs(deltaPx) > 4) moved = true;
      const snappedDelta = Math.round(deltaPx / dayWidth) * dayWidth;
      bar.style.left = startLeft + snappedDelta + "px";
    });
    bar.addEventListener("pointerup", async (e) => {
      dragging = false;
      const taskId = bar.dataset.taskId;
      if (!moved) { openEditModal(taskId); return; }
      const deltaPx = parseFloat(bar.style.left) - startLeft;
      const deltaDays = Math.round(deltaPx / dayWidth);
      if (deltaDays === 0) return;
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return;
      const newDueDate = addDays(new Date(task.due_date), deltaDays);
      const isoDate = newDueDate.toISOString().slice(0, 10);
      // Optimistic: update locally, re-render, then save. Roll back on failure
      // - same pattern the Kanban drag-and-drop already uses in dashboard.js.
      const prevDueDate = task.due_date;
      task.due_date = isoDate;
      renderTimeline();
      const { error } = await supabaseClient.from("tasks").update({ due_date: isoDate }).eq("id", taskId);
      if (error) {
        task.due_date = prevDueDate;
        renderTimeline();
        typeof toast === "function" && toast("Couldn't reschedule: " + error.message, "error");
      } else {
        typeof toast === "function" && toast(`Rescheduled to ${newDueDate.toLocaleDateString()}`, "ok");
      }
    });
  });
}

// ---------------------------------------------------------------------------
// 4. BOOT
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const savedView = localStorage.getItem("boardly-view");
  if (savedView === "timeline") toggleTimelineView(true);

  document.getElementById("timeline-view-btn")?.addEventListener("click", () => {
    toggleTimelineView(document.getElementById("timeline-view")?.classList.contains("hidden"));
  });
  // Switching TO calendar should switch OFF timeline, same one-view-at-a-time rule.
  document.getElementById("calendar-view-btn")?.addEventListener("click", () => {
    document.getElementById("timeline-view")?.classList.add("hidden");
    document.getElementById("timeline-view-btn")?.classList.remove("active");
  });

  document.getElementById("tl-prev-btn")?.addEventListener("click", () => {
    const step = TL_VISIBLE_DAYS[state.timelineZoom];
    state.timelineCursor = addDays(state.timelineCursor, -step);
    renderTimeline();
  });
  document.getElementById("tl-next-btn")?.addEventListener("click", () => {
    const step = TL_VISIBLE_DAYS[state.timelineZoom];
    state.timelineCursor = addDays(state.timelineCursor, step);
    renderTimeline();
  });
  document.getElementById("tl-today-btn")?.addEventListener("click", () => {
    state.timelineCursor = startOfDay(new Date());
    renderTimeline();
  });
  document.getElementById("tl-zoom-week")?.addEventListener("click", () => setTimelineZoom("week"));
  document.getElementById("tl-zoom-month")?.addEventListener("click", () => setTimelineZoom("month"));
});

function setTimelineZoom(zoom) {
  state.timelineZoom = zoom;
  document.getElementById("tl-zoom-week")?.classList.toggle("active", zoom === "week");
  document.getElementById("tl-zoom-month")?.classList.toggle("active", zoom === "month");
  renderTimeline();
}

// Re-render whenever tasks change, if the timeline is currently visible -
// dashboard.js calls renderBoard() after every load/change; piggyback on
// the same moment without editing dashboard.js.
const _originalRenderBoard = window.renderBoard;
if (typeof _originalRenderBoard === "function") {
  window.renderBoard = function (...args) {
    const result = _originalRenderBoard.apply(this, args);
    if (!document.getElementById("timeline-view")?.classList.contains("hidden")) renderTimeline();
    return result;
  };
}
