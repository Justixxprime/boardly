/* ==========================================================================
   BOARDLY - dashboard.js
   The kanban board's core - state, rendering, database calls, and the
   main actions (add/toggle/delete/move a task).

   A number of self-contained "extra" features that don't need to exist
   until someone actually clicks them have been split into their own
   files, loaded right after this one - see js/dashboard-extras.js and
   js/dashboard-behaviors.js for what's moved so far (export, bulk
   import, undo/redo, board backgrounds, presentation mode, ambient
   background, geofence reminders, swipe gestures, zen mode, keyboard
   navigation, gamification). This is an ongoing, gradual split, not a
   rewrite - everything still shares the same global scope, so nothing
   about how any feature behaves has changed, only where its code
   lives. Look there first if you can't find something that used to be
   in this file.

     1. STATE           - the single source of truth in memory
     2. RENDERING        - turning state into DOM
     3. DATA (Supabase)  - talking to the database
     4. OPTIMISTIC ACTIONS - add / toggle / delete / move
     5. DRAG AND DROP     - SortableJS wiring
     6. COMMAND PALETTE   - Ctrl+K
     7. BOOT              - runs everything on page load
   ========================================================================== */

// ---------------------------------------------------------------------------
// 1. STATE
// ---------------------------------------------------------------------------
const state = {
  userId: null,
  userEmail: null,
  tasks: [],           // flat array of every task, each has {id, title, category, status, due_date, position}
  loaded: false,
  filterQuery: "",      // live search/filter text
  bulkMode: false,      // select-multiple mode on/off
  selectedIds: new Set(), // ticket ids currently checked, while bulkMode is on
  editingId: null,       // id of the task currently open in the edit modal
  editingSubtasks: [],   // working copy of the subtasks list while the edit modal is open
  boards: [],            // every board this account owns
  currentBoardId: null,  // which board is currently shown
  v2Ready: false,         // whether supabase/schema_v2.sql has been run on this project
  remindersReady: false,  // whether supabase/schema_v3_reminders.sql has been run
  reminderRepeatReady: false, // whether supabase/schema_v7_reminder_repeat.sql has been run
  socialReady: false,         // whether supabase/schema_v8_social.sql has been run
  proReady: false,            // whether supabase/schema_v9_pro.sql has been run
  attachmentsReady: false,    // whether supabase/schema_v10_multi_attachments.sql has been run
  devReady: false,            // whether supabase/schema_v11_dev_features.sql has been run
  verticalReady: false,       // whether supabase/schema_v14_vertical_fields.sql has been run
  editingTimeTick: null,      // live-updating interval while a time-tracking timer is running in the open ticket
  editingGeo: null,           // { lat, lng } pending for the ticket currently open in the edit modal
  realtimeChannel: null, // the live Supabase channel for the current board
  sortMode: "manual",     // "manual" | "due_date" | "title" | "category"
  density: "comfortable", // "comfortable" | "compact"
  soundOn: true,
  accent: "sunset",
  zenColumn: null,        // column key currently focused, or null
  actionHistory: [],      // stack of {undo} entries for Ctrl+Z
  focusedCardId: null,    // card currently highlighted for keyboard nav
  quickAddHistory: [],
  quickAddHistoryIndex: -1,
};

const OFFLINE_QUEUE_KEY = "boardly-offline-queue";
const CURRENT_BOARD_KEY = "boardly-current-board";
const BASE_TITLE = document.title;

const COLUMNS = ["todo", "inprogress", "done"];
const CATEGORY_RAIL = {
  general: "rail-ink",
  work: "rail-orange",
  personal: "rail-violet",
  urgent: "rail-teal",
};
const CATEGORY_LABEL = {
  general: "General",
  work: "Work",
  personal: "Personal",
  urgent: "Urgent",
};

// ---------------------------------------------------------------------------
// 2. RENDERING
// ---------------------------------------------------------------------------

function formatDueDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isOverdue(dateStr, status) {
  if (!dateStr || status === "done") return false;
  const due = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

/* ---------------------------------------------------------------------
   SMART QUICK-ADD - reads a few common date phrases and #category tags
   straight out of the title text you type, instead of making you fill
   out separate fields. Deliberately simple pattern-matching, not real
   language understanding - it looks for a fixed list of phrases, and if
   none match, the title just gets saved as-is with no date/category
   guess, so it never silently mangles something it doesn't recognize.
--------------------------------------------------------------------- */
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const CATEGORY_TAGS = { work: "work", personal: "personal", urgent: "urgent", general: "general" };
const REMINDER_REPEAT_LABEL = { daily: "every day", weekdays: "every weekday", weekly: "every week" };

const PLATFORM_META = {
  instagram: { label: "Instagram", icon: "fa-brands fa-instagram", color: "#E1306C", bestTime: "Best engagement is usually weekdays 11am-1pm and 7-9pm.", limit: 2200 },
  facebook:  { label: "Facebook",  icon: "fa-brands fa-facebook",  color: "#1877F2", bestTime: "Best engagement is usually weekdays 1-3pm.", limit: 63206 },
  x:         { label: "X / Twitter", icon: "fa-brands fa-x-twitter", color: "#0F1419", bestTime: "Best engagement is usually weekdays 9am and 12pm.", limit: 280 },
  linkedin:  { label: "LinkedIn",  icon: "fa-brands fa-linkedin",  color: "#0A66C2", bestTime: "Best engagement is usually Tue-Thu, 8-10am.", limit: 3000 },
  tiktok:    { label: "TikTok",    icon: "fa-brands fa-tiktok",    color: "#111827", bestTime: "Best engagement is usually 6-9am and 7-11pm.", limit: 2200 },
  youtube:   { label: "YouTube",   icon: "fa-brands fa-youtube",   color: "#FF0000", bestTime: "Best engagement is usually weekends, 2-4pm.", limit: 5000 },
  website:   { label: "Website",   icon: "fa-solid fa-globe",      color: "#0F9A78", bestTime: "", limit: null },
  email:     { label: "Email",     icon: "fa-solid fa-envelope",   color: "#6355C7", bestTime: "Best open rates are usually Tue/Thu mornings.", limit: null },
};
const PLATFORM_TAGS = { ig: "instagram", instagram: "instagram", fb: "facebook", facebook: "facebook", x: "x", twitter: "x", li: "linkedin", linkedin: "linkedin", tiktok: "tiktok", tt: "tiktok", yt: "youtube", youtube: "youtube", web: "website", website: "website", email: "email" };
const PIPELINE_LABEL = { draft: "Draft", review: "In review", approved: "Approved", scheduled: "Scheduled", published: "Published" };
const PIPELINE_COLOR = { draft: "var(--ink-soft)", review: "var(--violet)", approved: "var(--teal)", scheduled: "var(--orange)", published: "var(--pink, var(--orange))" };
const PRIORITY_META = {
  critical: { label: "Critical", color: "var(--orange)", emoji: "🔴" },
  high:     { label: "High",     color: "var(--pink)",   emoji: "🟠" },
  medium:   { label: "Medium",   color: "var(--teal)",   emoji: "🟡" },
  low:      { label: "Low",      color: "var(--ink-soft)", emoji: "🟢" },
};
const ENVIRONMENT_META = {
  dev: { label: "Dev", color: "var(--violet)" },
  staging: { label: "Staging", color: "var(--orange)" },
  production: { label: "Production", color: "var(--pink)" },
};

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function parseQuickAdd(raw) {
  let title = raw;
  let category = "general";
  let platform = "";
  let dueDate = null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // #category tag, anywhere in the text
  const tagMatch = title.match(/#(\w+)/);
  if (tagMatch && CATEGORY_TAGS[tagMatch[1].toLowerCase()]) {
    category = CATEGORY_TAGS[tagMatch[1].toLowerCase()];
    title = title.replace(tagMatch[0], "").trim();
  }

  // @platform tag, e.g. "Post the warehouse tour reel @ig tomorrow"
  const platformMatch = title.match(/@(\w+)/);
  if (platformMatch && PLATFORM_TAGS[platformMatch[1].toLowerCase()]) {
    platform = PLATFORM_TAGS[platformMatch[1].toLowerCase()];
    title = title.replace(platformMatch[0], "").trim();
  }

  const lower = title.toLowerCase();

  if (/\btoday\b/.test(lower)) {
    dueDate = toDateStr(today);
    title = title.replace(/\btoday\b/i, "").trim();
  } else if (/\b(tomorrow|tmr)\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    dueDate = toDateStr(d);
    title = title.replace(/\b(tomorrow|tmr)\b/i, "").trim();
  } else {
    const inDaysMatch = lower.match(/\bin (\d+) days?\b/);
    const weekdayMatch = WEEKDAYS.find((w) => new RegExp(`\\b(next )?${w}\\b`).test(lower));
    if (inDaysMatch) {
      const d = new Date(today); d.setDate(d.getDate() + parseInt(inDaysMatch[1], 10));
      dueDate = toDateStr(d);
      title = title.replace(new RegExp(inDaysMatch[0], "i"), "").trim();
    } else if (weekdayMatch) {
      const targetDow = WEEKDAYS.indexOf(weekdayMatch);
      const isNext = new RegExp(`next ${weekdayMatch}\\b`, "i").test(lower);
      const d = new Date(today);
      let diff = (targetDow - d.getDay() + 7) % 7;
      if (diff === 0 || isNext) diff += 7;
      d.setDate(d.getDate() + diff);
      dueDate = toDateStr(d);
      title = title.replace(new RegExp(`(next )?${weekdayMatch}\\b`, "i"), "").trim();
    }
  }

  title = title.replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
  return { title, category, platform, dueDate };
}

/**
 * Small "2/5" checklist progress bar shown under a card's title, only
 * when the task actually has subtasks. `subtasks` is the raw jsonb array
 * from the row: [{text, done}, ...].
 */
function subtaskProgressHTML(subtasks) {
  if (!Array.isArray(subtasks) || subtasks.length === 0) return "";
  const done = subtasks.filter((s) => s.done).length;
  const pct = Math.round((done / subtasks.length) * 100);
  return `
    <div class="flex items-center gap-2 mt-2">
      <div class="flex-1 h-1 rounded-full bg-[var(--line)] overflow-hidden">
        <div class="h-full rounded-full" style="width:${pct}%; background:var(--teal)"></div>
      </div>
      <span class="font-mono text-[10px] text-ink-soft shrink-0">${done}/${subtasks.length}</span>
    </div>`;
}

function isImageUrl(url) {
  return !!url && /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url);
}

function taskCardHTML(task) {
  const rail = CATEGORY_RAIL[task.category] || "rail-ink";
  const due = formatDueDate(task.due_date);
  const isDone = task.status === "done";
  const overdue = isOverdue(task.due_date, task.status);
  const selected = state.selectedIds.has(task.id);
  const attachmentList = taskAttachmentList(task);
  const coverUrl = attachmentList.find((a) => isImageUrl(a.url))?.url;
  const hasCover = !!coverUrl;
  const reminder = formatReminderAt(task.reminder_at);
  return `
    <div class="ticket ticket-hover group ${rail} ${overdue ? "ticket-overdue" : ""} ${selected ? "ticket-selected" : ""} ${hasCover ? "p-0 overflow-hidden" : "p-3.5"} mb-3 ${state.bulkMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}" data-id="${task.id}">
      ${hasCover ? `<img src="${coverUrl}" alt="" class="w-full h-28 object-cover" loading="lazy">` : ""}
      <div class="flex items-start gap-2.5 ${hasCover ? "p-3.5" : ""}">
        ${
          state.bulkMode
            ? `<span class="ticket-select-box select-box ${selected ? "checked" : ""}" data-id="${task.id}" role="checkbox" aria-checked="${selected}" aria-label="Select task">${selected ? '<i class="fa-solid fa-check text-[9px] text-white"></i>' : ""}</span>`
            : `<button class="check-btn mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors" style="border-color:${isDone ? "var(--teal)" : "var(--ink-soft)"}; background:${isDone ? "var(--teal)" : "transparent"}" aria-label="Mark complete" data-id="${task.id}">
          ${isDone ? '<i class="fa-solid fa-check text-[9px] text-white"></i>' : ""}
        </button>`
        }
        <div class="min-w-0 flex-1 edit-target" data-id="${task.id}" title="Click to edit">
          <div class="flex items-start justify-between gap-2">
            <p class="task-title text-sm leading-snug break-words ${isDone ? "done" : ""}">${escapeHTML(task.title)}</p>
            <i class="fa-solid fa-pencil text-[10px] text-ink-soft opacity-0 group-hover:opacity-60 transition-opacity shrink-0 mt-0.5" aria-hidden="true"></i>
          </div>
          <div class="flex items-center gap-2 mt-2 flex-wrap">
            <span class="stamp" style="color:var(--${task.category === "general" ? "ink" : task.category === "work" ? "orange" : task.category === "personal" ? "violet" : "teal"})">${CATEGORY_LABEL[task.category] || "General"}</span>
            ${task.priority && PRIORITY_META[task.priority] ? `<span class="meta-chip" style="color:${PRIORITY_META[task.priority].color}" title="Priority: ${PRIORITY_META[task.priority].label}">${PRIORITY_META[task.priority].emoji}${PRIORITY_META[task.priority].label}</span>` : ""}
            ${task.environment && ENVIRONMENT_META[task.environment] ? `<span class="stamp" style="color:${ENVIRONMENT_META[task.environment].color}">${ENVIRONMENT_META[task.environment].label}</span>` : ""}
            ${task.pipeline_stage ? `<span class="stamp" style="color:${PIPELINE_COLOR[task.pipeline_stage] || "var(--ink)"}">${PIPELINE_LABEL[task.pipeline_stage] || task.pipeline_stage}</span>` : ""}
            ${task.platform && PLATFORM_META[task.platform] ? `<span class="meta-chip" style="color:${PLATFORM_META[task.platform].color}" title="${PLATFORM_META[task.platform].label}"><i class="${PLATFORM_META[task.platform].icon}"></i>${PLATFORM_META[task.platform].label}</span>` : ""}
            ${due ? `<span class="meta-chip ${overdue ? "text-orange font-semibold" : ""}"><i class="fa-regular fa-clock"></i>${due}${overdue ? " · overdue" : ""}</span>` : ""}
            ${reminder ? `<span class="meta-chip" title="${task.reminder_repeat ? `Repeats ${REMINDER_REPEAT_LABEL[task.reminder_repeat] || ""}` : "Reminder set"}"><i class="fa-regular fa-bell"></i>${reminder}${task.reminder_repeat ? '<i class="fa-solid fa-rotate text-[8px] ml-0.5" aria-hidden="true"></i>' : ""}</span>` : ""}
            ${reminder && window.Timely ? `<span class="meta-chip" title="Lagos time, plus the zone this was set in"><i class="fa-solid fa-earth-americas"></i>${Timely.multiZoneBadgeHtml(task.reminder_at, task.timezone)}</span>` : ""}
            ${task.recurrence ? `<span class="meta-chip" title="Repeats"><i class="fa-solid fa-rotate"></i></span>` : ""}
            ${task.notes ? `<span class="meta-chip" title="Has caption/notes"><i class="fa-solid fa-note-sticky"></i></span>` : ""}
            ${task.published_url ? `<a href="${task.published_url}" target="_blank" rel="noopener" class="meta-chip hover:text-orange transition-colors" title="${escapeHTML(task.performance_note || "View live post")}" onclick="event.stopPropagation()"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ""}
            ${task.reminder_lat != null ? `<span class="meta-chip" title="${task.reminder_geo_trigger === "leave" ? "Reminds when I leave" : "Reminds when I arrive"}${task.reminder_geo_label ? ` · ${escapeHTML(task.reminder_geo_label)}` : ""}"><i class="fa-solid fa-location-dot"></i></span>` : ""}
            ${task.git_pr_url ? `<a href="${task.git_pr_url}" target="_blank" rel="noopener" class="meta-chip hover:text-orange transition-colors" title="${escapeHTML(task.git_branch || "View PR")}" onclick="event.stopPropagation()"><i class="fa-solid fa-code-pull-request"></i>${task.git_branch ? escapeHTML(task.git_branch) : "PR"}</a>` : task.git_branch ? `<span class="meta-chip" title="Git branch"><i class="fa-solid fa-code-branch"></i>${escapeHTML(task.git_branch)}</span>` : ""}
            ${(task.time_tracked_seconds || task.time_tracking_started_at) ? `<span class="meta-chip ${task.time_tracking_started_at ? "text-orange font-semibold" : ""}" title="Time tracked"><i class="fa-solid ${task.time_tracking_started_at ? "fa-stopwatch" : "fa-clock"}"></i>${formatDuration(taskElapsedSeconds(task))}</span>` : ""}
            ${task.blocked_by_id && state.tasks.find((t) => t.id === task.blocked_by_id && t.status !== "done") ? `<span class="meta-chip text-orange" title="Blocked by: ${escapeHTML(state.tasks.find((t) => t.id === task.blocked_by_id)?.title || "")}"><i class="fa-solid fa-hand"></i>Blocked</span>` : ""}
            ${attachmentList.length ? `<span class="meta-chip" title="${escapeHTML(attachmentList.map((a) => a.name).join(", "))}"><i class="fa-solid fa-paperclip"></i>${attachmentList.length > 1 ? attachmentList.length : ""}</span>` : ""}
          </div>
          ${subtaskProgressHTML(task.subtasks)}
        </div>
        ${state.bulkMode ? "" : `<button type="button" class="drag-handle h-8 w-8 -mr-1 flex items-center justify-center rounded-lg text-ink-soft hover:text-orange hover:bg-[var(--paper-2)] shrink-0" aria-label="Hold and drag ticket" title="Hold and drag to move">
          <i class="fa-solid fa-grip-lines text-xs"></i>
        </button><button class="delete-btn text-ink-soft hover:text-orange shrink-0" aria-label="Delete task" data-id="${task.id}">
          <i class="fa-regular fa-trash-can text-xs"></i>
        </button>`}
      </div>
    </div>`;
}

/* ---------------------------------------------------------------------
   SEARCH / FILTER - live, client-side, matches the title or the
   category (either the raw value like "work" or its display label like
   "Work"), case-insensitive. Runs entirely against state.tasks already
   in memory, so there's no extra network round-trip as you type.
--------------------------------------------------------------------- */
function filterTasks(tasks) {
  const q = state.filterQuery.trim().toLowerCase();
  if (!q) return tasks;
  return tasks.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      (CATEGORY_LABEL[t.category] || "").toLowerCase().includes(q)
  );
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Any dropdown-menu positioned with plain CSS (right-0 relative to
// whatever button opened it) can end up partly off-screen the moment
// its trigger isn't near the edge it assumes - exactly what happened
// rotating into landscape, where the toolbar stops wrapping and the
// "..." button sits mid-row instead of at the right edge. Rather than
// rebuilding every one of these as a fully JS-positioned popover (like
// the date picker), this nudges an already-opened one back fully
// on-screen with a transform, which works regardless of what
// positioning context it's using.
function clampDropdownToViewport(menu) {
  if (!menu) return;
  menu.style.transform = "";
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    const EDGE = 8;
    let dx = 0;
    if (rect.left < EDGE) dx = EDGE - rect.left;
    else if (rect.right > window.innerWidth - EDGE) dx = (window.innerWidth - EDGE) - rect.right;
    if (dx) menu.style.transform = `translateX(${dx}px)`;
  });
}
window.addEventListener("resize", () => {
  document.querySelectorAll(".dropdown-menu:not(.hidden)").forEach(clampDropdownToViewport);
});


function emptyStateHTML(column) {
  const board = state.boards.find((b) => b.id === state.currentBoardId);
  const workType = board?.work_type || "general";
  const copy = (TERMINOLOGY[workType] || TERMINOLOGY.general)[column].empty;
  return `
    <div class="empty-state flex flex-col items-center text-center py-8 px-4 text-ink-soft">
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" class="mb-3 opacity-70">
        <rect x="8" y="14" width="40" height="30" rx="2" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/>
        <path d="M8 22h40" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/>
        <circle cx="16" cy="18" r="1.6" fill="currentColor"/>
        <circle cx="22" cy="18" r="1.6" fill="currentColor"/>
      </svg>
      <p class="text-sm font-medium text-ink">${copy[0]}</p>
      <p class="text-xs mt-1 max-w-[180px]">${copy[1]}${column === "todo" ? ' <kbd>Ctrl</kbd>+<kbd>K</kbd> to ' : ''}${copy[2]}</p>
    </div>`;
}

function renderBoard() {
  const visible = filterTasks(state.tasks);
  COLUMNS.forEach((col) => {
    const container = document.getElementById(`col-${col}`);
    const tasksInCol = visible.filter((t) => t.status === col).sort(sortComparator());

    document.getElementById(`count-${col}`).textContent = tasksInCol.length;

    if (tasksInCol.length === 0) {
      container.innerHTML = state.filterQuery.trim()
        ? `<div class="text-center text-xs text-ink-soft py-8">No matches here</div>`
        : emptyStateHTML(col);
    } else {
      container.innerHTML = tasksInCol.map(taskCardHTML).join("");
    }
  });
  renderProgress();
  renderBulkBar();
  updateTabTitle();
  document.getElementById("board")?.classList.toggle("density-compact", state.density === "compact");
  renderGamification();
  checkBoardCleared();
  if (!document.getElementById("calendar-view")?.classList.contains("hidden")) renderCalendar();
  scheduleReminderNotifications();
  updateGeofenceWatch();
}

/** Returns the comparator for the currently chosen sort mode ("manual" keeps the drag order). */
function sortComparator() {
  if (state.sortMode === "due_date") return (a, b) => (a.due_date || "9999-99-99").localeCompare(b.due_date || "9999-99-99");
  if (state.sortMode === "title") return (a, b) => a.title.localeCompare(b.title);
  if (state.sortMode === "category") return (a, b) => a.category.localeCompare(b.category);
  return (a, b) => a.position - b.position;
}

/**
 * Tab title badge: shows the number of not-yet-done tasks in parentheses
 * ahead of the page title, e.g. "(3) Dashboard | Boardly", so you can see
 * what's still pending without the tab being focused.
 */
function updateTabTitle() {
  const pending = state.tasks.filter((t) => t.status !== "done").length;
  document.title = pending > 0 ? `(${pending}) ${BASE_TITLE}` : BASE_TITLE;
}

let hasCelebratedAllDone = false;
const RING_CIRCUMFERENCE = 138.2;
const CATEGORY_COLOR = {
  general: "var(--ink)",
  work: "var(--orange)",
  personal: "var(--violet)",
  urgent: "var(--teal)",
};
const MILESTONES = [10, 25, 50, 100, 250, 500];

function renderProgress() {
  const ring = document.getElementById("progress-ring-fill");
  const label = document.getElementById("progress-ring-label");
  const banner = document.getElementById("all-caught-up");
  if (!ring || !label) return;

  const total = state.tasks.length;
  const done = state.tasks.filter((t) => t.status === "done").length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  ring.style.strokeDashoffset = (RING_CIRCUMFERENCE * (1 - pct / 100)).toFixed(1);
  label.textContent = pct + "%";

  const allDone = total > 0 && done === total;
  if (banner) banner.classList.toggle("hidden", !allDone);
  if (allDone && !hasCelebratedAllDone) {
    hasCelebratedAllDone = true;
    if (banner) celebrate(banner);
  } else if (!allDone) {
    hasCelebratedAllDone = false;
  }

  renderMiniDonut();
  checkMilestone(done);
}

/**
 * Small category breakdown donut on the dashboard itself, so you don't
 * have to leave the board to see how tasks are split - real counts from
 * state.tasks, nothing invented.
 */
function renderMiniDonut() {
  const el = document.getElementById("mini-donut");
  const legend = document.getElementById("mini-donut-legend");
  if (!el || !legend) return;
  const counts = {};
  state.tasks.forEach((t) => { counts[t.category] = (counts[t.category] || 0) + 1; });
  const data = Object.keys(CATEGORY_LABEL).map((cat) => ({
    label: CATEGORY_LABEL[cat],
    value: counts[cat] || 0,
    color: CATEGORY_COLOR[cat],
  }));
  renderDonut(el, data);
  legend.innerHTML = data
    .filter((d) => d.value > 0)
    .map((d) => `<span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-full" style="background:${d.color}"></span>${d.label} <span class="text-ink-soft">${d.value}</span></span>`)
    .join("") || `<span class="text-ink-soft">No tasks yet - add your first one below.</span>`;
}

/**
 * Milestone toast: celebrates the first time your DONE count crosses
 * 10 / 25 / 50 / 100 / 250 / 500. Remembered in localStorage per browser
 * (not the database - this is purely a "have I already shown this"
 * flag, not real task data, so it doesn't need a schema change) so it
 * only fires once, not every time you reload with 12 done tasks.
 */
function checkMilestone(doneCount) {
  const shown = JSON.parse(localStorage.getItem("boardly-milestones") || "[]");
  const next = MILESTONES.find((m) => doneCount >= m && !shown.includes(m));
  if (!next) return;
  shown.push(next);
  localStorage.setItem("boardly-milestones", JSON.stringify(shown));
  toast(`${next} tasks completed - nice streak.`, "success");
  const ring = document.getElementById("progress-ring-fill");
  if (ring) celebrate(ring);
}

function boardSummaryText() {
  const total = state.tasks.length;
  const counts = { todo: 0, inprogress: 0, done: 0 };
  state.tasks.forEach((t) => { counts[t.status] = (counts[t.status] || 0) + 1; });
  const pct = total === 0 ? 0 : Math.round((counts.done / total) * 100);
  const lines = [
    `Boardly summary - ${new Date().toLocaleDateString()}`,
    `${total} total tasks, ${pct}% complete`,
    `To do: ${counts.todo}`,
    `In progress: ${counts.inprogress}`,
    `Done: ${counts.done}`,
  ];
  return lines.join("\n");
}

/* ---------------------------------------------------------------------
   BULK SELECT - turning bulkMode on swaps every card's checkmark button
   for a plain select box (see taskCardHTML) and lets clicking the card
   itself toggle selection instead of opening the edit modal. The bar at
   the top of the board shows the count and the two group actions.
--------------------------------------------------------------------- */
function toggleBulkMode(forceOn) {
  state.bulkMode = forceOn !== undefined ? forceOn : !state.bulkMode;
  if (!state.bulkMode) state.selectedIds.clear();
  document.getElementById("bulk-toggle-btn")?.classList.toggle("active", state.bulkMode);
  renderBoard();
}

function toggleSelect(id) {
  if (state.selectedIds.has(id)) state.selectedIds.delete(id);
  else state.selectedIds.add(id);
  renderBoard();
}

function toggleSelectAllVisible() {
  const visibleIds = filterTasks(state.tasks).map((task) => task.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => state.selectedIds.has(id));
  if (allVisibleSelected) visibleIds.forEach((id) => state.selectedIds.delete(id));
  else visibleIds.forEach((id) => state.selectedIds.add(id));
  renderBoard();
}

function renderBulkBar() {
  const bar = document.getElementById("bulk-bar");
  if (!bar) return;
  const count = state.selectedIds.size;
  bar.classList.toggle("hidden", !state.bulkMode);
  const label = document.getElementById("bulk-count");
  if (label) label.textContent = `${count} selected`;
  const selectAllButton = document.getElementById("bulk-select-all-btn");
  if (selectAllButton) {
    const visibleIds = filterTasks(state.tasks).map((task) => task.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => state.selectedIds.has(id));
    selectAllButton.setAttribute("aria-pressed", String(allVisibleSelected));
    selectAllButton.innerHTML = `<i class="fa-solid fa-${allVisibleSelected ? "square-minus" : "check-double"}"></i><span>${allVisibleSelected ? "Unmark all" : "Mark all"}</span>`;
    selectAllButton.disabled = visibleIds.length === 0;
  }
}

async function bulkMoveSelected(newStatus) {
  const ids = [...state.selectedIds];
  if (!ids.length) return;
  let base = nextPositionFor(newStatus);
  ids.forEach((id, i) => {
    const task = state.tasks.find((t) => t.id === id);
    if (task) { task.status = newStatus; task.position = base + i; }
  });
  state.selectedIds.clear();
  renderBoard();

  const { error } = await supabaseClient
    .from("tasks")
    .upsert(ids.map((id, i) => {
      const task = state.tasks.find((t) => t.id === id);
      return { id, status: newStatus, position: base + i, user_id: state.userId, title: task.title, category: task.category, due_date: task.due_date };
    }));

  if (error) {
    toast("Couldn't move some tasks: " + error.message, "error");
    await loadTasks();
  } else {
    toast(`${ids.length} task${ids.length === 1 ? "" : "s"} moved`, "ok");
  }
}

async function bulkDeleteSelected() {
  const ids = [...state.selectedIds];
  if (!ids.length) return;
  const confirmed = await showConfirmModal(
    `Delete ${ids.length} selected task${ids.length === 1 ? "" : "s"}? This can't be undone.`,
    { confirmLabel: "Delete tickets" }
  );
  if (!confirmed) return;

  const backup = state.tasks;
  state.tasks = state.tasks.filter((t) => !ids.includes(t.id));
  state.selectedIds.clear();
  renderBoard();

  const { error } = await supabaseClient.from("tasks").delete().in("id", ids);
  if (error) {
    state.tasks = backup;
    renderBoard();
    toast("Couldn't delete tasks: " + error.message, "error");
  } else {
    toast(`${ids.length} task${ids.length === 1 ? "" : "s"} deleted`, "ok");
  }
}

/** Deletes every ticket currently in one column (To do / In progress / Done). */
async function clearColumn(status) {
  const ids = state.tasks.filter((t) => t.status === status).map((t) => t.id);
  if (!ids.length) { toast("That column is already empty", "error"); return; }
  const label = COLUMN_LABEL[status] || status;
  const confirmed = await showConfirmModal(
    `Delete all ${ids.length} ticket${ids.length === 1 ? "" : "s"} in "${label}"? This can't be undone.`,
    { title: "Clear this column?", confirmLabel: "Clear column" }
  );
  if (!confirmed) return;

  const backup = state.tasks;
  state.tasks = state.tasks.filter((t) => t.status !== status);
  renderBoard();

  const { error } = await supabaseClient.from("tasks").delete().in("id", ids);
  if (error) {
    state.tasks = backup;
    renderBoard();
    toast("Couldn't clear the column: " + error.message, "error");
  } else {
    toast(`${label} cleared`, "ok");
  }
}

function renderSkeleton() {
  const heights = [64, 84, 70];
  COLUMNS.forEach((col) => {
    const container = document.getElementById(`col-${col}`);
    container.innerHTML = heights
      .map((h) => `<div class="skeleton mb-3" style="height:${h}px"></div>`)
      .join("");
  });
}

// ---------------------------------------------------------------------------
// 2b. BOARDS (multi-board workspaces)
// ---------------------------------------------------------------------------

async function loadBoards() {
  const { data, error } = await supabaseClient.from("boards").select("*").order("created_at", { ascending: true });

  if (error) {
    // supabase/schema_v2.sql hasn't been run yet - the board switcher and
    // anything that depends on the boards table just stays switched off.
    state.v2Ready = false;
    state.boards = [];
    document.getElementById("board-switcher-menu")?.querySelectorAll("button").forEach((b) => (b.disabled = false));
    return;
  }
  state.v2Ready = true;

  if (data.length === 0) {
    // schema is ready but this account has no boards yet (a brand-new
    // signup after the migration) - give it one automatically. If they
    // just came from signup.html's "what are you organizing?" step, use
    // that choice for the board's name and work_type; otherwise (an
    // older account, or the key was never set) fall back to exactly what
    // this always did before: a plain "My board" on General.
    const signupWorkType = localStorage.getItem("boardly-signup-work-type");
    localStorage.removeItem("boardly-signup-work-type");
    const workType = signupWorkType && TERMINOLOGY[signupWorkType] ? signupWorkType : "general";
    const boardName = workType === "general" ? "My board" : `My ${TERMINOLOGY[workType].label} board`;
    const insertPayload = { name: boardName, user_id: state.userId };
    if (workType !== "general") insertPayload.work_type = workType; // no-op if schema_v12/13 haven't been run - falls back to the column default
    const { data: created } = await supabaseClient.from("boards").insert(insertPayload).select().single();
    if (created) data.push(created);
  }

  state.boards = data;
  const saved = localStorage.getItem(CURRENT_BOARD_KEY);
  state.currentBoardId = data.find((b) => b.id === saved)?.id || data[0]?.id || null;
  renderBoardSwitcher();
  applyTerminology(state.boards.find((b) => b.id === state.currentBoardId)?.work_type || "general");
  renderWorkTypeMenu();
}

function renderBoardSwitcher() {
  const board = state.boards.find((b) => b.id === state.currentBoardId);
  const label = document.getElementById("board-switcher-label");
  if (label) label.textContent = board ? board.name : "Your tasks";

  const list = document.getElementById("board-switcher-list");
  if (list) {
    list.innerHTML = state.boards
      .map(
        (b) => `
      <button data-switch-board="${b.id}" class="menu-item ${b.id === state.currentBoardId ? "menu-item-accent font-medium" : ""}">
        <i class="fa-solid ${(TERMINOLOGY[b.work_type] || TERMINOLOGY.general).icon} w-4 ${b.id === state.currentBoardId ? "" : "text-ink-soft"}"></i>${escapeHTML(b.name)}
      </button>`
      )
      .join("");
  }

  const shareLabel = document.getElementById("board-share-label");
  if (shareLabel) shareLabel.textContent = board?.is_public ? "Copy share link" : "Make public / share";
  document.getElementById("board-unshare-btn")?.classList.toggle("hidden", !board?.is_public);
}

async function switchBoard(boardId) {
  state.currentBoardId = boardId;
  localStorage.setItem(CURRENT_BOARD_KEY, boardId);
  renderBoardSwitcher();
  applyTerminology(state.boards.find((b) => b.id === boardId)?.work_type || "general");
  renderWorkTypeMenu();
  document.getElementById("board-switcher-menu")?.classList.add("hidden");
  initRealtimeSync();
  applyBoardBackground();
  await loadTasks();
}

/** Shows the styled prompt modal, returns the entered text or null if cancelled. */
/** Shows the styled confirm modal, resolves true/false in place of the native confirm(). */
function showConfirmModal(body, { title = "Are you sure?", confirmLabel = "Yes, do it" } = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById("confirm-modal");
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-body").textContent = body;
    document.getElementById("confirm-yes-btn").textContent = confirmLabel;
    modal.classList.remove("hidden");

    const cleanup = (result) => {
      modal.classList.add("hidden");
      yesBtn.removeEventListener("click", onYes);
      closeButtons.forEach((b) => b.removeEventListener("click", onCancel));
      resolve(result);
    };
    const yesBtn = document.getElementById("confirm-yes-btn");
    const onYes = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const closeButtons = [...document.querySelectorAll("[data-close-confirm]")];

    yesBtn.addEventListener("click", onYes);
    closeButtons.forEach((b) => b.addEventListener("click", onCancel));
  });
}

function showPromptModal(title, defaultValue) {
  return new Promise((resolve) => {
    const modal = document.getElementById("prompt-modal");
    const form = document.getElementById("prompt-form");
    const input = document.getElementById("prompt-input");
    document.getElementById("prompt-title").textContent = title;
    input.value = defaultValue || "";
    modal.classList.remove("hidden");
    input.focus();
    input.select();

    const cleanup = (result) => {
      modal.classList.add("hidden");
      form.removeEventListener("submit", onSubmit);
      closeButtons.forEach((b) => b.removeEventListener("click", onCancel));
      resolve(result);
    };
    const onSubmit = (e) => { e.preventDefault(); cleanup(input.value.trim() || null); };
    const onCancel = () => cleanup(null);
    const closeButtons = [...document.querySelectorAll("[data-close-prompt]")];

    form.addEventListener("submit", onSubmit);
    closeButtons.forEach((b) => b.addEventListener("click", onCancel));
  });
}

async function createBoard() {
  if (!state.v2Ready) {
    toast("Run the database migration first, see FEATURES_V2_SETUP.md", "error");
    return;
  }
  const name = await showPromptModal("Name this board", "New board");
  if (!name) return;
  const { data, error } = await supabaseClient
    .from("boards")
    .insert({ name, user_id: state.userId })
    .select()
    .single();
  if (error) { toast("Couldn't create board: " + error.message, "error"); return; }
  state.boards.push(data);
  await switchBoard(data.id);
  toast("Board created", "ok");
}

// ---------------------------------------------------------------------------
// WORK TYPE TERMINOLOGY (multi-vertical)
// Each board has a work_type (general | logistics | teaching | freelance),
// stored in supabase/schema_v12_work_type.sql. This ONLY changes what the
// three columns are called and which icon/color they wear - the underlying
// task.status values stay exactly 'todo' | 'inprogress' | 'done' forever.
// That means drag-and-drop, filtering, counts, search, and every existing
// query keep working completely untouched: this is a display layer on top
// of the real status system, not a new one. All four verticals get equal
// treatment - none is a "default" the others are variations of.
// ---------------------------------------------------------------------------
const TERMINOLOGY = {
  general: {
    label: "General",
    icon: "fa-list-check",
    todo:       { label: "To do",        icon: "fa-inbox",         badge: "orange", empty: ["No tickets on the desk", "Press", "add your first one"] },
    inprogress: { label: "In progress",  icon: "fa-bolt",          badge: "violet", empty: ["Nothing in motion", "Drag a ticket here once you start it", ""] },
    done:       { label: "Done",         icon: "fa-circle-check",  badge: "teal",   empty: ["Nothing filed yet", "Finished tickets land in this drawer", ""] },
  },
  logistics: {
    label: "Logistics",
    icon: "fa-truck-fast",
    todo:       { label: "Pickup Scheduled", icon: "fa-box",           badge: "orange", empty: ["No pickups scheduled", "Press", "add your first one"] },
    inprogress: { label: "In Transit",       icon: "fa-truck-fast",    badge: "violet", empty: ["Nothing on the road", "Drag a delivery here once it's picked up", ""] },
    done:       { label: "Delivered",        icon: "fa-circle-check", badge: "teal",   empty: ["No deliveries yet", "Completed drop-offs land in this drawer", ""] },
  },
  teaching: {
    label: "Teaching",
    icon: "fa-chalkboard-user",
    todo:       { label: "Planned",   icon: "fa-book",             badge: "orange", empty: ["No lessons planned", "Press", "add your first one"] },
    inprogress: { label: "Teaching",  icon: "fa-chalkboard-user",  badge: "violet", empty: ["No class in session", "Drag a lesson here once you start it", ""] },
    done:       { label: "Graded",    icon: "fa-circle-check",     badge: "teal",   empty: ["Nothing graded yet", "Finished lessons land in this drawer", ""] },
  },
  freelance: {
    label: "Freelance",
    icon: "fa-briefcase",
    todo:       { label: "To do",       icon: "fa-inbox",          badge: "orange", empty: ["No work queued", "Press", "add your first one"] },
    inprogress: { label: "In progress", icon: "fa-bolt",           badge: "violet", empty: ["Nothing in progress", "Drag a task here once you start it", ""] },
    done:       { label: "Delivered",   icon: "fa-circle-check",   badge: "teal",   empty: ["Nothing delivered yet", "Finished work lands in this drawer", ""] },
  },
  personal: {
    label: "Personal",
    icon: "fa-user",
    todo:       { label: "On my list",  icon: "fa-list-check",     badge: "orange", empty: ["Your list is clear", "Press", "add your first one"] },
    inprogress: { label: "Doing today", icon: "fa-bolt",           badge: "violet", empty: ["Nothing on the go", "Drag something here once you start it", ""] },
    done:       { label: "Done",        icon: "fa-circle-check",   badge: "teal",   empty: ["Nothing done yet today", "Finished tasks land in this drawer", ""] },
  },
  field_service: {
    label: "Field Service",
    icon: "fa-screwdriver-wrench",
    todo:       { label: "Job Scheduled", icon: "fa-calendar-check", badge: "orange", empty: ["No jobs scheduled", "Press", "add your first one"] },
    inprogress: { label: "On Site",       icon: "fa-screwdriver-wrench", badge: "violet", empty: ["No job in progress", "Drag a job here once you're on site", ""] },
    done:       { label: "Completed",     icon: "fa-circle-check",  badge: "teal",   empty: ["No jobs completed yet", "Finished jobs land in this drawer", ""] },
  },
  healthcare: {
    label: "Healthcare / Care",
    icon: "fa-briefcase-medical",
    todo:       { label: "Visit Scheduled", icon: "fa-calendar-check", badge: "orange", empty: ["No visits scheduled", "Press", "add your first one"] },
    inprogress: { label: "In Progress",     icon: "fa-notes-medical",  badge: "violet", empty: ["No visit in progress", "Drag a visit here once you arrive", ""] },
    done:       { label: "Completed",       icon: "fa-circle-check",  badge: "teal",   empty: ["No visits logged yet", "Completed visits land in this drawer", ""] },
  },
};

/** Relabels the three column headers (icon + text) to match a board's work_type. */
function applyTerminology(workType) {
  const t = TERMINOLOGY[workType] || TERMINOLOGY.general;
  ["todo", "inprogress", "done"].forEach((key) => {
    const label = document.getElementById(`label-${key}`);
    const icon = document.getElementById(`icon-${key}`);
    const badge = document.getElementById(`icon-badge-${key}`);
    if (label) label.textContent = t[key].label;
    if (icon) icon.className = `fa-solid ${t[key].icon}`;
    if (badge) badge.className = `icon-badge icon-badge-${t[key].badge}`;
  });
}

async function setBoardWorkType(workType) {
  const board = state.boards.find((b) => b.id === state.currentBoardId);
  if (!board || !state.v2Ready) return;
  board.work_type = workType; // optimistic
  applyTerminology(workType);
  renderWorkTypeMenu();
  renderBoard(); // refreshes any empty-column copy to match the new vertical
  const { error } = await supabaseClient.from("boards").update({ work_type: workType }).eq("id", board.id);
  if (error) toast("Couldn't save work type: " + error.message, "error");
  else toast(`Board set to ${TERMINOLOGY[workType].label}`, "ok");
}

function renderWorkTypeMenu() {
  const board = state.boards.find((b) => b.id === state.currentBoardId);
  const current = board?.work_type || "general";
  const list = document.getElementById("work-type-list");
  if (!list) return;
  list.innerHTML = Object.entries(TERMINOLOGY)
    .map(
      ([key, t]) => `
      <button type="button" data-set-work-type="${key}" class="menu-item ${key === current ? "menu-item-accent" : ""}">
        <i class="fa-solid ${t.icon} w-4"></i>${t.label}
      </button>`
    )
    .join("");
  const currentLabel = document.getElementById("work-type-current-label");
  if (currentLabel) currentLabel.textContent = TERMINOLOGY[current].label;
}

// ---------------------------------------------------------------------------
// VERTICAL FIELDS - the extra "Details" fields shown per work_type.
// Stored in tasks.metadata (schema_v14_vertical_fields.sql). Each field:
//   key   - property name inside metadata jsonb
//   label - shown above the input
//   type  - "text" | "textarea"
//   icon  - fa-solid icon shown in the field's placeholder position
// 'general' intentionally has no fields - a generic board shouldn't grow
// a "Details" section with nothing meaningful to put in it.
// ---------------------------------------------------------------------------
const VERTICAL_FIELDS = {
  general: [],
  logistics: [
    { key: "customer_name", label: "Customer", type: "text", icon: "fa-user" },
    { key: "delivery_address", label: "Delivery address", type: "text", icon: "fa-location-dot" },
    { key: "driver", label: "Driver / rider", type: "text", icon: "fa-id-badge" },
  ],
  teaching: [
    { key: "class_name", label: "Class", type: "text", icon: "fa-chalkboard" },
    { key: "student_name", label: "Student(s)", type: "text", icon: "fa-user" },
    { key: "meeting_link", label: "Meeting link", type: "text", icon: "fa-video" },
  ],
  freelance: [
    { key: "client_name", label: "Client", type: "text", icon: "fa-user" },
    { key: "project_name", label: "Project", type: "text", icon: "fa-folder" },
  ],
  personal: [
    { key: "location", label: "Where", type: "text", icon: "fa-location-dot" },
  ],
  field_service: [
    { key: "customer_name", label: "Customer", type: "text", icon: "fa-user" },
    { key: "job_address", label: "Job address", type: "text", icon: "fa-location-dot" },
    { key: "job_notes", label: "Job notes", type: "textarea", icon: "fa-note-sticky" },
  ],
  healthcare: [
    { key: "patient_name", label: "Patient", type: "text", icon: "fa-user" },
    { key: "visit_address", label: "Visit address", type: "text", icon: "fa-location-dot" },
    { key: "visit_notes", label: "Visit notes", type: "textarea", icon: "fa-notes-medical" },
  ],
};

/** Renders the vertical "Details" section for the currently-open task's board. */
function renderVerticalFields(task) {
  const wrap = document.getElementById("edit-vertical-fields");
  if (!wrap) return;
  const board = state.boards.find((b) => b.id === state.currentBoardId);
  const workType = board?.work_type || "general";
  const fields = state.verticalReady ? VERTICAL_FIELDS[workType] || [] : [];
  if (!fields.length) { wrap.classList.add("hidden"); wrap.innerHTML = ""; return; }
  wrap.classList.remove("hidden");
  const metadata = task?.metadata || {};
  wrap.innerHTML = `
    <p class="form-label mt-4 mb-1.5">${TERMINOLOGY[workType].label} details</p>
    <div class="space-y-2">
      ${fields.map((f) => `
        <div>
          <label class="form-label" for="vf-${f.key}"><i class="fa-solid ${f.icon} w-3.5 text-ink-faint"></i> ${f.label}</label>
          ${f.type === "textarea"
            ? `<textarea id="vf-${f.key}" data-vf-key="${f.key}" rows="2" class="input input-sm resize-none">${escapeHTML(metadata[f.key] || "")}</textarea>`
            : `<input id="vf-${f.key}" data-vf-key="${f.key}" type="text" class="input input-sm" value="${escapeHTML(metadata[f.key] || "")}">`}
        </div>`).join("")}
    </div>`;
}

/** Reads whatever's currently in the vertical-fields section back into a metadata object for saving. */
function collectVerticalFields() {
  const wrap = document.getElementById("edit-vertical-fields");
  if (!wrap) return {};
  const metadata = {};
  wrap.querySelectorAll("[data-vf-key]").forEach((el) => {
    if (el.value.trim()) metadata[el.dataset.vfKey] = el.value.trim();
  });
  return metadata;
}



const NEW_BOARD_TEMPLATES = {
  "content-batch": {
    name: "Weekly content batch",
    tasks: [
      { title: "Pick this week's themes/topics", category: "work" },
      { title: "Shoot/source photos & video", category: "work" },
      { title: "Write captions for the week", category: "work", platform: "instagram" },
      { title: "Schedule Instagram posts", category: "work", platform: "instagram" },
      { title: "Schedule LinkedIn posts", category: "work", platform: "linkedin" },
      { title: "Schedule Facebook posts", category: "work", platform: "facebook" },
      { title: "Review last week's performance", category: "work" },
    ],
  },
  "product-launch": {
    name: "Product/service launch",
    tasks: [
      { title: "Draft launch announcement copy", category: "urgent" },
      { title: "Design launch graphics/hero image", category: "work" },
      { title: "Teaser post - 1 week out", category: "work", platform: "instagram" },
      { title: "Launch day post", category: "urgent", platform: "instagram" },
      { title: "Launch day post", category: "urgent", platform: "linkedin" },
      { title: "Update website with launch page", category: "urgent", platform: "website" },
      { title: "Send launch email", category: "work", platform: "email" },
      { title: "Follow-up recap post", category: "work" },
    ],
  },
  "logistics-update": {
    name: "Logistics update series",
    tasks: [
      { title: "Confirm the update details with ops team", category: "work" },
      { title: "Draft customer-facing explainer copy", category: "work" },
      { title: "Post service update", category: "urgent", platform: "website" },
      { title: "Post service update", category: "urgent", platform: "linkedin" },
      { title: "Send customer notification email", category: "urgent", platform: "email" },
      { title: "Monitor comments/questions for 48h", category: "work" },
    ],
  },
  // ---- real vertical operations templates, one per work type, equal
  // weight to the three content-marketing templates above (which are
  // themselves just 'general' boards for the content/social workflow
  // Boardly started as) ----
  "logistics-ops": {
    name: "Logistics operations",
    workType: "logistics",
    tasks: [
      { title: "Confirm pickup address and time with customer", category: "work" },
      { title: "Assign driver/rider", category: "work" },
      { title: "Collect proof of delivery on drop-off", category: "urgent" },
      { title: "Follow up on a delayed delivery", category: "urgent" },
      { title: "Log a delivery issue for review", category: "work" },
    ],
  },
  "teaching-week": {
    name: "This week's teaching",
    workType: "teaching",
    tasks: [
      { title: "Prepare Monday's lesson plan", category: "work" },
      { title: "Grade last week's homework", category: "work" },
      { title: "Send meeting link to students", category: "work" },
      { title: "Follow up with a student who's behind", category: "urgent" },
      { title: "Update the class progress tracker", category: "work" },
    ],
  },
  "freelance-project": {
    name: "New client project",
    workType: "freelance",
    tasks: [
      { title: "Send project kickoff/scope confirmation", category: "urgent" },
      { title: "Draft first deliverable", category: "work" },
      { title: "Send for client review", category: "work" },
      { title: "Revise based on feedback", category: "work" },
      { title: "Send invoice on final delivery", category: "urgent" },
    ],
  },
  "personal-life": {
    name: "Personal errands",
    workType: "personal",
    tasks: [
      { title: "Pay this month's bills", category: "urgent" },
      { title: "Pick up prescription", category: "work" },
      { title: "Call to book that appointment", category: "work" },
      { title: "Weekend grocery run", category: "general" },
    ],
  },
  "field-service-jobs": {
    name: "Field service jobs",
    workType: "field_service",
    tasks: [
      { title: "Confirm job address and access details with customer", category: "work" },
      { title: "Pack tools/parts needed for the job", category: "work" },
      { title: "Take before/after photos on site", category: "work" },
      { title: "Send the customer their invoice", category: "urgent" },
      { title: "Follow up on an unpaid invoice", category: "urgent" },
    ],
  },
  "healthcare-visits": {
    name: "Home visits & care",
    workType: "healthcare",
    tasks: [
      { title: "Confirm today's visit schedule", category: "work" },
      { title: "Check medication supply before visiting", category: "urgent" },
      { title: "Log vitals/notes after each visit", category: "work" },
      { title: "Follow up on a missed appointment", category: "urgent" },
    ],
  },
};

async function createBoardFromTemplate(key) {
  const template = NEW_BOARD_TEMPLATES[key];
  if (!template) return;
  if (!state.v2Ready) {
    toast("Run the database migration first, see FEATURES_V2_SETUP.md", "error");
    return;
  }
  const name = await showPromptModal("Name this board", template.name);
  if (!name) return;
  const insertPayload = { name, user_id: state.userId };
  if (template.workType) insertPayload.work_type = template.workType; // no-op if schema_v12 hasn't run yet - falls back to default 'general'
  const { data: board, error } = await supabaseClient
    .from("boards")
    .insert(insertPayload)
    .select()
    .single();
  if (error) { toast("Couldn't create board: " + error.message, "error"); return; }
  state.boards.push(board);
  await switchBoard(board.id);

  let position = 0;
  for (const t of template.tasks) {
    const payload = { title: t.title, category: t.category || "general", status: "todo", position: position++, user_id: state.userId, board_id: board.id };
    if (t.platform && state.socialReady) payload.platform = t.platform;
    const { data: inserted, error: taskError } = await supabaseClient.from("tasks").insert(payload).select().single();
    if (!taskError && inserted) state.tasks.push(inserted);
  }
  renderBoard();
  toast(`"${name}" created with ${template.tasks.length} starter tickets`, "ok");
}

async function renameBoard() {
  if (!state.v2Ready) {
    toast("Run the database migration first, see FEATURES_V2_SETUP.md", "error");
    return;
  }
  const board = state.boards.find((b) => b.id === state.currentBoardId);
  if (!board) { toast("No board selected", "error"); return; }
  const name = await showPromptModal("Rename this board", board.name);
  if (!name || name === board.name) return;
  board.name = name;
  renderBoardSwitcher();
  const { error } = await supabaseClient.from("boards").update({ name }).eq("id", board.id);
  if (error) toast("Couldn't rename board: " + error.message, "error");
  else toast("Board renamed", "ok");
}

async function toggleBoardShare() {
  if (!state.v2Ready) {
    toast("Run the database migration first, see FEATURES_V2_SETUP.md", "error");
    return;
  }
  const board = state.boards.find((b) => b.id === state.currentBoardId);
  if (!board) { toast("No board selected", "error"); return; }

  if (board.is_public && board.share_token) {
    const url = `${location.origin}${location.pathname.replace("dashboard.html", "")}share.html?b=${board.share_token}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    toast("Share link copied", "ok");
    return;
  }

  const token = crypto.randomUUID();
  const { error } = await supabaseClient.from("boards").update({ is_public: true, share_token: token }).eq("id", board.id);
  if (error) { toast("Couldn't enable sharing: " + error.message, "error"); return; }
  board.is_public = true;
  board.share_token = token;
  renderBoardSwitcher();
  const url = `${location.origin}${location.pathname.replace("dashboard.html", "")}share.html?b=${token}`;
  await navigator.clipboard.writeText(url).catch(() => {});
  toast("Board is now public, link copied", "ok");
}

async function makeBoardPrivate() {
  const board = state.boards.find((b) => b.id === state.currentBoardId);
  if (!board) return;
  board.is_public = false;
  renderBoardSwitcher();
  const { error } = await supabaseClient.from("boards").update({ is_public: false }).eq("id", board.id);
  if (error) {
    board.is_public = true;
    renderBoardSwitcher();
    toast("Couldn't make it private: " + error.message, "error");
  } else {
    toast("Board is private again", "ok");
  }
}

async function deleteBoard() {
  if (!state.v2Ready) {
    toast("Run the database migration first, see FEATURES_V2_SETUP.md", "error");
    return;
  }
  const board = state.boards.find((b) => b.id === state.currentBoardId);
  if (!board) return;
  if (state.boards.length <= 1) {
    toast("You need at least one board, create another before deleting this one", "error");
    return;
  }
  const confirmed = await showConfirmModal(
    `Delete "${board.name}" and every ticket on it? This can't be undone.`,
    { title: "Delete this board?", confirmLabel: "Delete board" }
  );
  if (!confirmed) return;

  const { error } = await supabaseClient.from("boards").delete().eq("id", board.id);
  if (error) { toast("Couldn't delete board: " + error.message, "error"); return; }

  state.boards = state.boards.filter((b) => b.id !== board.id);
  await switchBoard(state.boards[0].id);
  toast("Board deleted", "ok");
}

// ---------------------------------------------------------------------------
// 3. DATA (Supabase)
// ---------------------------------------------------------------------------

async function loadTasks() {
  renderSkeleton();
  let query = supabaseClient.from("tasks").select("*").order("status", { ascending: true }).order("position", { ascending: true });
  if (state.currentBoardId) query = query.eq("board_id", state.currentBoardId);

  const { data, error } = await query;

  if (error) {
    toast("Couldn't load tasks: " + error.message, "error");
    COLUMNS.forEach((col) => (document.getElementById(`col-${col}`).innerHTML = emptyStateHTML(col)));
    return;
  }

  state.tasks = data;
  const { error: reminderColumnError } = await supabaseClient.from("tasks").select("reminder_at").limit(1);
  state.remindersReady = !reminderColumnError;
  const { error: reminderRepeatColumnError } = await supabaseClient.from("tasks").select("reminder_repeat").limit(1);
  state.reminderRepeatReady = !reminderRepeatColumnError;
  const { error: socialColumnError } = await supabaseClient.from("tasks").select("platform, notes").limit(1);
  state.socialReady = !socialColumnError;
  const { error: proColumnError } = await supabaseClient.from("tasks").select("pipeline_stage, published_url, reminder_lat").limit(1);
  state.proReady = !proColumnError;
  const { error: attachmentsColumnError } = await supabaseClient.from("tasks").select("attachments").limit(1);
  state.attachmentsReady = !attachmentsColumnError;
  const { error: devColumnError } = await supabaseClient.from("tasks").select("priority, time_tracked_seconds, blocked_by_id").limit(1);
  state.devReady = !devColumnError;
  const { error: metadataColumnError } = await supabaseClient.from("tasks").select("metadata").limit(1);
  state.verticalReady = !metadataColumnError;
  state.loaded = true;
  renderBoard();
  checkDueSoonAndNotify();
  scheduleReminderNotifications();
}

// ---------------------------------------------------------------------------
// 3b. OFFLINE QUEUE
//    When there's no connection, mutations are still applied to
//    state.tasks right away (so the app keeps working), but the actual
//    Supabase call is stashed in localStorage instead of being sent.
//    The moment the browser fires "online", the queue replays in order.
// ---------------------------------------------------------------------------

function readQueue() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]"); }
  catch { return []; }
}
function writeQueue(queue) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}
function queueMutation(entry) {
  const queue = readQueue();
  queue.push(entry);
  writeQueue(queue);
  updateOfflineBadge();
}

/**
 * Runs a Supabase call immediately if online; if offline, queues it for
 * later and returns {error: null} so the caller's optimistic UI update
 * is treated as already successful.
 * @param {object} entry - {type: "insert"|"update"|"delete", table, payload}
 * @param {Function} run - () => Promise<{data, error}>, the real Supabase call
 */
async function runOrQueue(entry, run) {
  if (!navigator.onLine) {
    queueMutation(entry);
    return { data: null, error: null };
  }
  return run();
}

async function flushOfflineQueue() {
  const queue = readQueue();
  if (!queue.length) return;
  const remaining = [...queue];

  while (remaining.length) {
    const entry = remaining[0];
    let error = null;
    if (entry.type === "insert") {
      ({ error } = await supabaseClient.from(entry.table).insert(entry.payload));
    } else if (entry.type === "update") {
      ({ error } = await supabaseClient.from(entry.table).update(entry.payload).eq("id", entry.id));
    } else if (entry.type === "delete") {
      ({ error } = await supabaseClient.from(entry.table).delete().eq("id", entry.id));
    }
    if (error) break; // leave it and the rest queued, try again next time
    remaining.shift();
  }

  writeQueue(remaining);
  updateOfflineBadge();
  if (remaining.length < queue.length) {
    toast("Synced changes made while offline", "ok");
    await loadTasks();
  }
}

function updateOfflineBadge() {
  const badge = document.getElementById("offline-badge");
  if (!badge) return;
  const pending = readQueue().length;
  badge.classList.toggle("hidden", navigator.onLine && pending === 0);
  if (!navigator.onLine) {
    badge.innerHTML = `<i class="fa-solid fa-cloud-slash mr-1"></i>Offline, saving locally`;
  } else if (pending) {
    badge.innerHTML = `<i class="fa-solid fa-rotate mr-1"></i>Syncing ${pending} change${pending === 1 ? "" : "s"}…`;
  }
}

function initOfflineHandling() {
  updateOfflineBadge();
  window.addEventListener("online", () => { updateOfflineBadge(); flushOfflineQueue(); });
  window.addEventListener("offline", updateOfflineBadge);
}

// ---------------------------------------------------------------------------
// 3c. REALTIME SYNC
//    Subscribes to live changes on the current board's tasks, so a
//    second tab or a teammate's edit shows up here without a reload.
//    Guards against re-applying our own optimistic changes by checking
//    whether the row already matches what we have.
// ---------------------------------------------------------------------------

function initRealtimeSync() {
  if (state.realtimeChannel) {
    supabaseClient.removeChannel(state.realtimeChannel);
    state.realtimeChannel = null;
  }
  if (!state.currentBoardId) return;

  state.realtimeChannel = supabaseClient
    .channel(`board-${state.currentBoardId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tasks", filter: `board_id=eq.${state.currentBoardId}` },
      (payload) => {
        if (payload.eventType === "INSERT") {
          if (!state.tasks.some((t) => t.id === payload.new.id)) {
            state.tasks.push(payload.new);
            renderBoard();
          }
        } else if (payload.eventType === "UPDATE") {
          const idx = state.tasks.findIndex((t) => t.id === payload.new.id);
          if (idx !== -1 && JSON.stringify(state.tasks[idx]) !== JSON.stringify(payload.new)) {
            state.tasks[idx] = payload.new;
            renderBoard();
          }
        } else if (payload.eventType === "DELETE") {
          if (state.tasks.some((t) => t.id === payload.old.id)) {
            state.tasks = state.tasks.filter((t) => t.id !== payload.old.id);
            renderBoard();
          }
        }
      }
    )
    .on("broadcast", { event: "cursor" }, ({ payload }) => renderRemoteCursor(payload))
    .subscribe();
}

// ---------------------------------------------------------------------------
// 4. OPTIMISTIC ACTIONS
//    The pattern in every function below is the same:
//    a) change `state.tasks` and re-render IMMEDIATELY (feels instant)
//    b) send the real request to Supabase in the background
//    c) if it fails, roll the change back and show a toast
// ---------------------------------------------------------------------------

function nextPositionFor(status) {
  const inCol = state.tasks.filter((t) => t.status === status);
  return inCol.length ? Math.max(...inCol.map((t) => t.position)) + 1 : 0;
}

async function addTask(title, category, dueDate, platform) {
  const tempId = "temp-" + Date.now();
  const optimisticTask = {
    id: tempId,
    title,
    category: category || "general",
    status: "todo",
    due_date: dueDate || null,
    platform: platform || null,
    position: nextPositionFor("todo"),
    user_id: state.userId,
    board_id: state.currentBoardId,
    subtasks: [],
    recurrence: null,
  };

  state.tasks.push(optimisticTask);
  renderBoard();
  document.querySelector(`[data-id="${tempId}"]`)?.classList.add("ticket-pop-in");

  const payload = {
    title,
    category: category || "general",
    status: "todo",
    due_date: dueDate || null,
    position: optimisticTask.position,
    user_id: state.userId,
  };
  if (state.currentBoardId) payload.board_id = state.currentBoardId;
  if (platform && state.socialReady) payload.platform = platform;

  const { data, error } = await runOrQueue({ type: "insert", table: "tasks", payload }, () =>
    supabaseClient.from("tasks").insert(payload).select().single()
  );

  if (error) {
    state.tasks = state.tasks.filter((t) => t.id !== tempId);
    renderBoard();
    toast("Couldn't add task: " + error.message, "error");
    return;
  }

  // swap the temporary row for the real one Supabase generated (skipped
  // while offline - the temp row stays until the queue flushes and a
  // fresh loadTasks() replaces it with the real thing)
  if (data) {
    const idx = state.tasks.findIndex((t) => t.id === tempId);
    if (idx !== -1) state.tasks[idx] = data;
    renderBoard();
  }
  return data; // existing callers already ignore this; the AI-action loop below uses it
}

async function toggleComplete(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  const prevStatus = task.status;
  const prevPosition = task.position;
  const newStatus = task.status === "done" ? "todo" : "done";

  if (newStatus === "done") {
    const cardEl = document.querySelector(`[data-id="${id}"]`);
    if (cardEl) celebrate(cardEl);
    if (task.recurrence) spawnNextRecurrence(task);
    playSound("complete");
    logCompletion();
  }

  task.status = newStatus;
  task.position = nextPositionFor(newStatus);
  renderBoard();
  pushHistory(() => {
    task.status = prevStatus;
    task.position = prevPosition;
    renderBoard();
    supabaseClient.from("tasks").update({ status: prevStatus, position: prevPosition }).eq("id", id);
  });

  const payload = { status: newStatus, position: task.position };
  const { error } = await runOrQueue({ type: "update", table: "tasks", id, payload }, () =>
    supabaseClient.from("tasks").update(payload).eq("id", id)
  );

  if (error) {
    task.status = prevStatus;
    renderBoard();
    toast("Couldn't update task: " + error.message, "error");
  }
}

/**
 * A recurring task that just got checked off spawns its next occurrence
 * right away, with a due date pushed forward by the recurrence rule.
 * "Every weekday" skips straight over a Saturday/Sunday due date.
 */
function nextRecurrenceDate(fromDateStr, recurrence) {
  const base = fromDateStr ? new Date(fromDateStr + "T00:00:00") : new Date();
  const next = new Date(base);
  if (recurrence === "daily") {
    next.setDate(next.getDate() + 1);
  } else if (recurrence === "weekly") {
    next.setDate(next.getDate() + 7);
  } else if (recurrence === "weekdays") {
    do { next.setDate(next.getDate() + 1); } while (next.getDay() === 0 || next.getDay() === 6);
  }
  return toDateStr(next);
}

async function spawnNextRecurrence(task) {
  const payload = {
    title: task.title,
    category: task.category,
    status: "todo",
    due_date: nextRecurrenceDate(task.due_date, task.recurrence),
    position: nextPositionFor("todo") + 1,
    user_id: state.userId,
    recurrence: task.recurrence,
  };
  if (state.currentBoardId) payload.board_id = state.currentBoardId;
  const { data, error } = await runOrQueue({ type: "insert", table: "tasks", payload }, () =>
    supabaseClient.from("tasks").insert(payload).select().single()
  );
  if (!error && data) {
    state.tasks.push(data);
    renderBoard();
  }
}

/**
 * Deletes a task, but not right away - the row disappears from the board
 * immediately (so it still feels instant), while the real Supabase
 * delete is held off until the "Task deleted · Undo" toast expires.
 * Clicking Undo puts it right back where it was and the Supabase delete
 * never happens at all.
 */
function deleteTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  const originalIndex = state.tasks.indexOf(task);

  state.tasks = state.tasks.filter((t) => t.id !== id);
  renderBoard();
  playSound("delete");

  toastUndo("Task deleted", {
    duration: 5000,
    onUndo: () => {
      state.tasks.splice(Math.min(originalIndex, state.tasks.length), 0, task);
      renderBoard();
    },
    onExpire: async () => {
      const { error } = await runOrQueue({ type: "delete", table: "tasks", id }, () =>
        supabaseClient.from("tasks").delete().eq("id", id)
      );
      if (error) {
        state.tasks.splice(Math.min(originalIndex, state.tasks.length), 0, task);
        renderBoard();
        toast("Couldn't delete task: " + error.message, "error");
      }
    },
  });
}

async function moveTask(id, newStatus, newPosition) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  task.status = newStatus;
  task.position = newPosition;
  // no re-render here - SortableJS has already moved the DOM node for us

  const payload = { status: newStatus, position: newPosition };
  const { error } = await runOrQueue({ type: "update", table: "tasks", id, payload }, () =>
    supabaseClient.from("tasks").update(payload).eq("id", id)
  );

  if (error) {
    toast("Couldn't save the move: " + error.message, "error");
    await loadTasks(); // reload from source of truth to undo visually
  }
}

// ---------------------------------------------------------------------------
// 5. DRAG AND DROP (SortableJS)
// ---------------------------------------------------------------------------

function initSortable() {
  COLUMNS.forEach((col) => {
    const el = document.getElementById(`col-${col}`);
    new Sortable(el, {
      group: "kanban",
      animation: 150,
      ghostClass: "sortable-ghost",
      dragClass: "sortable-drag",
      handle: ".drag-handle",
      delay: 180,
      delayOnTouchOnly: true,
      touchStartThreshold: 8,
      fallbackTolerance: 3,
      fallbackOnBody: true,
      scroll: true,
      bubbleScroll: true,
      scrollSensitivity: 80,
      scrollSpeed: 12,
      emptyInsertThreshold: 40,
      onAdd: (evt) => {
        syncColumnAfterDrag(evt.to);
        if (evt.to.id === "col-done") { celebrate(evt.item); playSound("complete"); logCompletion(); }
      },
      onUpdate: (evt) => syncColumnAfterDrag(evt.to),
      onEnd: (evt) => {
        if (evt.from !== evt.to) syncColumnAfterDrag(evt.from);
      },
    });
  });
}

// After ANY drag finishes, read the new DOM order of that column and
// write matching status/position values back into state + Supabase.
function syncColumnAfterDrag(columnEl) {
  const status = columnEl.id.replace("col-", "");
  const cards = [...columnEl.querySelectorAll("[data-id]")];
  cards.forEach((card, index) => {
    moveTask(card.dataset.id, status, index);
  });
  // update the little counters + swap in an empty-state if a column is
  // now empty (SortableJS moved raw DOM nodes, so counts can be stale)
  COLUMNS.forEach((c) => {
    const container = document.getElementById(`col-${c}`);
    const count = container.querySelectorAll("[data-id]").length;
    document.getElementById(`count-${c}`).textContent = count;
    if (count === 0 && !container.querySelector(".empty-state")) {
      container.innerHTML = emptyStateHTML(c);
    }
  });
}

// ---------------------------------------------------------------------------
// 5b. CLICK-TO-EDIT MODAL
// ---------------------------------------------------------------------------

function openEditModal(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  state.editingId = id;
  state.editingSubtasks = Array.isArray(task.subtasks) ? task.subtasks.map((s) => ({ ...s })) : [];
  document.getElementById("edit-title").value = task.title;
  document.getElementById("edit-category").value = task.category;
  document.getElementById("edit-status").value = task.status;
  document.getElementById("edit-due-date").value = task.due_date || "";
  document.getElementById("edit-auto-done-row")?.classList.toggle("hidden", !state.remindersReady);
  document.getElementById("edit-auto-done-row")?.classList.toggle("flex", state.remindersReady);
  // Both this simple checkbox and Timely's own advanced "auto-done" panel
  // write to the same auto_done_at column - only treat the checkbox as
  // "in charge" of clearing it later if what's there right now actually
  // looks like it came from the due date (same calendar day), so someone
  // using the advanced panel for something unrelated never has it
  // silently overwritten just because this simple checkbox exists too.
  const autoDoneLinkedToDue = !!(task.auto_done_at && task.due_date &&
    new Date(task.auto_done_at).toLocaleDateString("en-CA", { timeZone: task.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone }) === task.due_date);
  state.editingAutoDoneLinkedToDue = autoDoneLinkedToDue;
  document.getElementById("edit-auto-done-at-due").checked = autoDoneLinkedToDue;
  document.getElementById("edit-platform-row")?.classList.toggle("hidden", !state.socialReady);
  document.getElementById("edit-notes-row")?.classList.toggle("hidden", !state.socialReady);
  document.getElementById("edit-social-note")?.classList.toggle("hidden", state.socialReady);
  document.getElementById("edit-platform").value = state.socialReady ? task.platform || "" : "";
  document.getElementById("edit-notes").value = state.socialReady ? task.notes || "" : "";
  document.getElementById("edit-notes").classList.remove("hidden");
  document.getElementById("edit-notes-markdown-preview")?.classList.add("hidden");
  document.getElementById("edit-notes-markdown-toggle")?.classList.remove("text-orange");
  updatePlatformHint();
  updateNotesCount();

  document.getElementById("edit-pipeline-row")?.classList.toggle("hidden", !state.proReady);
  document.getElementById("edit-pipeline-stage").value = state.proReady ? task.pipeline_stage || "" : "";

  document.getElementById("edit-dev-fields")?.classList.toggle("hidden", !state.devReady);
  document.getElementById("edit-dev-note")?.classList.toggle("hidden", state.devReady);
  document.getElementById("edit-priority").value = state.devReady ? task.priority || "" : "";
  document.getElementById("edit-environment").value = state.devReady ? task.environment || "" : "";
  document.getElementById("edit-git-branch").value = state.devReady ? task.git_branch || "" : "";
  document.getElementById("edit-git-pr-url").value = state.devReady ? task.git_pr_url || "" : "";
  renderTimeTrackingDisplay(task);
  populateBlockedByOptions(task);

  document.getElementById("edit-published-row")?.classList.toggle("hidden", !state.proReady);
  document.getElementById("edit-published-url").value = state.proReady ? task.published_url || "" : "";
  document.getElementById("edit-performance-note").value = state.proReady ? task.performance_note || "" : "";

  document.getElementById("edit-geo-row")?.classList.toggle("hidden", !state.proReady || !("geolocation" in navigator));
  document.getElementById("edit-geo-label").value = task.reminder_geo_label || "";
  document.getElementById("edit-geo-trigger").value = task.reminder_geo_trigger || "arrive";
  document.getElementById("edit-geo-radius").value = task.reminder_radius_m || "300";
  const hasGeo = state.proReady && task.reminder_lat != null && task.reminder_lng != null;
  state.editingGeo = hasGeo ? { lat: task.reminder_lat, lng: task.reminder_lng } : null;
  document.getElementById("edit-geo-fields")?.classList.toggle("hidden", !hasGeo);
  document.getElementById("edit-geo-clear")?.classList.toggle("hidden", !hasGeo);
  document.getElementById("edit-geo-use-location").innerHTML = hasGeo
    ? '<i class="fa-solid fa-location-dot mr-1.5"></i>Update to my current location'
    : '<i class="fa-solid fa-location-crosshairs mr-1.5"></i>Use my current location';
  document.getElementById("edit-reminder-at").value = task.reminder_at ? toDateTimeLocal(task.reminder_at) : "";
  document.getElementById("edit-reminder-field")?.classList.toggle("hidden", !state.remindersReady);
  document.getElementById("edit-reminder-repeat-row")?.classList.toggle("hidden", !state.reminderRepeatReady);
  document.getElementById("edit-reminder-repeat-note")?.classList.toggle("hidden", !state.remindersReady || state.reminderRepeatReady);
  document.getElementById("edit-reminder-repeat").value = state.reminderRepeatReady ? task.reminder_repeat || "" : "";
  document.getElementById("edit-recurrence").value = task.recurrence || "";
  document.getElementById("edit-attachment-file").value = "";
  document.getElementById("edit-attachment-url").value = "";
  renderEditSubtasks();

  document.getElementById("edit-v2-fields")?.classList.toggle("hidden", !state.v2Ready);
  document.getElementById("edit-v2-note")?.classList.toggle("hidden", state.v2Ready);

  renderVerticalFields(task);
  renderAttachmentList(task);

  document.getElementById("edit-modal").classList.remove("hidden");
  document.getElementById("edit-title").focus();
}

// A task can still be carrying the old single attachment_url/attachment_name
// pair (pre-schema_v10 data, or attachmentsReady not run yet) instead of
// the new attachments[] array - this reads either shape back out as one
// consistent list so the rest of the code only has to deal with one form.
function taskAttachmentList(task) {
  if (Array.isArray(task.attachments) && task.attachments.length) return task.attachments;
  if (task.attachment_url) return [{ url: task.attachment_url, name: task.attachment_name || "Attachment" }];
  return [];
}

// ---------------------------------------------------------------------------
// 5b3. DEV FEATURES: time tracking, blocked-by
// ---------------------------------------------------------------------------

// Live elapsed seconds for a ticket: whatever's already banked, plus
// however long the current run has been going if it's running right now.
function taskElapsedSeconds(task) {
  const banked = task.time_tracked_seconds || 0;
  if (!task.time_tracking_started_at) return banked;
  return banked + Math.floor((Date.now() - new Date(task.time_tracking_started_at).getTime()) / 1000);
}
function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function renderTimeTrackingDisplay(task) {
  const display = document.getElementById("edit-time-display");
  const btn = document.getElementById("edit-time-toggle-btn");
  if (!display || !btn) return;
  const running = !!task.time_tracking_started_at;
  display.textContent = formatDuration(taskElapsedSeconds(task));
  btn.innerHTML = running ? '<i class="fa-solid fa-pause mr-1.5"></i>Stop' : '<i class="fa-solid fa-play mr-1.5"></i>Start';
  btn.classList.toggle("!border-orange", running);
  btn.classList.toggle("!text-orange", running);

  clearInterval(state.editingTimeTick);
  state.editingTimeTick = running
    ? setInterval(() => { display.textContent = formatDuration(taskElapsedSeconds(task)); }, 1000)
    : null;
}

// Starts/stops immediately (not gated behind the Save button) - a timer
// that only "counts" after you remember to hit Save would be worse than
// no timer at all, and this also means it keeps running accurately even
// if you close the ticket and come back later.
async function toggleTimeTracking(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  let payload;
  if (task.time_tracking_started_at) {
    // Stopping: bank the elapsed time, clear the running marker.
    payload = { time_tracked_seconds: taskElapsedSeconds(task), time_tracking_started_at: null };
  } else {
    payload = { time_tracking_started_at: new Date().toISOString() };
  }
  Object.assign(task, payload);
  renderTimeTrackingDisplay(task);
  renderBoard();
  const { error } = await supabaseClient.from("tasks").update(payload).eq("id", taskId);
  if (error) toast("Couldn't save the timer: " + error.message, "error");
}

async function resetTimeTracking(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const confirmed = await showConfirmModal("Reset the tracked time on this ticket back to 0?", { title: "Reset timer?", confirmLabel: "Reset" });
  if (!confirmed) return;
  const payload = { time_tracked_seconds: 0, time_tracking_started_at: null };
  Object.assign(task, payload);
  renderTimeTrackingDisplay(task);
  renderBoard();
  const { error } = await supabaseClient.from("tasks").update(payload).eq("id", taskId);
  if (error) toast("Couldn't reset the timer: " + error.message, "error");
}

function populateBlockedByOptions(task) {
  const select = document.getElementById("edit-blocked-by");
  const warning = document.getElementById("edit-blocked-warning");
  if (!select) return;
  const others = state.tasks.filter((t) => t.id !== task.id);
  select.innerHTML = `<option value="">Not blocked</option>` +
    others.map((t) => `<option value="${t.id}" ${t.id === task.blocked_by_id ? "selected" : ""}>${escapeHTML(t.title)} ${t.status === "done" ? "(Done)" : ""}</option>`).join("");
  const blocker = others.find((t) => t.id === task.blocked_by_id);
  warning?.classList.toggle("hidden", !blocker || blocker.status === "done");
}

function renderAttachmentList(task) {
  const wrap = document.getElementById("edit-attachment-list");
  if (!wrap) return;
  const list = taskAttachmentList(task);
  wrap.innerHTML = list.length
    ? list.map((a, i) => `
      <div class="flex items-center gap-2 border border-line rounded-lg px-2.5 py-1.5">
        <a href="${a.url}" target="_blank" rel="noopener" class="flex-1 flex items-center gap-1.5 text-orange hover:underline truncate min-w-0">
          <i class="fa-solid ${isImageUrl(a.url) ? "fa-image" : "fa-paperclip"}"></i><span class="truncate">${escapeHTML(a.name || "Attachment")}</span>
        </a>
        <button type="button" data-download-attachment="${i}" title="Download" class="text-ink-soft hover:text-orange shrink-0"><i class="fa-solid fa-download"></i></button>
        <button type="button" data-remove-attachment="${i}" title="Remove" class="text-ink-soft hover:text-orange shrink-0"><i class="fa-solid fa-xmark"></i></button>
      </div>`).join("")
    : "";
}

// Cross-origin URLs (Supabase Storage lives on a different domain than
// the app) mostly ignore a plain <a download> - most browsers just
// navigate/open it instead of saving. Fetching it as a blob first and
// downloading *that* object URL works around that as long as the
// storage bucket allows CORS reads, which public Supabase buckets do by
// default. Falls back to just opening the link if the fetch fails.
async function downloadAttachment(url, name) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("fetch failed");
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = name || "attachment";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

function closeEditModal() {
  state.editingId = null;
  state.editingSubtasks = [];
  state.editingGeo = null;
  state.editingAutoDoneLinkedToDue = false;
  clearInterval(state.editingTimeTick);
  state.editingTimeTick = null;
  document.getElementById("edit-modal").classList.add("hidden");
}

// ---------------------------------------------------------------------------
// 4b. SOCIAL FIELDS: platform best-time hint, caption char counter, and a
//     small localStorage-backed library of reusable caption/post snippets
//     (openers, CTAs, hashtag sets, etc.) - same "save it once, reuse it
//     forever" idea as Timely's recurring-templates, just for post copy.
// ---------------------------------------------------------------------------

function updatePlatformHint() {
  const platform = document.getElementById("edit-platform")?.value;
  const hint = document.getElementById("edit-platform-besttime");
  if (!hint) return;
  const meta = PLATFORM_META[platform];
  if (meta && meta.bestTime) {
    document.getElementById("edit-platform-besttime-text").textContent = meta.bestTime;
    hint.classList.remove("hidden");
  } else {
    hint.classList.add("hidden");
  }
  updateNotesCount();
}

function updateNotesCount() {
  const platform = document.getElementById("edit-platform")?.value;
  const countEl = document.getElementById("edit-notes-count");
  const notesEl = document.getElementById("edit-notes");
  if (!countEl || !notesEl) return;
  const len = notesEl.value.length;
  const limit = PLATFORM_META[platform]?.limit;
  if (limit) {
    countEl.textContent = `${len} / ${limit}`;
    countEl.classList.toggle("text-orange", len > limit);
    countEl.classList.toggle("font-semibold", len > limit);
  } else {
    countEl.textContent = len ? `${len} chars` : "";
    countEl.classList.remove("text-orange", "font-semibold");
  }
}

// ---------------------------------------------------------------------------
// SAFE MARKDOWN PREVIEW for the caption/notes box.
//
// Security approach: the ENTIRE input is HTML-escaped first, via the same
// escapeHTML() used everywhere else in this file - so no raw HTML, script
// tag, or event-handler attribute typed into the notes box can ever reach
// the page. Only *after* that escaping do a small curated set of regexes
// re-introduce specific, hardcoded-safe tags (bold/italic/code/lists/
// headings, plus http(s)-only links). This is deliberately not a full
// Markdown library - a smaller surface area that's easy to fully reason
// about beats pulling in something powerful enough to also render raw
// HTML if misconfigured.
// ---------------------------------------------------------------------------
function safeMarkdownToHtml(raw) {
  if (!raw) return "";
  let html = escapeHTML(raw);

  html = html.replace(/```([\s\S]*?)```/g, (m, code) => `<pre class="bg-[var(--paper-2)] rounded p-2 overflow-x-auto text-xs font-mono my-2">${code}</pre>`);
  html = html.replace(/`([^`\n]+)`/g, '<code class="bg-[var(--paper-2)] px-1 rounded font-mono text-xs">$1</code>');
  html = html.replace(/^### (.*)$/gm, '<h3 class="font-semibold text-sm mt-2 mb-1">$1</h3>');
  html = html.replace(/^## (.*)$/gm, '<h2 class="font-semibold text-base mt-2 mb-1">$1</h2>');
  html = html.replace(/^# (.*)$/gm, '<h1 class="font-bold text-lg mt-2 mb-1">$1</h1>');
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  html = html.replace(/^- \[x\] (.*)$/gim, '<div class="flex items-center gap-2"><input type="checkbox" checked disabled class="rounded">$1</div>');
  html = html.replace(/^- \[ \] (.*)$/gm, '<div class="flex items-center gap-2"><input type="checkbox" disabled class="rounded">$1</div>');
  html = html.replace(/^- (.*)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul class="list-disc pl-5 my-1">${m}</ul>`);
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-orange hover:underline">$1</a>');
  html = html.replace(/\n/g, "<br>");
  return html;
}

function toggleMarkdownPreview() {
  const textarea = document.getElementById("edit-notes");
  const preview = document.getElementById("edit-notes-markdown-preview");
  const btn = document.getElementById("edit-notes-markdown-toggle");
  if (!textarea || !preview) return;
  const showingPreview = !preview.classList.contains("hidden");
  if (showingPreview) {
    preview.classList.add("hidden");
    textarea.classList.remove("hidden");
    btn.classList.remove("text-orange");
  } else {
    preview.innerHTML = safeMarkdownToHtml(textarea.value) || `<span class="text-ink-soft">Nothing to preview yet.</span>`;
    preview.classList.remove("hidden");
    textarea.classList.add("hidden");
    btn.classList.add("text-orange");
  }
}

function loadCaptionTemplates() {
  try { return JSON.parse(localStorage.getItem("boardly-caption-templates") || "[]"); }
  catch { return []; }
}
function saveCaptionTemplates(list) {
  localStorage.setItem("boardly-caption-templates", JSON.stringify(list.slice(0, 20)));
}

function renderCaptionTemplatesMenu() {
  const list = document.getElementById("edit-notes-templates-list");
  if (!list) return;
  const templates = loadCaptionTemplates();
  list.innerHTML = templates.length
    ? templates.map((t, i) => `
      <div class="group flex items-center px-1">
        <button type="button" data-use-caption-template="${i}" class="flex-1 text-left px-2.5 py-2 text-xs truncate" title="${escapeHTML(t)}">${escapeHTML(t.slice(0, 40))}${t.length > 40 ? "…" : ""}</button>
        <button type="button" data-remove-caption-template="${i}" class="text-ink-soft hover:text-orange opacity-0 group-hover:opacity-100 px-1"><i class="fa-solid fa-xmark text-xs"></i></button>
      </div>`).join("")
    : `<p class="px-3.5 py-2 text-xs text-ink-soft">No saved snippets yet - write something in the caption box, then "Save current text as snippet".</p>`;
}

// A rough visual mockup of how the current title/caption/cover image
// would read as an actual post, styled per-platform. Not pixel-perfect -
// just enough to sanity-check tone/length/crop before it goes out. Uses
// your own account name, not a hardcoded example - this is a generic
// tool for anyone's brand or personal page, not tied to any one company.
function openPostPreview() {
  const title = document.getElementById("edit-title").value.trim() || "Untitled";
  const notes = document.getElementById("edit-notes")?.value.trim() || "";
  const platform = document.getElementById("edit-platform")?.value || "";
  const editingTask = state.editingId && state.tasks.find((t) => t.id === state.editingId);
  const attachmentUrl = document.getElementById("edit-attachment-url")?.value.trim()
    || (editingTask && taskAttachmentList(editingTask).find((a) => isImageUrl(a.url))?.url) || "";
  const meta = PLATFORM_META[platform] || { label: "Post", icon: "fa-regular fa-image", color: "var(--ink)" };
  const isImage = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(attachmentUrl);
  const caption = notes || title;
  const accountName = state.userEmail || "Your page";

  document.getElementById("post-preview-body").innerHTML = `
    <div class="rounded-xl border border-line overflow-hidden bg-card">
      <div class="flex items-center gap-2 px-3 py-2.5 border-b border-line">
        <div class="h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-semibold" style="background:${meta.color}"><i class="${meta.icon}"></i></div>
        <div class="min-w-0">
          <p class="text-xs font-semibold truncate">${escapeHTML(accountName)}</p>
          <p class="text-[10px] text-ink-soft">${meta.label}</p>
        </div>
      </div>
      ${isImage
        ? `<img src="${attachmentUrl}" alt="" class="w-full aspect-square object-cover">`
        : `<div class="w-full py-8 flex flex-col items-center justify-center gap-1.5 bg-[var(--paper-2)] text-ink-soft"><i class="fa-regular fa-image text-2xl"></i><span class="text-[10px]">No image attached</span></div>`}
      <div class="px-3 py-2.5">
        <p class="text-xs leading-relaxed whitespace-pre-wrap">${escapeHTML(caption.slice(0, 400))}${caption.length > 400 ? "…" : ""}</p>
      </div>
    </div>`;
  document.getElementById("post-preview-modal").classList.remove("hidden");
}

function renderEditSubtasks() {
  const list = document.getElementById("edit-subtasks-list");
  if (!list) return;
  if (state.editingSubtasks.length === 0) {
    list.innerHTML = `<p class="text-xs text-ink-soft">No checklist items yet.</p>`;
    return;
  }
  list.innerHTML = state.editingSubtasks
    .map(
      (s, i) => `
    <div class="flex items-center gap-2">
      <button type="button" data-subtask-toggle="${i}" class="h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center" style="border-color:${s.done ? "var(--teal)" : "var(--ink-soft)"}; background:${s.done ? "var(--teal)" : "transparent"}">
        ${s.done ? '<i class="fa-solid fa-check text-[8px] text-white"></i>' : ""}
      </button>
      <span class="text-xs flex-1 ${s.done ? "line-through text-ink-soft" : ""}">${escapeHTML(s.text)}</span>
      <button type="button" data-subtask-remove="${i}" class="text-ink-soft hover:text-orange"><i class="fa-solid fa-xmark text-xs"></i></button>
    </div>`
    )
    .join("");
}

async function saveEditedTask() {
  const id = state.editingId;
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;

  const title = document.getElementById("edit-title").value.trim();
  if (!title) return;
  const category = document.getElementById("edit-category").value;
  const status = document.getElementById("edit-status").value;
  const dueDate = document.getElementById("edit-due-date").value || null;
  // Auto-move to Done at the due date, computed in the task's own
  // timezone when Timely is available (falls back to the browser's
  // local time otherwise) - end of day (23:59:59) on the due date, so
  // "due Friday" moves it to Done at the close of Friday, not midnight
  // at the start of it. This shares the auto_done_at column with
  // Timely's own advanced auto-done panel (which saves separately, in
  // the form submit's capture phase, before this runs) - to avoid the
  // two fighting over the same field, this only ever writes to it when
  // the checkbox is checked (setting the due-date value) or when it's
  // being unchecked specifically to turn off a value *this checkbox*
  // set previously (state.editingAutoDoneLinkedToDue, from openEditModal).
  // Any other combination leaves auto_done_at untouched, so an unrelated
  // value from the advanced panel is never silently overwritten.
  const autoDoneChecked = document.getElementById("edit-auto-done-at-due").checked;
  let autoDoneAt; // undefined = don't touch the column at all
  if (autoDoneChecked && dueDate) {
    autoDoneAt = window.Timely
      ? Timely.zonedTimeToUtc(`${dueDate}T23:59:59`, task.timezone || Timely.BROWSER_TZ).toISOString()
      : new Date(`${dueDate}T23:59:59`).toISOString();
  } else if (!autoDoneChecked && state.editingAutoDoneLinkedToDue) {
    autoDoneAt = null;
  }
  const touchingAutoDone = autoDoneAt !== undefined;
  const reminderInput = document.getElementById("edit-reminder-at").value;
  const reminderAt = reminderInput ? new Date(reminderInput).toISOString() : null;
  // A repeat pattern only means anything alongside an actual reminder
  // time, and clearing the reminder should always clear its repeat too -
  // otherwise re-adding a reminder later could silently inherit a stale
  // "every week" from a completely different earlier reminder.
  const reminderRepeat = reminderAt ? (document.getElementById("edit-reminder-repeat").value || null) : null;
  const recurrence = document.getElementById("edit-recurrence").value || null;
  const platform = document.getElementById("edit-platform").value || null;
  const notes = document.getElementById("edit-notes").value || null;
  const pipelineStage = document.getElementById("edit-pipeline-stage").value || null;
  const priority = document.getElementById("edit-priority").value || null;
  const environment = document.getElementById("edit-environment").value || null;
  const gitBranch = document.getElementById("edit-git-branch").value.trim() || null;
  const gitPrUrl = document.getElementById("edit-git-pr-url").value.trim() || null;
  const blockedById = document.getElementById("edit-blocked-by").value || null;
  const publishedUrl = document.getElementById("edit-published-url").value.trim() || null;
  const performanceNote = document.getElementById("edit-performance-note").value.trim() || null;
  const geoLabel = document.getElementById("edit-geo-label").value.trim() || null;
  const geoTrigger = document.getElementById("edit-geo-trigger").value || "arrive";
  const geoRadius = Number(document.getElementById("edit-geo-radius").value) || 300;
  const subtasks = state.editingSubtasks;
  const metadata = state.verticalReady ? collectVerticalFields() : task.metadata;

  const backup = { ...task };
  const statusChanged = status !== task.status;
  Object.assign(task, {
    title,
    category,
    status,
    due_date: dueDate,
    reminder_at: reminderAt,
    reminder_repeat: reminderRepeat,
    recurrence,
    platform,
    notes,
    pipeline_stage: pipelineStage,
    priority,
    environment,
    git_branch: gitBranch,
    git_pr_url: gitPrUrl,
    blocked_by_id: blockedById,
    published_url: publishedUrl,
    performance_note: performanceNote,
    reminder_lat: state.editingGeo?.lat ?? null,
    reminder_lng: state.editingGeo?.lng ?? null,
    reminder_radius_m: state.editingGeo ? geoRadius : null,
    reminder_geo_trigger: state.editingGeo ? geoTrigger : null,
    reminder_geo_label: state.editingGeo ? geoLabel : null,
    ...(touchingAutoDone ? { auto_done_at: autoDoneAt } : {}),
    ...(state.verticalReady ? { metadata } : {}),
    subtasks,
    position: statusChanged ? nextPositionFor(status) : task.position,
  });
  closeEditModal();
  renderBoard(); // also reschedules browser reminder timers (incl. the new repeat) and geofence watchers
  pushHistory(() => {
    Object.assign(task, backup);
    renderBoard();
    supabaseClient.from("tasks").update({
      title: backup.title, category: backup.category, status: backup.status,
      due_date: backup.due_date, position: backup.position,
      ...(state.remindersReady ? { reminder_at: backup.reminder_at || null } : {}),
      ...(state.reminderRepeatReady ? { reminder_repeat: backup.reminder_repeat || null } : {}),
      ...(state.socialReady ? { platform: backup.platform || null, notes: backup.notes || null } : {}),
      ...(state.proReady ? {
        pipeline_stage: backup.pipeline_stage || null, published_url: backup.published_url || null,
        performance_note: backup.performance_note || null, reminder_lat: backup.reminder_lat ?? null,
        reminder_lng: backup.reminder_lng ?? null, reminder_radius_m: backup.reminder_radius_m ?? null,
        reminder_geo_trigger: backup.reminder_geo_trigger || null, reminder_geo_label: backup.reminder_geo_label || null,
      } : {}),
      ...(state.devReady ? {
        priority: backup.priority || null, environment: backup.environment || null,
        git_branch: backup.git_branch || null, git_pr_url: backup.git_pr_url || null,
        blocked_by_id: backup.blocked_by_id || null,
      } : {}),
      ...(state.verticalReady ? { metadata: backup.metadata || {} } : {}),
      ...(touchingAutoDone ? { auto_done_at: backup.auto_done_at ?? null } : {}),
    }).eq("id", id);
  });

  const payload = { title, category, status, due_date: dueDate, position: task.position };
  if (state.remindersReady) payload.reminder_at = reminderAt;
  if (state.reminderRepeatReady) payload.reminder_repeat = reminderRepeat;
  if (state.socialReady) Object.assign(payload, { platform, notes });
  if (state.proReady) Object.assign(payload, {
    pipeline_stage: pipelineStage, published_url: publishedUrl, performance_note: performanceNote,
    reminder_lat: state.editingGeo?.lat ?? null, reminder_lng: state.editingGeo?.lng ?? null,
    reminder_radius_m: state.editingGeo ? geoRadius : null, reminder_geo_trigger: state.editingGeo ? geoTrigger : null,
    reminder_geo_label: state.editingGeo ? geoLabel : null,
  });
  if (state.devReady) Object.assign(payload, {
    priority, environment, git_branch: gitBranch, git_pr_url: gitPrUrl, blocked_by_id: blockedById,
  });
  if (state.verticalReady) payload.metadata = metadata;
  if (touchingAutoDone) payload.auto_done_at = autoDoneAt;
  if (state.v2Ready) Object.assign(payload, { recurrence, subtasks });
  const { error } = await runOrQueue({ type: "update", table: "tasks", id, payload }, () =>
    supabaseClient.from("tasks").update(payload).eq("id", id)
  );

  if (error) {
    Object.assign(task, backup);
    renderBoard();
    toast("Couldn't save changes: " + error.message, "error");
  } else {
    toast("Ticket updated", "ok");
  }

}

// ---------------------------------------------------------------------------
// 5b2. FILE ATTACHMENTS (Supabase Storage)
//    Needs a public "task-attachments" bucket created once in the
//    Supabase dashboard - see FEATURES_V2_SETUP.md. Uploads fail
//    gracefully with a toast if the bucket doesn't exist yet.
//
//    Saves the whole list under one "attachments" jsonb column (a
//    single round trip) rather than one row per file - simpler schema,
//    and this is always a handful of items per ticket, never hundreds.
//    attachment_url/attachment_name (the old single-file columns) are
//    kept pointed at whichever item was added most recently, purely so
//    anything still reading those two columns directly (older exports,
//    a stale cache) keeps working.
// ---------------------------------------------------------------------------

const ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024; // 15MB - Supabase's default free-tier upload cap

async function persistAttachmentList(taskId, list) {
  const task = state.tasks.find((t) => t.id === taskId);
  const last = list[list.length - 1] || null;
  const payload = state.attachmentsReady
    ? { attachments: list, attachment_url: last?.url ?? null, attachment_name: last?.name ?? null }
    : { attachment_url: last?.url ?? null, attachment_name: last?.name ?? null };
  if (task) Object.assign(task, payload);
  renderBoard();
  if (task) renderAttachmentList(task);
  const { error } = await supabaseClient.from("tasks").update(payload).eq("id", taskId);
  return error;
}

async function uploadAttachment(taskId, file) {
  if (file.size > ATTACHMENT_MAX_BYTES) {
    toast(`"${file.name}" is too big (max ${(ATTACHMENT_MAX_BYTES / 1024 / 1024) | 0}MB)`, "error");
    return;
  }
  toast(`Uploading ${file.name}…`, "ok");

  const path = `${state.userId}/${taskId}-${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabaseClient.storage.from("task-attachments").upload(path, file);
  if (uploadError) {
    // The #1 real-world cause: the "task-attachments" bucket hasn't been
    // created yet (FEATURES_V2_SETUP.md, step 2) - say that plainly
    // instead of just surfacing Supabase's generic error text.
    const missingBucket = /bucket not found/i.test(uploadError.message || "");
    toast(
      missingBucket
        ? "Attachments aren't set up yet: create a public \"task-attachments\" bucket in Supabase → Storage (see FEATURES_V2_SETUP.md, step 2)."
        : `Couldn't upload "${file.name}": ` + uploadError.message,
      "error"
    );
    return;
  }
  const { data: urlData } = supabaseClient.storage.from("task-attachments").getPublicUrl(path);

  const task = state.tasks.find((t) => t.id === taskId);
  const list = task ? [...taskAttachmentList(task), { url: urlData.publicUrl, name: file.name }] : [{ url: urlData.publicUrl, name: file.name }];
  const error = await persistAttachmentList(taskId, list);
  if (error) toast("Uploaded, but couldn't save it to the task: " + error.message, "error");
  else toast(`"${file.name}" added`, "ok");
}

// Uploads several files one after another (sequential, not parallel, so
// the attachments list doesn't race itself with concurrent read-modify-
// write updates) - used by both the multi-select file input and pasting
// several files/images at once.
async function uploadAttachments(taskId, files) {
  for (const file of files) {
    await uploadAttachment(taskId, file);
  }
}

// Same attachments column as a file upload, just skipping Supabase
// Storage entirely - for pasting a link to something that already lives
// elsewhere (a live post, a Canva/Drive doc, a scheduling-tool entry),
// which for a social content workflow is the more common case than
// uploading a fresh file.
async function attachLinkToTask(taskId, url) {
  let parsed;
  try { parsed = new URL(url); } catch { toast("That doesn't look like a valid link", "error"); return; }
  if (!/^https?:$/.test(parsed.protocol)) { toast("Links must start with http:// or https://", "error"); return; }

  const task = state.tasks.find((t) => t.id === taskId);
  const name = parsed.hostname.replace(/^www\./, "");
  const list = task ? [...taskAttachmentList(task), { url: parsed.href, name }] : [{ url: parsed.href, name }];
  document.getElementById("edit-attachment-url").value = "";
  const error = await persistAttachmentList(taskId, list);
  if (error) toast("Couldn't save that link: " + error.message, "error");
  else toast("Link added", "ok");
}

async function removeAttachmentAt(taskId, index) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const list = taskAttachmentList(task).filter((_, i) => i !== index);
  const error = await persistAttachmentList(taskId, list);
  if (error) toast("Couldn't remove attachment: " + error.message, "error");
}

// Lets you copy an image (a screenshot, a photo from anywhere) or a
// file on desktop and paste it straight in with Cmd/Ctrl+V while the
// edit ticket window is open, instead of always going through a file
// picker. Scoped to the edit modal specifically so pasting text into an
// ordinary field elsewhere on the page is never intercepted.
function initAttachmentPaste() {
  document.getElementById("edit-modal")?.addEventListener("paste", (e) => {
    if (!state.editingId || document.getElementById("edit-modal").classList.contains("hidden")) return;
    const items = Array.from(e.clipboardData?.items || []);
    const files = items.filter((item) => item.kind === "file").map((item) => item.getAsFile()).filter(Boolean);
    if (!files.length) return; // let normal text paste proceed untouched
    e.preventDefault();
    uploadAttachments(state.editingId, files);
  });
}

// The Ctrl/Cmd+V keyboard paste above works great on desktop, but phones
// have no physical keyboard shortcut for it - this button uses the
// Async Clipboard API instead, which both iOS Safari and Android Chrome
// support from a direct tap, so "paste an image" works the same way on
// a phone as it does on a computer.
async function pasteAttachmentFromClipboard() {
  if (!state.editingId) return;
  if (!navigator.clipboard || !navigator.clipboard.read) {
    toast("Your browser doesn't support pasting from a button - try Cmd/Ctrl+V instead", "error");
    return;
  }
  try {
    const clipboardItems = await navigator.clipboard.read();
    const files = [];
    for (const item of clipboardItems) {
      const imageType = item.types.find((t) => t.startsWith("image/"));
      if (imageType) {
        const blob = await item.getType(imageType);
        files.push(new File([blob], `pasted-${Date.now()}.${imageType.split("/")[1] || "png"}`, { type: imageType }));
      }
    }
    if (!files.length) { toast("Nothing image-based found on your clipboard", "error"); return; }
    uploadAttachments(state.editingId, files);
  } catch (err) {
    toast("Couldn't read the clipboard - your browser may need permission", "error");
  }
}



// ---------------------------------------------------------------------------
// 5c/5d. EXPORT and BULK IMPORT moved to js/dashboard-extras.js
// (triggerDownload, csvEscape, exportBoard, openImportModal,
// closeImportModal, importPastedTasks - all unchanged, just relocated)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5e. DUE-SOON BROWSER NOTIFICATIONS
// ---------------------------------------------------------------------------

/**
 * The bell button is a real on/off switch, not just a one-way "ask for
 * permission" button. Browsers won't let JavaScript revoke a permission
 * once granted, so "off" is tracked as our own "muted" flag in
 * localStorage - once permission is granted, toggling just flips that
 * flag, no browser prompt needed the second time.
 */
async function toggleDueSoonNotifications() {
  if (!("Notification" in window)) {
    toast("This browser doesn't support notifications", "error");
    return;
  }
  if (Notification.permission === "denied") {
    toast("Notifications are blocked for this site in your browser settings", "error");
    return;
  }

  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
    localStorage.removeItem("boardly-notify-muted");
    updateNotifyButton();
    toast("Due-today reminders are on", "ok");
    checkDueSoonAndNotify(true);
    scheduleReminderNotifications();
    return;
  }

  const isMuted = localStorage.getItem("boardly-notify-muted") === "1";
  if (isMuted) {
    localStorage.removeItem("boardly-notify-muted");
    toast("Due-today reminders are on", "ok");
    checkDueSoonAndNotify(true);
    scheduleReminderNotifications();
  } else {
    localStorage.setItem("boardly-notify-muted", "1");
    toast("Due-today reminders are off", "ok");
  }
  updateNotifyButton();
}

function updateNotifyButton() {
  const btn = document.getElementById("notify-btn");
  if (!btn) return;
  const on = "Notification" in window && Notification.permission === "granted" && localStorage.getItem("boardly-notify-muted") !== "1";
  btn.classList.toggle("active", on);
  btn.innerHTML = on ? '<i class="fa-solid fa-bell"></i>' : '<i class="fa-regular fa-bell-slash"></i>';
  btn.title = on ? "Due-today reminders are on, click to turn off" : "Turn on due-today reminders";
}

function checkDueSoonAndNotify(force = false) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (localStorage.getItem("boardly-notify-muted") === "1") return;
  const todayStr = toDateStr(new Date());
  const lastNotified = localStorage.getItem("boardly-last-notified-date");
  if (lastNotified === todayStr && !force) return;

  const dueToday = state.tasks.filter((t) => t.status !== "done" && t.due_date === todayStr);
  if (dueToday.length === 0) return;

  localStorage.setItem("boardly-last-notified-date", todayStr);
  const body =
    dueToday.length === 1
      ? dueToday[0].title
      : `${dueToday.length} tasks due today: ${dueToday.slice(0, 3).map((t) => t.title).join(", ")}${dueToday.length > 3 ? "…" : ""}`;
  new Notification("Boardly: due today", { body, icon: "icons/icon-192.png" });
}

// Exact-time browser reminders are a helpful immediate layer. Browsers may
// pause a closed tab, so reliable "app closed" delivery is handled by the
// optional Brevo + Supabase scheduled function included with this project.
const reminderTimers = new Map();

function toDateTimeLocal(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatReminderAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function scheduleReminderNotifications() {
  reminderTimers.forEach((timer) => clearTimeout(timer));
  reminderTimers.clear();
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (localStorage.getItem("boardly-notify-muted") === "1") return;

  state.tasks.forEach((task) => {
    if (!task.reminder_at || task.status === "done") return;
    const delay = new Date(task.reminder_at).getTime() - Date.now();
    if (delay <= 0 || delay > 2147483647) return;
    const key = `boardly-reminded-${task.id}-${task.reminder_at}`;
    if (localStorage.getItem(key)) return;
    const timer = setTimeout(() => {
      const current = state.tasks.find((item) => item.id === task.id);
      if (!current || current.status === "done") return;
      localStorage.setItem(key, "1");
      fireActionableNotification("Boardly reminder", current.title, current.id);
      toast(`Reminder: ${current.title}`, "ok");
      advanceRepeatingReminder(current);
    }, delay);
    reminderTimers.set(task.id, timer);
  });
}

// Shows a notification with Snooze/Mark done/Open buttons on it when a
// service worker is available (installed PWA, most Android/desktop
// browsers), falling back to a plain notification with no buttons
// otherwise (e.g. Safari) - either way something still shows up.
async function fireActionableNotification(title, body, taskId) {
  const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.ready.catch(() => null) : null;
  const options = {
    body, icon: "icons/icon-192.png", badge: "icons/icon-192.png",
    tag: `boardly-task-${taskId}`, renotify: true, data: { taskId },
  };
  if (registration && registration.showNotification) {
    registration.showNotification(title, {
      ...options,
      actions: [
        { action: "snooze", title: "Snooze 10 min" },
        { action: "done", title: "Mark done" },
        { action: "open", title: "Open" },
      ],
    });
  } else {
    new Notification(title, options);
  }
}

// ---------------------------------------------------------------------
// PULL-TO-REFRESH
// Standalone/home-screen iOS PWAs lose Safari's native bounce-to-refresh
// entirely, so without this there's simply no way to manually refresh
// short of force-quitting the app. Pure touch-event based - no native
// API needed, so it works identically in Safari, standalone, and
// Android.
// ---------------------------------------------------------------------
function initPullToRefresh() {
  const indicator = document.getElementById("pull-refresh-indicator");
  if (!indicator) return;
  const THRESHOLD = 70;
  let startY = null;
  let pulling = false;

  document.addEventListener("touchstart", (e) => {
    if (window.scrollY > 0) { startY = null; return; }
    startY = e.touches[0].clientY;
    pulling = false;
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (startY == null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) return;
    pulling = true;
    const pull = Math.min(dy, THRESHOLD * 1.6);
    indicator.style.transform = `translateY(${pull - 44}px)`;
    indicator.style.transition = "none";
    indicator.querySelector("i").style.transform = `rotate(${pull * 3}deg)`;
    indicator.classList.toggle("text-orange", pull >= THRESHOLD);
  }, { passive: true });

  document.addEventListener("touchend", async (e) => {
    if (startY == null) return;
    indicator.style.transition = "transform .2s ease";
    const dy = (e.changedTouches[0]?.clientY ?? startY) - startY;
    startY = null;
    if (pulling && dy >= THRESHOLD) {
      indicator.style.transform = "translateY(6px)";
      indicator.querySelector("i").classList.add("fa-spin");
      await loadTasks();
      renderBoard();
      toast("Refreshed", "ok");
      indicator.querySelector("i").classList.remove("fa-spin");
    }
    indicator.style.transform = "translateY(-100%)";
    pulling = false;
  });
}

// Buttons on the notification itself only work through a service worker
// (see fireActionableNotification/sw.js), which posts a message back to
// whichever tab(s) are open rather than being able to touch the database
// directly - this is that other end of the conversation.
function initServiceWorkerMessages() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    const { type, taskId } = event.data || {};
    if (!taskId) return;
    if (type === "boardly-snooze") snoozeTask(taskId, 10);
    else if (type === "boardly-mark-done") markTaskDoneFromNotification(taskId);
    else if (type === "boardly-alarm-open") openEditModal(taskId);
  });
}

async function snoozeTask(taskId, minutes) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const nextAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  task.reminder_at = nextAt;
  scheduleReminderNotifications();
  toast(`Snoozed "${task.title}" for ${minutes} min`, "ok");
  const { error } = await supabaseClient.from("tasks").update({ reminder_at: nextAt }).eq("id", taskId);
  if (error) console.error("Couldn't save snooze", error.message);
}

async function markTaskDoneFromNotification(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  task.status = "done";
  task.reminder_at = null;
  renderBoard();
  toast(`Marked "${task.title}" done`, "ok");
  const { error } = await supabaseClient.from("tasks").update({ status: "done", reminder_at: null }).eq("id", taskId);
  if (error) console.error("Couldn't save done-from-notification", error.message);
}

// A repeating reminder ("every day"/"every weekday"/"every week") never
// needs to be re-opened and re-set: the moment it fires, this rolls
// reminder_at forward to its next occurrence (in the task's own
// timezone, DST included, via Timely.nextZonedOccurrence) and saves
// that, so scheduleReminderNotifications() picks up the new time on its
// next pass. If Timely or reminder_repeat isn't available, this is a
// no-op and the reminder behaves exactly like a one-off, as before.
async function advanceRepeatingReminder(task) {
  if (!task.reminder_repeat || !window.Timely || !state.reminderRepeatReady) return;
  const nextAt = Timely.nextZonedOccurrence(task.reminder_at, task.timezone, task.reminder_repeat);
  if (!nextAt) return;
  const nextIso = nextAt.toISOString();
  task.reminder_at = nextIso;
  scheduleReminderNotifications();
  if (document.getElementById("edit-modal")?.classList.contains("hidden") === false && state.editingId === task.id) {
    document.getElementById("edit-reminder-at").value = toDateTimeLocal(nextIso);
  }
  const { error } = await supabaseClient.from("tasks").update({ reminder_at: nextIso }).eq("id", task.id);
  if (error) console.error("Couldn't advance repeating reminder", task.id, error.message);
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 4c/5f. LOCATION-BASED (GEOFENCE) REMINDERS and SWIPE GESTURES moved to
// js/dashboard-behaviors.js (haversineMeters, updateGeofenceWatch,
// onGeoPosition, initSwipeGestures - all unchanged, just relocated)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5g. AI ASSISTANT
//    Sends the current board's tasks plus your message to a Supabase Edge
//    Function ("board-assistant") that you deploy yourself - see
//    FEATURES_V2_SETUP.md. It replies with text and can optionally return
//    simple actions (like completing or deleting a task) that get applied
//    right here using the same functions everything else uses.
// ---------------------------------------------------------------------------

function addAIMessage(text, who) {
  const wrap = document.getElementById("ai-messages");
  if (!wrap) return;
  const bubble = document.createElement("div");
  bubble.className = who === "user"
    ? "ticket p-3 ml-6 bg-[var(--paper-2)]"
    : "ticket p-3 mr-6";
  bubble.textContent = text;
  wrap.appendChild(bubble);
  wrap.scrollTop = wrap.scrollHeight;
}

async function sendAIMessage(message) {
  addAIMessage(message, "user");
  const thinkingEl = document.createElement("div");
  thinkingEl.className = "ticket p-3 mr-6 text-ink-soft";
  thinkingEl.textContent = "Thinking…";
  document.getElementById("ai-messages")?.appendChild(thinkingEl);

  try {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/board-assistant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionData.session?.access_token || SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        message,
        tasks: state.tasks.map(({ id, title, category, status, due_date }) => ({ id, title, category, status, due_date })),
        categories: [...new Set(state.tasks.map((t) => t.category).filter(Boolean))],
        boardBrief: state.boards.find((b) => b.id === state.currentBoardId)?.ai_brief || null,
      }),
    });
    const result = await res.json();
    thinkingEl.remove();

    if (!res.ok) {
      addAIMessage(result.error || "The assistant isn't set up yet, see FEATURES_V2_SETUP.md.", "ai");
      return;
    }

    addAIMessage(result.reply || "Done.", "ai");

    let created = 0;
    for (const action of result.actions || []) {
      if (action.type === "create" && action.title) {
        const newTask = await addTask(action.title, action.category || "general", action.due_date || null, action.platform || null);
        created++;
        // notes (caption text), subtasks (checklist), and reminder_at aren't
        // part of addTask()'s own arguments (it's used all over the app
        // with just title/category/due_date/platform) - applied as one
        // follow-up patch instead of changing that shared function's shape.
        if (newTask?.id) {
          const followUp = {};
          if (action.notes) followUp.notes = action.notes;
          if (Array.isArray(action.subtasks) && action.subtasks.length && state.v2Ready) {
            followUp.subtasks = action.subtasks.map((text) => ({ text, done: false }));
          }
          if (action.reminder_at && state.remindersReady) followUp.reminder_at = action.reminder_at;
          if (Object.keys(followUp).length) {
            Object.assign(newTask, followUp);
            const idx = state.tasks.findIndex((t) => t.id === newTask.id);
            if (idx !== -1) state.tasks[idx] = newTask;
            await supabaseClient.from("tasks").update(followUp).eq("id", newTask.id);
          }
        }
      }
      if (action.type === "update" && action.id) {
        const t = state.tasks.find((x) => x.id === action.id);
        if (t) {
          const patch = {};
          if (action.title) patch.title = action.title;
          if (action.category) patch.category = action.category;
          if (action.due_date !== undefined) patch.due_date = action.due_date;
          Object.assign(t, patch);
          await supabaseClient.from("tasks").update(patch).eq("id", action.id);
        }
      }
      if (action.type === "complete" && action.id) toggleComplete(action.id);
      if (action.type === "delete" && action.id) deleteTask(action.id);
      if (action.type === "move" && action.id && action.status) {
        const t = state.tasks.find((x) => x.id === action.id);
        if (t) moveTask(action.id, action.status, nextPositionFor(action.status));
      }
      if (action.type === "delete_by_status" && action.status) {
        state.tasks.filter((t) => t.status === action.status).forEach((t) => deleteTask(t.id));
      }
      if (action.type === "move_by_status" && action.from && action.to) {
        state.tasks
          .filter((t) => t.status === action.from)
          .forEach((t) => moveTask(t.id, action.to, nextPositionFor(action.to)));
      }
    }
    if (created) toast(`AI added ${created} ticket${created > 1 ? "s" : ""}`, "ok");
    if (result.actions?.length) renderBoard();
  } catch (err) {
    thinkingEl.remove();
    addAIMessage("Couldn't reach the assistant. Check FEATURES_V2_SETUP.md to make sure it's deployed.", "ai");
  }
}

// ---------------------------------------------------------------------------
// 5h. UI PREFERENCES (sort, density, sound, accent) - all localStorage only
// ---------------------------------------------------------------------------

const ACCENTS = {
  sunset: { orange: "#E8622C", teal: "#0F9A78", violet: "#6355C7" },
  ocean: { orange: "#2C7BE8", teal: "#0FA0C9", violet: "#3D5AFE" },
  forest: { orange: "#3E8E4F", teal: "#0F9A78", violet: "#6B8E23" },
  berry: { orange: "#C2356B", teal: "#8E4EC6", violet: "#C2356B" },
};

function applyAccent(name) {
  const a = ACCENTS[name] || ACCENTS.sunset;
  document.documentElement.style.setProperty("--orange", a.orange);
  document.documentElement.style.setProperty("--teal", a.teal);
  document.documentElement.style.setProperty("--violet", a.violet);
  document.documentElement.style.setProperty("--orange-dark", a.orange);
}

function renderAccentSwatches() {
  const wrap = document.getElementById("accent-swatches");
  if (!wrap) return;
  wrap.innerHTML = Object.entries(ACCENTS)
    .map(
      ([name, c]) =>
        `<button type="button" data-accent="${name}" class="accent-swatch ${state.accent === name ? "active" : ""}" style="background:${c.orange}" title="${name}"></button>`
    )
    .join("");
}

function initPreferences() {
  state.sortMode = localStorage.getItem("boardly-sort-mode") || "manual";
  state.density = localStorage.getItem("boardly-density") || "comfortable";
  state.soundOn = localStorage.getItem("boardly-sound") !== "off";
  state.accent = localStorage.getItem("boardly-accent") || "sunset";

  const sortSelect = document.getElementById("sort-select");
  if (sortSelect) sortSelect.value = state.sortMode;
  applyAccent(state.accent);
  renderAccentSwatches();
  updateDensityIcon();
  updateSoundIcon();

  document.getElementById("more-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = document.getElementById("more-menu");
    menu?.classList.toggle("hidden");
    if (menu && !menu.classList.contains("hidden")) clampDropdownToViewport(menu);
  });
  document.addEventListener("click", () => document.getElementById("more-menu")?.classList.add("hidden"));

  sortSelect?.addEventListener("change", (e) => {
    state.sortMode = e.target.value;
    localStorage.setItem("boardly-sort-mode", state.sortMode);
    renderBoard();
  });

  document.getElementById("density-toggle")?.addEventListener("click", () => {
    state.density = state.density === "compact" ? "comfortable" : "compact";
    localStorage.setItem("boardly-density", state.density);
    updateDensityIcon();
    renderBoard();
  });

  document.getElementById("sound-toggle")?.addEventListener("click", () => {
    state.soundOn = !state.soundOn;
    localStorage.setItem("boardly-sound", state.soundOn ? "on" : "off");
    updateSoundIcon();
  });

  document.getElementById("accent-swatches")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-accent]");
    if (!btn) return;
    state.accent = btn.dataset.accent;
    localStorage.setItem("boardly-accent", state.accent);
    applyAccent(state.accent);
    renderAccentSwatches();
  });
}

function updateDensityIcon() {
  const btn = document.getElementById("density-toggle");
  if (btn) btn.innerHTML = state.density === "compact" ? '<i class="fa-solid fa-expand"></i>' : '<i class="fa-solid fa-compress"></i>';
}
function updateSoundIcon() {
  const btn = document.getElementById("sound-toggle");
  if (btn) btn.innerHTML = state.soundOn ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
}

/** Tiny Web Audio "pop"/"whoosh" - no audio files to host, just a short tone. */
let audioCtx = null;
function playSound(kind) {
  if (!state.soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = "sine";
    osc.frequency.value = kind === "complete" ? 660 : 320;
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
  } catch {
    // Web Audio unavailable - fail silently, sound is a nice-to-have
  }
}

// ---------------------------------------------------------------------------
// 5i. UNDO/REDO HISTORY moved to js/dashboard-extras.js
// (pushHistory, undoLastAction - unchanged, just relocated)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 5j/5k. ZEN MODE and KEYBOARD NAVIGATION moved to js/dashboard-behaviors.js
// (COLUMN_LABEL, setZenColumn, initZenMode, initKeyboardNav - unchanged, just relocated)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5l. ONBOARDING TOUR
// ---------------------------------------------------------------------------

const TOUR_STEPS = [
  { target: "#quick-add-form", title: "Add your first task", body: "Write what you need to do, then tap Add task. Try call Mum tomorrow or #work report Friday." },
  { target: "#col-todo", title: "Move tickets your way", body: "Hold the small grip on a ticket, then drag it into To do, In progress, or Done. Scroll everywhere else normally." },
  { target: "#open-cmdk-btn", mobileTarget: "#open-cmdk-btn-mobile-top", title: "Quick actions", body: "Use Command to add a task fast or jump to the action you need. Ctrl/Cmd + K works on a keyboard too." },
  { target: "#board-toolbar", title: "Find what matters", body: "Search your board, select several tickets, export a copy, open your calendar, or ask the board assistant." },
];

// Scroll lock: the tour used to let the board scroll freely underneath it,
// which is exactly what made the spotlight drift away from its target -
// the highlight box is measured once per step, so if the page moves after
// that, the box and the thing it's boxing fall out of sync. Locked scroll
// means "position it once, it stays right" instead of constantly
// re-chasing a moving target. The one exception is the tour card itself
// (and native pinch-zoom), which stay interactive/scrollable.
let tourScrollY = 0;
function lockPageScroll() {
  tourScrollY = window.scrollY;
  document.body.style.position = "fixed";
  document.body.style.top = `-${tourScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}
function unlockPageScroll() {
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  window.scrollTo(0, tourScrollY);
}

function positionTourStep(i, { animate = true } = {}) {
  const step = TOUR_STEPS[i];
  const isPhone = window.matchMedia("(pointer: coarse) and (max-width: 600px)").matches;
  const target = document.querySelector(isPhone && step.mobileTarget ? step.mobileTarget : step.target);
  const highlight = document.getElementById("tour-highlight");
  const card = document.getElementById("tour-card");
  if (!target || !highlight || !card) return;

  const applyPosition = () => {
    const r = target.getBoundingClientRect();
    highlight.style.transition = animate ? "" : "none";
    highlight.style.top = `${r.top - 6}px`;
    highlight.style.left = `${r.left - 6}px`;
    highlight.style.width = `${r.width + 12}px`;
    highlight.style.height = `${r.height + 12}px`;
    if (!animate) requestAnimationFrame(() => { highlight.style.transition = ""; });

    document.getElementById("tour-step-title").textContent = step.title;
    document.getElementById("tour-step-body").textContent = step.body;
    document.getElementById("tour-step-count").textContent = `${i + 1} / ${TOUR_STEPS.length}`;
    document.getElementById("tour-next-btn").textContent = i === TOUR_STEPS.length - 1 ? "Done" : "Next";

    // measure the card's real height now that its text is set (it's taller
    // than it used to be, now that it has the checkbox too), then decide
    // whether it actually fits below the highlighted area or needs to go
    // above instead, so it never ends up overlapping the spotlight itself
    const cardHeight = card.offsetHeight || 230;
    if (isPhone) return; // mobile card is pinned to the bottom via CSS
    const spaceBelow = window.innerHeight - r.bottom - 20;
    const placeAbove = spaceBelow < cardHeight && r.top > cardHeight;
    const cardTop = placeAbove ? r.top - cardHeight - 14 : r.bottom + 14;

    card.style.top = `${Math.max(Math.min(cardTop, window.innerHeight - cardHeight - 14), 14)}px`;
    card.style.left = `${Math.max(Math.min(r.left, window.innerWidth - 300), 14)}px`;
  };

  if (isPhone) {
    // scrollIntoView is async (it animates/settles over one or more
    // frames) - measuring the target's position before it's actually
    // finished moving is exactly what made the spotlight land over the
    // wrong element. Waiting for a couple of frames lets layout settle
    // first, whether or not the browser fires a "scrollend" event.
    target.scrollIntoView({ block: "center", behavior: "auto" });
    let settled = false;
    const finish = () => { if (!settled) { settled = true; requestAnimationFrame(() => requestAnimationFrame(applyPosition)); } };
    target.addEventListener("scrollend", finish, { once: true, passive: true });
    setTimeout(finish, 260); // fallback for browsers without scrollend
  } else {
    applyPosition();
  }
}

function startTour() {
  let i = 0;
  const checkbox = document.getElementById("tour-always-show");
  checkbox.checked = localStorage.getItem("boardly-tour-always") === "1";
  const overlay = document.getElementById("tour-overlay");

  lockPageScroll();
  // Position the very first step BEFORE revealing the overlay (and with
  // its CSS transition disabled) so there's no visible sweep from a
  // stale/zeroed box into place - the first thing the user sees is
  // already correctly framed around the target.
  positionTourStep(i, { animate: false });
  requestAnimationFrame(() => overlay?.classList.remove("hidden"));

  const reposition = () => positionTourStep(i, { animate: false });
  window.addEventListener("resize", reposition);
  window.addEventListener("orientationchange", reposition);

  // Block background touch/scroll while the tour is up, but let the tour
  // card itself and its buttons/checkbox keep working normally.
  const blockScroll = (e) => { if (!e.target.closest("#tour-card")) e.preventDefault(); };
  overlay?.addEventListener("touchmove", blockScroll, { passive: false });
  overlay?.addEventListener("wheel", blockScroll, { passive: false });

  const next = () => {
    i++;
    if (i >= TOUR_STEPS.length) { endTour(); return; }
    positionTourStep(i);
  };
  const end = () => endTour();

  function endTour() {
    overlay?.classList.add("hidden");
    unlockPageScroll();
    window.removeEventListener("resize", reposition);
    window.removeEventListener("orientationchange", reposition);
    overlay?.removeEventListener("touchmove", blockScroll);
    overlay?.removeEventListener("wheel", blockScroll);
    document.getElementById("tour-next-btn").removeEventListener("click", next);
    document.getElementById("tour-skip-btn").removeEventListener("click", end);
    localStorage.setItem("boardly-tour-seen", "1");
    localStorage.setItem("boardly-tour-always", checkbox.checked ? "1" : "0");
  }

  document.getElementById("tour-next-btn").addEventListener("click", next);
  document.getElementById("tour-skip-btn").addEventListener("click", end);
}

function initTour() {
  document.getElementById("replay-tour-btn")?.addEventListener("click", () => {
    document.getElementById("more-menu")?.classList.add("hidden");
    startTour();
  });
  // shows automatically the very first time ever, or on every visit if
  // "Always show this tour" was checked last time
  const neverSeen = !localStorage.getItem("boardly-tour-seen");
  const alwaysShow = localStorage.getItem("boardly-tour-always") === "1";
  // The tour covers too much of a phone-sized board. It remains available
  // from More > Replay quick tour, but never blocks first use on touch.
  const isCompactTouchViewport = window.matchMedia("(pointer: coarse) and (max-width: 600px)").matches;
  if ((neverSeen || alwaysShow) && !isCompactTouchViewport) {
    setTimeout(startTour, 900); // let the board finish its first render/reveal animation
  }
}

// ---------------------------------------------------------------------------
// 5m. QUICK-ADD TEMPLATES & HISTORY (↑ / ↓ to cycle past entries)
// ---------------------------------------------------------------------------

function readTemplates() {
  try { return JSON.parse(localStorage.getItem("boardly-templates") || "[]"); }
  catch { return []; }
}

function renderTemplatesMenu() {
  const templates = readTemplates();
  const list = document.getElementById("templates-list");
  const empty = document.getElementById("templates-empty");
  if (!list) return;
  empty.classList.toggle("hidden", templates.length > 0);
  list.innerHTML = templates
    .map(
      (t, i) => `
    <div class="flex items-center px-3.5 py-2 text-sm hover:bg-[var(--paper-2)] group">
      <button type="button" data-use-template="${i}" class="flex-1 text-left truncate">${escapeHTML(t)}</button>
      <button type="button" data-remove-template="${i}" class="text-ink-soft hover:text-orange opacity-0 group-hover:opacity-100"><i class="fa-solid fa-xmark text-xs"></i></button>
    </div>`
    )
    .join("");
}

function initTemplates() {
  renderTemplatesMenu();
  const btn = document.getElementById("templates-btn");
  const menu = document.getElementById("templates-menu");
  btn?.addEventListener("click", (e) => { e.stopPropagation(); menu?.classList.toggle("hidden"); });
  document.addEventListener("click", () => menu?.classList.add("hidden"));

  document.getElementById("templates-save-btn")?.addEventListener("click", () => {
    const input = document.getElementById("quick-add-input");
    const text = input.value.trim();
    if (!text) { toast("Type something in quick-add first", "error"); return; }
    const templates = readTemplates();
    if (!templates.includes(text)) templates.unshift(text);
    localStorage.setItem("boardly-templates", JSON.stringify(templates.slice(0, 12)));
    renderTemplatesMenu();
    toast("Template saved", "ok");
  });

  document.getElementById("templates-list")?.addEventListener("click", (e) => {
    const useBtn = e.target.closest("[data-use-template]");
    if (useBtn) {
      const templates = readTemplates();
      document.getElementById("quick-add-input").value = templates[Number(useBtn.dataset.useTemplate)] || "";
      document.getElementById("quick-add-input").focus();
      menu?.classList.add("hidden");
      return;
    }
    const removeBtn = e.target.closest("[data-remove-template]");
    if (removeBtn) {
      const templates = readTemplates();
      templates.splice(Number(removeBtn.dataset.removeTemplate), 1);
      localStorage.setItem("boardly-templates", JSON.stringify(templates));
      renderTemplatesMenu();
    }
  });
}

function readQuickAddHistory() {
  try { return JSON.parse(localStorage.getItem("boardly-quickadd-history") || "[]"); }
  catch { return []; }
}

function initQuickAddHistory() {
  state.quickAddHistory = readQuickAddHistory();
  state.quickAddHistoryIndex = state.quickAddHistory.length;

  const input = document.getElementById("quick-add-input");
  input?.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") {
      if (state.quickAddHistoryIndex > 0) {
        state.quickAddHistoryIndex--;
        input.value = state.quickAddHistory[state.quickAddHistoryIndex] || "";
      }
    } else if (e.key === "ArrowDown") {
      if (state.quickAddHistoryIndex < state.quickAddHistory.length - 1) {
        state.quickAddHistoryIndex++;
        input.value = state.quickAddHistory[state.quickAddHistoryIndex] || "";
      } else {
        state.quickAddHistoryIndex = state.quickAddHistory.length;
        input.value = "";
      }
    }
  });
}

function recordQuickAddHistory(raw) {
  const history = readQuickAddHistory();
  history.push(raw);
  const trimmed = history.slice(-30);
  localStorage.setItem("boardly-quickadd-history", JSON.stringify(trimmed));
  state.quickAddHistory = trimmed;
  state.quickAddHistoryIndex = trimmed.length;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 5n. GAMIFICATION moved to js/dashboard-behaviors.js (BADGES,
// levelForCompleted, xpIntoLevel, readCompletionLog, logCompletion,
// currentStreak, renderGamification, resetGamification,
// showLevelUpPopup, checkBoardCleared - all unchanged, just relocated)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5o/5p/5q. BOARD BACKGROUNDS, PRESENTATION MODE, AMBIENT BACKGROUND
// moved to js/dashboard-extras.js (BOARD_BACKGROUNDS, applyBoardBackground,
// renderBoardBgSwatches, togglePresentationMode, startAmbientBackground,
// stopAmbientBackground, initAmbientBackground - all unchanged, just relocated)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5r. CALENDAR VIEW
// ---------------------------------------------------------------------------

let calMonthCursor = new Date();

function renderCalendar() {
  const grid = document.getElementById("cal-grid");
  const label = document.getElementById("cal-month-label");
  if (!grid || !label) return;

  const year = calMonthCursor.getFullYear();
  const month = calMonthCursor.getMonth();
  label.textContent = calMonthCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = toDateStr(new Date());

  const tasksByDate = {};
  state.tasks.forEach((t) => {
    if (!t.due_date) return;
    (tasksByDate[t.due_date] = tasksByDate[t.due_date] || []).push(t);
  });

  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let html = dow.map((d) => `<div class="text-center text-xs font-mono text-ink-soft py-1">${d}</div>`).join("");

  for (let i = 0; i < startOffset; i++) html += `<div></div>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const tasks = tasksByDate[dateStr] || [];
    const isToday = dateStr === todayStr;
    html += `
      <div class="kanban-col p-1.5 min-h-[92px] group/day relative transition-shadow hover:shadow-sm ${isToday ? "ring-2 ring-orange" : ""}">
        <div class="flex items-center justify-between mb-1">
          <p class="text-xs font-mono ${isToday ? "text-orange font-semibold" : "text-ink-soft"}">${day}</p>
          <button type="button" data-add-date="${dateStr}" title="Add a task for this day" class="h-4 w-4 rounded-full flex items-center justify-center text-ink-soft hover:text-orange hover:bg-[var(--paper-2)] transition-opacity opacity-0 group-hover/day:opacity-100"><i class="fa-solid fa-plus text-[9px]"></i></button>
        </div>
        ${tasks.slice(0, 3).map((t) => {
          const time = t.reminder_at && window.Timely ? Timely.formatInZone(t.reminder_at, t.timezone).replace(/\s?[A-Z]{2,5}$/, "") : "";
          return `<div class="edit-target flex items-center gap-1 text-[10px] truncate rounded px-1.5 py-0.5 mb-1 ${t.status === "done" ? "line-through opacity-50" : ""}" style="background:color-mix(in srgb, var(--orange) 12%, transparent)" data-id="${t.id}">
            ${t.critical ? '<i class="fa-solid fa-triangle-exclamation text-[8px] shrink-0" style="color:var(--orange)"></i>' : ""}
            ${time ? `<span class="font-mono shrink-0 opacity-70">${time}</span>` : ""}
            ${t.reminder_at ? '<i class="fa-regular fa-bell text-[8px] shrink-0 opacity-60"></i>' : ""}
            <span class="truncate">${escapeHTML(t.title)}</span>
          </div>`;
        }).join("")}
        ${tasks.length > 3 ? `<p class="text-[9px] text-ink-soft">+${tasks.length - 3} more</p>` : ""}
      </div>`;
  }
  grid.innerHTML = html;

  const unscheduled = state.tasks.filter((t) => !t.due_date && t.status !== "done");
  document.getElementById("cal-unscheduled").innerHTML = unscheduled.length
    ? unscheduled.map((t) => `<div class="edit-target ticket px-3 py-1.5 text-xs cursor-pointer" data-id="${t.id}">${escapeHTML(t.title)}</div>`).join("")
    : `<p class="text-xs text-ink-soft">Nothing unscheduled</p>`;
}

/**
 * Creates a new task due on a specific date, chosen by clicking that day
 * on the calendar - the date is set directly from what was clicked, not
 * parsed from typed text, so there's no need to type "tomorrow" or a
 * weekday name here the way quick-add works elsewhere.
 */
async function quickAddForDate(dateStr) {
  const label = new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });
  const title = await showPromptModal(`Add a task for ${label}`, "");
  if (!title) return;
  await addTask(title, "general", dateStr);
  renderCalendar();
}

function toggleCalendarView(showCalendar) {
  document.getElementById("board").classList.toggle("hidden", showCalendar);
  document.getElementById("calendar-view").classList.toggle("hidden", !showCalendar);
  document.getElementById("calendar-view-btn")?.classList.toggle("active", showCalendar);
  localStorage.setItem("boardly-view", showCalendar ? "calendar" : "board");
  if (showCalendar) renderCalendar();
}

// ---------------------------------------------------------------------------
// 5s. TEMPLATE GALLERY
// ---------------------------------------------------------------------------

const BOARD_TEMPLATES = [
  {
    name: "Sprint planning", icon: "fa-diagram-project",
    tasks: [
      ["Write sprint goal", "work"], ["Groom backlog", "work"], ["Estimate stories", "work"],
      ["Kickoff meeting", "work"], ["Mid-sprint check-in", "work"], ["Sprint review", "work"], ["Retro notes", "work"],
    ],
  },
  {
    name: "Content calendar", icon: "fa-photo-film",
    tasks: [
      ["Brainstorm topics", "general"], ["Draft post 1", "general"], ["Draft post 2", "general"],
      ["Design graphics", "general"], ["Schedule posts", "general"], ["Review analytics", "general"],
    ],
  },
  {
    name: "Job hunt", icon: "fa-briefcase",
    tasks: [
      ["Update resume", "personal"], ["Update portfolio", "personal"], ["Apply: role 1", "personal"],
      ["Apply: role 2", "personal"], ["Prep interview answers", "personal"], ["Send thank-you notes", "personal"],
    ],
  },
  {
    name: "Home renovation", icon: "fa-house-chimney",
    tasks: [
      ["Get quotes", "personal"], ["Pick paint colors", "personal"], ["Order materials", "personal"],
      ["Book contractor", "personal"], ["Clear the room", "personal"], ["Final walkthrough", "personal"],
    ],
  },
  {
    name: "Bug report", icon: "fa-bug",
    tasks: [
      ["Reproduce the bug", "urgent"], ["Write steps to reproduce", "urgent"], ["Identify root cause", "urgent"],
      ["Write the fix", "urgent"], ["Test the fix", "urgent"], ["Deploy & verify in prod", "urgent"],
    ],
  },
  {
    name: "Feature request", icon: "fa-lightbulb",
    tasks: [
      ["Write requirements", "work"], ["Design/mockup", "work"], ["Build it", "work"],
      ["Write tests", "work"], ["Code review", "work"], ["Deploy", "work"], ["Announce it", "work"],
    ],
  },
  {
    name: "Code review checklist", icon: "fa-code-compare",
    tasks: [
      ["Check for tests", "work"], ["Check for security issues", "work"], ["Check naming/readability", "work"],
      ["Check performance impact", "work"], ["Leave feedback", "work"], ["Approve or request changes", "work"],
    ],
  },
];

function renderTemplateGallery() {
  const wrap = document.getElementById("templates-gallery");
  if (!wrap) return;
  wrap.innerHTML = BOARD_TEMPLATES.map(
    (t, i) => `
    <div class="ticket p-4">
      <div class="h-9 w-9 rounded-lg bg-orange/15 flex items-center justify-center mb-2"><i class="fa-solid ${t.icon} text-orange"></i></div>
      <p class="font-display font-semibold mb-1">${t.name}</p>
      <p class="text-xs text-ink-soft mb-3">${t.tasks.length} starter tickets</p>
      <button type="button" data-use-template="${i}" class="toolbar-btn w-full justify-center">Use this template</button>
    </div>`
  ).join("");
}

async function useTemplate(index) {
  if (!state.v2Ready) {
    toast("Run the database migration first, see FEATURES_V2_SETUP.md", "error");
    return;
  }
  const template = BOARD_TEMPLATES[index];
  if (!template) return;
  document.getElementById("templates-modal").classList.add("hidden");

  const { data, error } = await supabaseClient
    .from("boards")
    .insert({ name: template.name, user_id: state.userId })
    .select()
    .single();
  if (error) { toast("Couldn't create board: " + error.message, "error"); return; }

  state.boards.push(data);
  await switchBoard(data.id);
  for (const [title, category] of template.tasks) {
    await addTask(title, category, null);
  }
  toast(`"${template.name}" board created`, "ok");
}

// ---------------------------------------------------------------------------
// 5t. LIVE COLLABORATOR CURSORS
//    Uses Supabase Realtime's presence/broadcast features on the same
//    channel already used for postgres_changes (see initRealtimeSync).
//    Mouse position only, throttled - this is desktop-mouse-only, since
//    touch devices don't have a hover cursor to share.
// ---------------------------------------------------------------------------

let cursorThrottle = null;
function initLiveCursors() {
  const board = document.getElementById("board");
  if (!board) return;

  board.addEventListener("mousemove", (e) => {
    if (!state.realtimeChannel || cursorThrottle) return;
    cursorThrottle = setTimeout(() => (cursorThrottle = null), 60);
    state.realtimeChannel.send({
      type: "broadcast",
      event: "cursor",
      payload: { x: e.clientX, y: e.clientY, name: state.userEmail || "Someone", id: state.userId },
    });
  });
}

function renderRemoteCursor(payload) {
  if (payload.id === state.userId) return;
  const layer = document.getElementById("cursor-layer");
  if (!layer) return;
  let el = document.getElementById(`cursor-${payload.id}`);
  if (!el) {
    el = document.createElement("div");
    el.id = `cursor-${payload.id}`;
    el.className = "absolute transition-all duration-100 ease-linear flex items-center gap-1.5";
    el.innerHTML = `<i class="fa-solid fa-location-crosshairs text-orange"></i><span class="font-mono text-[10px] bg-orange text-white rounded px-1.5 py-0.5 whitespace-nowrap"></span>`;
    layer.appendChild(el);
  }
  el.style.left = `${payload.x}px`;
  el.style.top = `${payload.y}px`;
  el.querySelector("span").textContent = payload.name;
  clearTimeout(el._fadeTimer);
  el._fadeTimer = setTimeout(() => el.remove(), 6000); // remove if they go quiet (closed tab, etc)
}

// ---------------------------------------------------------------------------
// 6. COMMAND PALETTE (Ctrl+K / Cmd+K)
// ---------------------------------------------------------------------------

function openPalette() {
  document.getElementById("cmdk").classList.remove("hidden");
  const input = document.getElementById("cmdk-input");
  input.value = "";
  input.focus();
  renderPaletteResults("");
}
function closePalette() {
  document.getElementById("cmdk").classList.add("hidden");
}

function paletteActions(query) {
  const actions = [
    { label: "Go to Settings", icon: "fa-gear", run: () => (window.location.href = "settings.html") },
    { label: "Log out", icon: "fa-arrow-right-from-bracket", run: () => logout() },
  ];
  if (query.trim()) {
    actions.unshift({
      label: `Add task “${query.trim()}”`,
      icon: "fa-plus",
      run: () => addTask(query.trim(), "general", null),
    });
  }
  return actions.filter((a) => a.label.toLowerCase().includes(query.toLowerCase()) || a.label.startsWith("Add task"));
}

function renderPaletteResults(query) {
  const list = document.getElementById("cmdk-results");
  const actions = paletteActions(query);
  list.innerHTML = actions
    .map(
      (a, i) => `
      <button data-index="${i}" style="animation-delay:${Math.min(i, 8) * 25}ms" class="cmdk-item row-enter w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-[var(--paper-2)] ${i === 0 ? "bg-[var(--paper-2)]" : ""}">
        <i class="fa-solid ${a.icon} w-4 text-ink-soft"></i>${a.label}
      </button>`
    )
    .join("");
  list.querySelectorAll(".cmdk-item").forEach((btn, i) => {
    btn.addEventListener("click", () => {
      actions[i].run();
      closePalette();
    });
  });
}

// ---------------------------------------------------------------------------
// small UI helpers
// ---------------------------------------------------------------------------

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
}

// ---------------------------------------------------------------------------
// 7. BOOT
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  state.userId = session.user.id;
  const name = session.user.user_metadata?.full_name || session.user.email;
  state.userEmail = name;
  document.getElementById("user-name").textContent = name;
  document.getElementById("user-initial").textContent = name.charAt(0).toUpperCase();
  const nameM = document.getElementById("user-name-m");
  const initialM = document.getElementById("user-initial-m");
  if (nameM) nameM.textContent = name;
  if (initialM) initialM.textContent = name.charAt(0).toUpperCase();

  initSortable();
  initOfflineHandling();
  initSwipeGestures();
  await loadBoards();
  initRealtimeSync();
  await loadTasks();
  updateNotifyButton();
  document.querySelectorAll(".dropdown-menu").forEach((menu) => menu.addEventListener("click", (e) => e.stopPropagation()));
  initPreferences();
  initZenMode();
  initKeyboardNav();
  initTemplates();
  initQuickAddHistory();
  initTour();
  renderBoardBgSwatches();
  renderTemplateGallery();
  initAmbientBackground();
  initLiveCursors();

  // ---- level pill / gamification popover ----
  document.getElementById("level-pill")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("progress-popover")?.classList.toggle("hidden");
  });
  document.addEventListener("click", () => document.getElementById("progress-popover")?.classList.add("hidden"));
  document.getElementById("reset-gamification-btn")?.addEventListener("click", resetGamification);

  // ---- board background swatches ----
  document.getElementById("board-bg-swatches")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-bg]");
    if (!btn) return;
    localStorage.setItem(`boardly-bg-${state.currentBoardId}`, btn.dataset.bg);
    applyBoardBackground();
  });

  // ---- ambient background toggle ----
  document.getElementById("ambient-toggle")?.addEventListener("click", () => {
    const on = localStorage.getItem("boardly-ambient") === "1";
    localStorage.setItem("boardly-ambient", on ? "0" : "1");
    document.getElementById("ambient-toggle")?.classList.toggle("active", !on);
    if (on) stopAmbientBackground();
    else startAmbientBackground();
  });

  // ---- presentation mode ----
  document.getElementById("presentation-btn")?.addEventListener("click", () => {
    document.getElementById("more-menu")?.classList.add("hidden");
    togglePresentationMode();
  });
  document.getElementById("exit-presentation-btn")?.addEventListener("click", togglePresentationMode);

  // ---- calendar view ----
  const savedView = localStorage.getItem("boardly-view");
  if (savedView === "calendar") toggleCalendarView(true);
  document.getElementById("calendar-view-btn")?.addEventListener("click", () => {
    toggleCalendarView(document.getElementById("calendar-view")?.classList.contains("hidden"));
  });
  document.getElementById("cal-prev-btn")?.addEventListener("click", () => {
    calMonthCursor.setMonth(calMonthCursor.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById("cal-next-btn")?.addEventListener("click", () => {
    calMonthCursor.setMonth(calMonthCursor.getMonth() + 1);
    renderCalendar();
  });
  document.getElementById("cal-today-btn")?.addEventListener("click", () => {
    calMonthCursor = new Date();
    renderCalendar();
  });
  document.getElementById("cal-grid")?.addEventListener("click", (e) => {
    const addBtn = e.target.closest("[data-add-date]");
    if (addBtn) { quickAddForDate(addBtn.dataset.addDate); return; }
    const target = e.target.closest(".edit-target");
    if (target) openEditModal(target.dataset.id);
  });
  document.getElementById("cal-unscheduled")?.addEventListener("click", (e) => {
    const target = e.target.closest(".edit-target");
    if (target) openEditModal(target.dataset.id);
  });

  // ---- template gallery ----
  document.getElementById("open-templates-btn")?.addEventListener("click", () => {
    document.getElementById("more-menu")?.classList.add("hidden");
    document.getElementById("templates-modal")?.classList.remove("hidden");
  });
  document.querySelectorAll("[data-close-templates-modal]").forEach((el) =>
    el.addEventListener("click", () => document.getElementById("templates-modal")?.classList.add("hidden"))
  );
  document.getElementById("templates-gallery")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-use-template]");
    if (btn) useTemplate(Number(btn.dataset.useTemplate));
  });

  // add-task quick form (top of the To do column)
  document.getElementById("quick-add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("quick-add-input");
    const raw = input.value.trim();
    if (!raw) return;
    const { title, category, platform, dueDate } = parseQuickAdd(raw);
    input.value = "";
    document.getElementById("quick-add-hint")?.classList.add("hidden");
    recordQuickAddHistory(raw);
    addTask(title || raw, category, dueDate, platform);
  });

  // live hint showing what quick-add understood, as you type
  document.getElementById("quick-add-input")?.addEventListener("input", (e) => {
    const hint = document.getElementById("quick-add-hint");
    if (!hint) return;
    const raw = e.target.value.trim();
    if (!raw) { hint.classList.add("hidden"); return; }
    const { category, platform, dueDate } = parseQuickAdd(raw);
    if (!dueDate && category === "general" && !platform) { hint.classList.add("hidden"); return; }
    const parts = [];
    if (dueDate) {
      const d = new Date(dueDate + "T00:00:00");
      parts.push(`<i class="fa-regular fa-clock"></i> ${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`);
    }
    if (platform && PLATFORM_META[platform]) parts.push(`<i class="${PLATFORM_META[platform].icon}"></i> ${PLATFORM_META[platform].label}`);
    if (category !== "general") parts.push(`<i class="fa-solid fa-tag"></i> ${CATEGORY_LABEL[category] || category}`);
    hint.innerHTML = parts.join("&nbsp;&nbsp;");
    hint.classList.remove("hidden");
  });

  // event delegation for check + delete + select-box + click-to-edit
  // (cards re-render often, so one listener on the board covers all of them)
  document.getElementById("board").addEventListener("click", (e) => {
    const check = e.target.closest(".check-btn");
    if (check) return toggleComplete(check.dataset.id);
    const del = e.target.closest(".delete-btn");
    if (del) return deleteTask(del.dataset.id);
    const selectBox = e.target.closest(".select-box");
    if (selectBox) return toggleSelect(selectBox.dataset.id);
    if (state.bulkMode) {
      const card = e.target.closest(".ticket[data-id]");
      if (card) return toggleSelect(card.dataset.id);
      return;
    }
    const editTarget = e.target.closest(".edit-target");
    if (editTarget) return openEditModal(editTarget.dataset.id);
  });

  // ---- toolbar: search / clear / bulk select / export / import / print / notify ----
  const searchInput = document.getElementById("board-search");
  const searchClear = document.getElementById("board-search-clear");
  // renderBoard() rebuilds every column's innerHTML plus the progress
  // ring/donut/gamification checks - firing that on every keystroke is
  // what made typing here feel like it was fighting the page (visible
  // jank/scroll-jump, worst on phones). Text + clear button still update
  // instantly; only the heavy re-render trails the keystrokes slightly.
  let searchDebounceTimer = null;
  searchInput?.addEventListener("input", (e) => {
    state.filterQuery = e.target.value;
    searchClear.classList.toggle("hidden", !state.filterQuery);
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(renderBoard, 150);
  });
  searchClear?.addEventListener("click", () => {
    clearTimeout(searchDebounceTimer);
    searchInput.value = "";
    state.filterQuery = "";
    searchClear.classList.add("hidden");
    renderBoard();
    searchInput.focus();
  });

  document.getElementById("bulk-toggle-btn")?.addEventListener("click", () => toggleBulkMode());
  document.getElementById("bulk-cancel-btn")?.addEventListener("click", () => toggleBulkMode(false));
  document.getElementById("bulk-select-all-btn")?.addEventListener("click", toggleSelectAllVisible);
  document.getElementById("bulk-move-btn")?.addEventListener("click", () => {
    bulkMoveSelected(document.getElementById("bulk-move-select").value);
  });
  document.getElementById("bulk-delete-btn")?.addEventListener("click", bulkDeleteSelected);

  const exportBtn = document.getElementById("export-btn");
  const exportMenu = document.getElementById("export-menu");
  exportBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle("hidden");
    if (!exportMenu.classList.contains("hidden")) clampDropdownToViewport(exportMenu);
  });
  exportMenu?.querySelectorAll("[data-export]").forEach((btn) => {
    btn.addEventListener("click", () => {
      exportBoard(btn.dataset.export);
      exportMenu.classList.add("hidden");
    });
  });
  document.addEventListener("click", () => exportMenu?.classList.add("hidden"));

  document.getElementById("import-btn")?.addEventListener("click", openImportModal);
  document.getElementById("import-confirm-btn")?.addEventListener("click", importPastedTasks);
  document.querySelectorAll("[data-close-import]").forEach((el) => el.addEventListener("click", closeImportModal));

  document.getElementById("print-btn")?.addEventListener("click", () => window.print());
  document.getElementById("notify-btn")?.addEventListener("click", toggleDueSoonNotifications);

  // ---- click-to-edit modal wiring ----
  document.querySelectorAll("[data-close-edit]").forEach((el) => el.addEventListener("click", closeEditModal));
  document.getElementById("edit-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    saveEditedTask();
  });
  document.getElementById("edit-delete-btn")?.addEventListener("click", () => {
    const id = state.editingId;
    closeEditModal();
    if (id) deleteTask(id);
  });
  document.getElementById("edit-clear-date")?.addEventListener("click", () => {
    document.getElementById("edit-due-date").value = "";
  });
  document.getElementById("edit-clear-reminder")?.addEventListener("click", () => {
    document.getElementById("edit-reminder-at").value = "";
    document.getElementById("edit-reminder-repeat").value = "";
  });

  // ---- native share sheet (works great on iOS - this is the direction
  //      Apple actually supports well, unlike receiving inbound shares) ----
  document.getElementById("edit-share-btn")?.addEventListener("click", async () => {
    const task = state.tasks.find((t) => t.id === state.editingId);
    if (!task) return;
    const text = [task.title, task.notes, task.published_url].filter(Boolean).join("\n\n");
    if (navigator.share) {
      try { await navigator.share({ title: task.title, text }); }
      catch (err) { /* user cancelled the share sheet - not an error */ }
    } else {
      try { await navigator.clipboard.writeText(text); toast("Copied - paste it anywhere", "ok"); }
      catch { toast("Couldn't share or copy in this browser", "error"); }
    }
  });

  // ---- platform + caption/notes ----
  document.getElementById("edit-platform")?.addEventListener("change", updatePlatformHint);
  document.getElementById("edit-notes")?.addEventListener("input", updateNotesCount);
  const captionMenu = document.getElementById("edit-notes-templates-menu");
  document.getElementById("edit-notes-templates-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (captionMenu?.classList.contains("hidden")) renderCaptionTemplatesMenu();
    captionMenu?.classList.toggle("hidden");
    if (captionMenu && !captionMenu.classList.contains("hidden")) clampDropdownToViewport(captionMenu);
  });
  document.addEventListener("click", () => captionMenu?.classList.add("hidden"));
  document.getElementById("edit-notes-save-template-btn")?.addEventListener("click", () => {
    const text = document.getElementById("edit-notes").value.trim();
    if (!text) { toast("Write something in the caption box first", "error"); return; }
    const templates = loadCaptionTemplates();
    templates.unshift(text);
    saveCaptionTemplates(templates);
    renderCaptionTemplatesMenu();
    toast("Snippet saved", "ok");
  });
  document.getElementById("edit-notes-templates-list")?.addEventListener("click", (e) => {
    const useBtn = e.target.closest("[data-use-caption-template]");
    if (useBtn) {
      const templates = loadCaptionTemplates();
      const text = templates[Number(useBtn.dataset.useCaptionTemplate)];
      const notesEl = document.getElementById("edit-notes");
      if (text && notesEl) {
        notesEl.value = notesEl.value ? `${notesEl.value}\n${text}` : text;
        updateNotesCount();
      }
      captionMenu?.classList.add("hidden");
      return;
    }
    const removeBtn = e.target.closest("[data-remove-caption-template]");
    if (removeBtn) {
      const templates = loadCaptionTemplates();
      templates.splice(Number(removeBtn.dataset.removeCaptionTemplate), 1);
      saveCaptionTemplates(templates);
      renderCaptionTemplatesMenu();
    }
  });

  // ---- location-based (geofence) reminder ----
  document.getElementById("edit-geo-use-location")?.addEventListener("click", () => {
    if (!("geolocation" in navigator)) { toast("Location isn't available in this browser", "error"); return; }
    const btn = document.getElementById("edit-geo-use-location");
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i>Finding you…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.editingGeo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        document.getElementById("edit-geo-fields").classList.remove("hidden");
        document.getElementById("edit-geo-clear").classList.remove("hidden");
        btn.innerHTML = '<i class="fa-solid fa-location-dot mr-1.5"></i>Update to my current location';
        toast("Got your location", "ok");
      },
      () => { btn.innerHTML = originalHtml; toast("Couldn't get your location - check permission", "error"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
  document.getElementById("edit-geo-clear")?.addEventListener("click", () => {
    state.editingGeo = null;
    document.getElementById("edit-geo-fields").classList.add("hidden");
    document.getElementById("edit-geo-clear").classList.add("hidden");
    document.getElementById("edit-geo-use-location").innerHTML = '<i class="fa-solid fa-location-crosshairs mr-1.5"></i>Use my current location';
  });

  // ---- post preview mockup ----
  document.getElementById("edit-preview-post-btn")?.addEventListener("click", () => openPostPreview());
  document.getElementById("edit-notes-markdown-toggle")?.addEventListener("click", toggleMarkdownPreview);
  document.getElementById("post-preview-modal")?.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-post-preview]")) document.getElementById("post-preview-modal").classList.add("hidden");
  });

  // ---- dev fields: time tracking + blocked-by ----
  document.getElementById("edit-time-toggle-btn")?.addEventListener("click", () => {
    if (state.editingId) toggleTimeTracking(state.editingId);
  });
  document.getElementById("edit-time-reset-btn")?.addEventListener("click", () => {
    if (state.editingId) resetTimeTracking(state.editingId);
  });
  document.getElementById("edit-blocked-by")?.addEventListener("change", (e) => {
    const task = state.tasks.find((t) => t.id === state.editingId);
    const warning = document.getElementById("edit-blocked-warning");
    const blocker = state.tasks.find((t) => t.id === e.target.value);
    warning?.classList.toggle("hidden", !blocker || blocker.status === "done");
  });

  // ---- board switcher ----
  const boardMenu = document.getElementById("board-switcher-menu");
  document.getElementById("board-switcher-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    boardMenu?.classList.toggle("hidden");
  });
  document.addEventListener("click", () => boardMenu?.classList.add("hidden"));
  document.getElementById("board-switcher-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-switch-board]");
    if (btn) switchBoard(btn.dataset.switchBoard);
  });
  document.getElementById("board-new-btn")?.addEventListener("click", createBoard);
  // ---- work type (multi-vertical terminology) ----
  const workTypeMenu = document.getElementById("work-type-menu");
  document.getElementById("work-type-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    workTypeMenu?.classList.toggle("hidden");
  });
  document.addEventListener("click", () => workTypeMenu?.classList.add("hidden"));
  document.getElementById("work-type-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-set-work-type]");
    if (btn) { workTypeMenu?.classList.add("hidden"); setBoardWorkType(btn.dataset.setWorkType); }
  });
  // ---- AI brief (per-board custom instructions for the assistant) ----
  const aiBriefModal = document.getElementById("ai-brief-modal");
  const aiBriefTextarea = document.getElementById("ai-brief-textarea");
  document.getElementById("ai-brief-open-btn")?.addEventListener("click", () => {
    document.getElementById("more-menu")?.classList.add("hidden");
    const board = state.boards.find((b) => b.id === state.currentBoardId);
    aiBriefTextarea.value = board?.ai_brief || "";
    aiBriefModal?.classList.remove("hidden");
  });
  aiBriefModal?.querySelectorAll("[data-close-ai-brief]").forEach((el) =>
    el.addEventListener("click", () => aiBriefModal.classList.add("hidden"))
  );
  document.getElementById("ai-brief-save-btn")?.addEventListener("click", async () => {
    const board = state.boards.find((b) => b.id === state.currentBoardId);
    if (!board) return;
    const value = aiBriefTextarea.value.trim();
    board.ai_brief = value || null; // optimistic
    aiBriefModal?.classList.add("hidden");
    const { error } = await supabaseClient.from("boards").update({ ai_brief: value || null }).eq("id", board.id);
    toast(error ? "Couldn't save: " + error.message : "AI brief saved for this board", error ? "error" : "ok");
  });
  const templateMenu = document.getElementById("board-template-menu");
  document.getElementById("board-template-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    templateMenu?.classList.toggle("hidden");
    if (templateMenu && !templateMenu.classList.contains("hidden")) clampDropdownToViewport(templateMenu);
  });
  templateMenu?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-template]");
    if (btn) { templateMenu.classList.add("hidden"); createBoardFromTemplate(btn.dataset.template); }
  });
  document.getElementById("board-rename-btn")?.addEventListener("click", renameBoard);
  document.getElementById("board-share-btn")?.addEventListener("click", toggleBoardShare);
  document.getElementById("board-unshare-btn")?.addEventListener("click", makeBoardPrivate);
  document.getElementById("board-delete-btn")?.addEventListener("click", deleteBoard);

  // ---- checklist / subtasks inside the edit modal ----
  document.getElementById("edit-subtask-add-btn")?.addEventListener("click", () => {
    const input = document.getElementById("edit-subtask-input");
    const text = input.value.trim();
    if (!text) return;
    state.editingSubtasks.push({ text, done: false });
    input.value = "";
    renderEditSubtasks();
  });
  document.getElementById("edit-subtask-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("edit-subtask-add-btn").click(); }
  });
  document.getElementById("edit-subtasks-list")?.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest("[data-subtask-toggle]");
    if (toggleBtn) {
      const i = Number(toggleBtn.dataset.subtaskToggle);
      state.editingSubtasks[i].done = !state.editingSubtasks[i].done;
      renderEditSubtasks();
      return;
    }
    const removeBtn = e.target.closest("[data-subtask-remove]");
    if (removeBtn) {
      state.editingSubtasks.splice(Number(removeBtn.dataset.subtaskRemove), 1);
      renderEditSubtasks();
    }
  });

  // ---- attachment remove/download (inside edit modal) - one list, click delegation ----
  document.getElementById("edit-attachment-list")?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-remove-attachment]");
    if (removeBtn && state.editingId) { removeAttachmentAt(state.editingId, Number(removeBtn.dataset.removeAttachment)); return; }
    const downloadBtn = e.target.closest("[data-download-attachment]");
    if (downloadBtn && state.editingId) {
      const task = state.tasks.find((t) => t.id === state.editingId);
      const item = task && taskAttachmentList(task)[Number(downloadBtn.dataset.downloadAttachment)];
      if (item) downloadAttachment(item.url, item.name);
    }
  });

  // ---- attachment upload - fires the moment file(s) are picked, not
  //      just on Save, so it doesn't silently require a valid title too ----
  document.getElementById("edit-attachment-file")?.addEventListener("change", (e) => {
    if (e.target.files.length && state.editingId) uploadAttachments(state.editingId, [...e.target.files]);
    e.target.value = "";
  });
  document.getElementById("edit-attachment-camera-btn")?.addEventListener("click", () => {
    document.getElementById("edit-attachment-camera")?.click();
  });
  document.getElementById("edit-attachment-camera")?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file && state.editingId) uploadAttachment(state.editingId, file);
    e.target.value = "";
  });
  document.getElementById("edit-attachment-url-add")?.addEventListener("click", () => {
    const url = document.getElementById("edit-attachment-url").value.trim();
    if (url && state.editingId) attachLinkToTask(state.editingId, url);
  });
  document.getElementById("edit-attachment-url")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("edit-attachment-url-add").click(); }
  });
  initAttachmentPaste();
  document.getElementById("edit-attachment-paste-btn")?.addEventListener("click", pasteAttachmentFromClipboard);

  // ---- AI assistant panel ----
  document.getElementById("ai-assistant-btn")?.addEventListener("click", () => {
    document.getElementById("ai-panel")?.classList.remove("hidden");
  });
  document.querySelectorAll("[data-close-ai]").forEach((el) =>
    el.addEventListener("click", () => document.getElementById("ai-panel")?.classList.add("hidden"))
  );
  document.getElementById("ai-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("ai-input");
    const message = input.value.trim();
    if (!message) return;
    input.value = "";
    sendAIMessage(message);
  });

  document.getElementById("logout-btn").addEventListener("click", logout);
  const logoutMobile = document.getElementById("logout-btn-mobile");
  if (logoutMobile) logoutMobile.addEventListener("click", logout);

  // command palette wiring
  document.getElementById("open-cmdk-btn").addEventListener("click", openPalette);
  document.getElementById("open-cmdk-btn-mobile-top")?.addEventListener("click", openPalette);
  const openCmdkMobile = document.getElementById("open-cmdk-btn-mobile");
  if (openCmdkMobile) openCmdkMobile.addEventListener("click", () => {
    document.getElementById("mobile-menu").dataset.open = "false";
    document.body.style.overflow = "";
    openPalette();
  });
  document.getElementById("cmdk-backdrop").addEventListener("click", closePalette);
  document.getElementById("cmdk-input").addEventListener("input", (e) => renderPaletteResults(e.target.value));
  document.getElementById("cmdk-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = document.querySelector(".cmdk-item");
      if (first) first.click();
    }
    if (e.key === "Escape") closePalette();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openPalette();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
      if (typing) return;
      e.preventDefault();
      undoLastAction();
    }
  });

  // ---- extra keyboard shortcuts: N (new task), V (voice), ? (help) ----
  // Skipped while typing in any input/textarea, except Escape, which
  // should always be able to close whatever's open.
  document.addEventListener("keydown", (e) => {
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
    if (e.key === "Escape") { closeShortcuts(); closeEditModal(); closeImportModal(); document.getElementById("ai-panel")?.classList.add("hidden"); document.getElementById("prompt-modal")?.classList.add("hidden"); document.getElementById("templates-modal")?.classList.add("hidden"); document.getElementById("progress-popover")?.classList.add("hidden"); if (!document.getElementById("confirm-modal")?.classList.contains("hidden")) document.querySelector("[data-close-confirm]")?.click(); if (document.body.classList.contains("presentation-mode")) togglePresentationMode(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "n") {
      e.preventDefault();
      document.getElementById("quick-add-input")?.focus();
    } else if (e.key === "v") {
      e.preventDefault();
      document.getElementById("voice-add-btn")?.click();
    } else if (e.key === "?") {
      e.preventDefault();
      openShortcuts();
    }
  });
  document.getElementById("open-shortcuts-btn")?.addEventListener("click", openShortcuts);
  document.querySelectorAll("[data-close-shortcuts]").forEach((el) => el.addEventListener("click", closeShortcuts));

  initVoiceAdd();
  initServiceWorkerMessages();
  initPullToRefresh();
  handleIncomingShareOrShortcut();

  document.getElementById("copy-summary-btn")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(boardSummaryText());
      toast("Board summary copied to clipboard", "success");
    } catch (err) {
      toast("Couldn't copy - your browser blocked clipboard access", "error");
    }
  });

  document.getElementById("daily-briefing-btn")?.addEventListener("click", runDailyBriefing);
  document.getElementById("qr-handoff-btn")?.addEventListener("click", openQrHandoff);
  document.getElementById("qr-handoff-modal")?.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-qr]")) document.getElementById("qr-handoff-modal").classList.add("hidden");
  });
});

function openShortcuts() { document.getElementById("shortcuts-modal")?.classList.remove("hidden"); }
function closeShortcuts() { document.getElementById("shortcuts-modal")?.classList.add("hidden"); }

/* ---------------------------------------------------------------------
   SHARE-TO-BOARDLY - the "New ticket" home-screen shortcut already in
   manifest.json links to dashboard.html?new=1; manifest.json's
   share_target sends anything shared from another app (a link, some
   selected text) to dashboard.html?title=&text=&url=. Both just needed
   something on this end to actually read them, which is what this does:
   drop straight into the quick-add box, pre-filled, for a one-tap
   confirm rather than silently auto-creating a ticket sight-unseen.
--------------------------------------------------------------------- */
function handleIncomingShareOrShortcut() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("new") && !params.has("title") && !params.has("text") && !params.has("url")) return;

  const input = document.getElementById("quick-add-input");
  const shared = [params.get("title"), params.get("text")].filter(Boolean).join(" — ");
  const url = params.get("url");
  if (input) {
    input.value = shared || url || "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
    if (url && shared) toast("Tip: use the link field in Edit ticket to attach that URL", "ok");
  }
  // Clean the URL so refreshing/sharing it again doesn't re-trigger this.
  window.history.replaceState({}, "", window.location.pathname);
}

/* ---------------------------------------------------------------------
   QR QUICK HANDOFF - "I'm at my desk, I want this exact board open on
   my phone in two seconds" without typing a URL or emailing yourself a
   link. Loads the qrcode.js library lazily from cdnjs, only when the
   button is actually pressed, so it costs nothing for people who never
   use it.
--------------------------------------------------------------------- */
let qrLibPromise = null;
function loadQrLib() {
  if (window.QRCode) return Promise.resolve();
  if (qrLibPromise) return qrLibPromise;
  qrLibPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return qrLibPromise;
}
async function openQrHandoff() {
  const modal = document.getElementById("qr-handoff-modal");
  const box = document.getElementById("qr-handoff-code");
  if (!modal || !box) return;
  modal.classList.remove("hidden");
  box.innerHTML = `<p class="text-xs text-ink-soft">Loading…</p>`;
  try {
    await loadQrLib();
    box.innerHTML = "";
    new QRCode(box, { text: window.location.href, width: 200, height: 200, colorDark: "#12203A", colorLight: "#ffffff" });
  } catch {
    box.innerHTML = `<p class="text-xs text-ink-soft">Couldn't load the QR code - check your connection.</p>`;
  }
}

/* ---------------------------------------------------------------------
   DAILY AI BRIEFING - one tap, reuses the existing board-assistant edge
   function (same one the AI chat panel already talks to) with a fixed
   prompt asking it to look at today's board and tell you what actually
   matters first. Degrades to a plain toast telling you where to set it
   up if that function isn't deployed yet.
--------------------------------------------------------------------- */
async function runDailyBriefing() {
  document.getElementById("ai-panel")?.classList.remove("hidden");
  await sendAIMessage("Give me a short daily briefing: what should I prioritize today, what's overdue, and anything time-sensitive coming up. Keep it to a few sentences, plain language, no headers.");
}

/* ---------------------------------------------------------------------
   VOICE QUICK-ADD - progressive enhancement on top of the Web Speech
   API. The mic button stays hidden (see the "hidden" class already on
   it in the HTML) on any browser that doesn't support
   SpeechRecognition, so nothing ever shows a button that wouldn't work.
--------------------------------------------------------------------- */
function initVoiceAdd() {
  const btn = document.getElementById("voice-add-btn");
  const input = document.getElementById("quick-add-input");
  if (!btn || !input) return;
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) return;
  btn.classList.remove("hidden");

  const recognition = new SpeechRecognitionCtor();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";
  let listening = false;

  btn.addEventListener("click", () => {
    if (listening) { recognition.stop(); return; }
    try { recognition.start(); } catch (err) { /* already starting - ignore */ }
  });
  recognition.addEventListener("start", () => { listening = true; btn.classList.add("voice-listening"); });
  recognition.addEventListener("end", () => { listening = false; btn.classList.remove("voice-listening"); });
  recognition.addEventListener("error", () => { listening = false; btn.classList.remove("voice-listening"); });
  recognition.addEventListener("result", (e) => {
    input.value = e.results[0][0].transcript;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  });
}
