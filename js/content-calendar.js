/* ==========================================================================
   BOARDLY - content-calendar.js  ("Content Calendar" v1)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/content-calendar.js"></script>

   Needs NOTHING new in Supabase - fifth sibling of control-tower.js,
   classroom.js, dispatch.js and care-rounds.js, for the new Social
   Media vertical (TERMINOLOGY.social_media / VERTICAL_FIELDS.social_media
   in dashboard.js: Idea → In Production → Published, plus a Campaign
   field). It only ever appears on boards whose type is social_media,
   or that have at least one task individually set to it - see
   effectiveWorkType() in dashboard.js and
   schema_v28_task_type_override.sql.

   WHAT'S DIFFERENT FROM THE OTHER THREE: social/content tasks already
   had a real "who's this for" field years before this view existed -
   Platform (task.platform, PLATFORM_META in dashboard.js), from
   Boardly's existing platform-tagging feature. So instead of adding
   yet another new field to group by, Content Calendar groups by that
   existing platform field - Instagram, TikTok, LinkedIn, and so on -
   sorted within each platform by due date (its publish date), overdue
   first.

   It also reuses two existing "Pro" columns rather than inventing new
   metadata keys: published_url and performance_note (already built
   for exactly this - "Link to the live post" / "Quick note, e.g. 2.4k
   views, 180 likes", schema_v11 or whichever migration first added
   proReady). Marking a piece published here offers to fill both in,
   right at the moment you'd actually have that link in hand.
   ========================================================================== */

function isSocialMediaBoard() {
  const board = state.boards.find((b) => b.id === state.currentBoardId);
  if ((board?.work_type || "general") === "social_media") return true;
  return state.tasks.some((t) => effectiveWorkType(t) === "social_media");
}

function updateContentCalendarButtonVisibility() {
  document.getElementById("content-calendar-btn")?.classList.toggle("hidden", !isSocialMediaBoard());
}

/** Wraps applyTerminology - chains safely with every other vertical view's
 *  own wrap of the same function (file 2g pattern). */
const _originalApplyTerminologyForContentCalendar = window.applyTerminology;
if (typeof _originalApplyTerminologyForContentCalendar === "function") {
  window.applyTerminology = function (...args) {
    const result = _originalApplyTerminologyForContentCalendar.apply(this, args);
    updateContentCalendarButtonVisibility();
    return result;
  };
}

/** Also wraps renderBoard, needed since a single task's type can change
 *  without a board switch happening at all (chains safely with every
 *  other renderBoard wrap in this project, same 2g pattern). */
const _originalRenderBoardForContentCalendar = window.renderBoard;
if (typeof _originalRenderBoardForContentCalendar === "function") {
  window.renderBoard = function (...args) {
    const result = _originalRenderBoardForContentCalendar.apply(this, args);
    updateContentCalendarButtonVisibility();
    return result;
  };
}

state.contentCalendarQuery = "";

function activeContent() {
  const q = state.contentCalendarQuery.trim().toLowerCase();
  let content = state.tasks.filter((t) => t.status !== "done" && effectiveWorkType(t) === "social_media");
  if (q) {
    content = content.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      (t.metadata?.campaign_name || "").toLowerCase().includes(q) ||
      (PLATFORM_META[t.platform]?.label || "").toLowerCase().includes(q)
    );
  }
  return content.slice().sort((a, b) => {
    const overdueA = isOverdue(a.due_date, a.status), overdueB = isOverdue(b.due_date, b.status);
    if (overdueA !== overdueB) return overdueA ? -1 : 1;
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return new Date(a.due_date) - new Date(b.due_date);
  });
}

function contentCalendarPublishedTodayCount() {
  const today = new Date().toDateString();
  return state.tasks.filter((t) => t.status === "done" && t.done_at && new Date(t.done_at).toDateString() === today && effectiveWorkType(t) === "social_media").length;
}

function platformKey(task) {
  return PLATFORM_META[task.platform]?.label || "No platform set";
}

function renderContentCalendar() {
  const list = document.getElementById("content-calendar-list");
  const empty = document.getElementById("content-calendar-empty");
  const platformsWrap = document.getElementById("content-calendar-platforms");
  const statsEl = document.getElementById("content-calendar-stats");
  if (!list) return;

  const content = activeContent();
  const overdueCount = content.filter((t) => isOverdue(t.due_date, t.status)).length;
  const publishedToday = contentCalendarPublishedTodayCount();
  statsEl.textContent = `${content.length} active ${content.length === 1 ? "piece" : "pieces"}${overdueCount ? ` · ${overdueCount} overdue` : ""} · ${publishedToday} published today`;

  if (!content.length) {
    list.innerHTML = ""; platformsWrap.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const byPlatform = new Map();
  content.forEach((t) => {
    const key = platformKey(t);
    if (!byPlatform.has(key)) byPlatform.set(key, []);
    byPlatform.get(key).push(t);
  });
  const sortedPlatforms = Array.from(byPlatform.keys()).sort((a, b) => a === "No platform set" ? 1 : b === "No platform set" ? -1 : a.localeCompare(b));

  platformsWrap.innerHTML = sortedPlatforms.map((p) =>
    `<span class="meta-chip text-ink-soft"><i class="fa-solid fa-hashtag"></i>${escapeHTML(p)} · ${byPlatform.get(p).length}</span>`
  ).join("");

  list.innerHTML = sortedPlatforms.map((p) => `
    <p class="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mt-3 mb-1.5 first:mt-0">${escapeHTML(p)}</p>
    ${byPlatform.get(p).map(contentCalendarRowHTML).join("")}
  `).join("");
}

function contentCalendarRowHTML(t) {
  const overdue = isOverdue(t.due_date, t.status);
  const campaign = t.metadata?.campaign_name || "";
  const platformMeta = PLATFORM_META[t.platform];
  return `
    <div class="ticket p-2.5" data-cc-task="${t.id}">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">${escapeHTML(t.title)}</p>
          ${campaign ? `<p class="text-[11px] text-ink-soft truncate"><i class="fa-solid fa-bullhorn w-3"></i> ${escapeHTML(campaign)}</p>` : ""}
        </div>
        ${t.due_date ? `<span class="meta-chip shrink-0 ${overdue ? "text-critical" : "text-ink-soft"}">${overdue ? "Overdue" : escapeHTML(t.due_date)}</span>` : ""}
      </div>
      <div class="flex items-center gap-2 mt-2">
        <button type="button" class="btn btn-primary text-xs !py-1.5 !px-3" data-cc-publish="${t.id}"><i class="fa-solid fa-check mr-1"></i>Mark published</button>
        ${t.published_url ? `<a href="${escapeHTML(t.published_url)}" target="_blank" rel="noopener" class="btn btn-ghost text-xs !py-1.5 !px-3"><i class="fa-solid fa-arrow-up-right-from-square mr-1"></i>View</a>` : ""}
        <button type="button" class="btn btn-ghost text-xs !py-1.5 !px-3" data-cc-open="${t.id}">Open</button>
      </div>
      <div class="hidden mt-2 flex flex-col gap-1.5" data-cc-publish-box="${t.id}">
        <input type="url" placeholder="Link to the live post (optional)" class="input text-sm w-full" data-cc-url-input="${t.id}" />
        <input type="text" placeholder="Quick note, e.g. 2.4k views (optional)" class="input text-sm w-full" data-cc-note-input="${t.id}" />
        <button type="button" class="btn btn-secondary text-xs !py-1.5 !px-3" data-cc-publish-confirm="${t.id}">Confirm published</button>
      </div>
    </div>`;
}

async function publishAndComplete(taskId, publishedUrl, performanceNote) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  if (state.proReady && (publishedUrl || performanceNote)) {
    const payload = {};
    if (publishedUrl) { task.published_url = publishedUrl; payload.published_url = publishedUrl; }
    if (performanceNote) { task.performance_note = performanceNote; payload.performance_note = performanceNote; }
    const { error } = await runOrQueue({ type: "update", table: "tasks", id: taskId, payload }, () =>
      supabaseClient.from("tasks").update(payload).eq("id", taskId)
    );
    if (error) { toast("Couldn't save the post link/note: " + error.message, "error"); return; }
  }

  await toggleComplete(taskId);
  renderContentCalendar();
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("content-calendar-modal");

  document.getElementById("content-calendar-btn")?.addEventListener("click", () => {
    modal?.classList.remove("hidden");
    state.contentCalendarQuery = "";
    const search = document.getElementById("content-calendar-search");
    if (search) search.value = "";
    renderContentCalendar();
  });
  document.querySelectorAll("[data-close-content-calendar]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("content-calendar-search")?.addEventListener("input", (e) => {
    state.contentCalendarQuery = e.target.value;
    renderContentCalendar();
  });

  document.getElementById("content-calendar-list")?.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-cc-open]");
    if (openBtn) {
      modal?.classList.add("hidden");
      openEditModal(openBtn.dataset.ccOpen);
      return;
    }
    const publishBtn = e.target.closest("[data-cc-publish]");
    if (publishBtn) {
      document.querySelector(`[data-cc-publish-box="${publishBtn.dataset.ccPublish}"]`)?.classList.remove("hidden");
      return;
    }
    const confirmBtn = e.target.closest("[data-cc-publish-confirm]");
    if (confirmBtn) {
      const taskId = confirmBtn.dataset.ccPublishConfirm;
      const urlInput = document.querySelector(`[data-cc-url-input="${taskId}"]`);
      const noteInput = document.querySelector(`[data-cc-note-input="${taskId}"]`);
      publishAndComplete(taskId, urlInput?.value.trim() || "", noteInput?.value.trim() || "");
    }
  });

  updateContentCalendarButtonVisibility();
});
