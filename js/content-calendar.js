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

function truncateCaption(text, maxLength = 80) {
  return text.length > maxLength ? text.slice(0, maxLength).trimEnd() + "…" : text;
}

function contentCalendarRowHTML(t) {
  const overdue = isOverdue(t.due_date, t.status);
  const campaign = t.metadata?.campaign_name || "";
  const pillar = t.metadata?.content_pillar || "";
  const format = t.metadata?.post_format || "";
  const caption = t.metadata?.caption || "";
  return `
    <div class="ticket p-2.5" data-cc-task="${t.id}">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">${escapeHTML(t.title)}</p>
          <div class="flex flex-wrap gap-1.5 mt-1">
            ${campaign ? `<span class="meta-chip text-ink-soft"><i class="fa-solid fa-bullhorn"></i>${escapeHTML(campaign)}</span>` : ""}
            ${pillar ? `<span class="meta-chip text-ink-soft"><i class="fa-solid fa-layer-group"></i>${escapeHTML(pillar)}</span>` : ""}
            ${format ? `<span class="meta-chip text-ink-soft"><i class="fa-solid fa-photo-film"></i>${escapeHTML(format)}</span>` : ""}
          </div>
          ${caption ? `
            <div class="flex items-start gap-1.5 mt-1.5">
              <p class="text-xs text-ink-soft flex-1">${escapeHTML(truncateCaption(caption))}</p>
              <button type="button" data-cc-copy-caption="${t.id}" title="Copy caption" class="btn-icon-xs shrink-0"><i class="fa-regular fa-copy"></i></button>
            </div>` : ""}
        </div>
        ${t.due_date ? `<span class="meta-chip shrink-0 ${overdue ? "text-critical" : "text-ink-soft"}">${overdue ? "Overdue" : escapeHTML(t.due_date)}</span>` : ""}
      </div>
      <div class="flex items-center gap-2 mt-2">
        <button type="button" class="btn btn-primary text-xs !py-1.5 !px-3" data-cc-publish="${t.id}"><i class="fa-solid fa-check mr-1"></i>Mark published</button>
        ${t.published_url ? `<a href="${escapeHTML(t.published_url)}" target="_blank" rel="noopener" class="btn btn-ghost text-xs !py-1.5 !px-3"><i class="fa-solid fa-arrow-up-right-from-square mr-1"></i>View</a>` : ""}
        <button type="button" class="btn btn-ghost text-xs !py-1.5 !px-3" data-cc-preview="${t.id}"><i class="fa-solid fa-eye mr-1"></i>Preview</button>
        <button type="button" class="btn btn-ghost text-xs !py-1.5 !px-3" data-cc-share="${t.id}"><i class="fa-solid fa-paper-plane mr-1"></i>Share</button>
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

/* ---- Post Preview + Share (added on top of v1) ----
   Two honest, real capabilities, not a fake "auto-post" button:

   1. PREVIEW: a stylized mockup of how the post will look, using the
      platform's own brand color/icon and character limit (both
      already defined in PLATFORM_META) - purely visual, no posting
      involved.

   2. SHARE: tries the real Web Share API first (navigator.share),
      which on a phone opens the OS's native share sheet - the person
      picks Instagram, TikTok, WhatsApp, whatever's installed - with
      the caption AND the attached image/video actually handed over,
      when the browser/OS supports sharing files (iOS Safari does).
      Where that's not available (most desktop browsers, or no Web
      Share support at all), this falls back to real web share links
      for the platforms that genuinely have one (X, WhatsApp,
      Telegram, and Facebook/LinkedIn once a live post URL is set) -
      never a fake link for a platform that has no such thing.
      Instagram, TikTok, and YouTube don't offer any web URL for
      composing a new post - there's no honest link to give you for
      those, so it's "Copy caption" and open the app yourself instead. */

function ccBuildShareText(task) {
  const caption = task.metadata?.caption || "";
  const hashtags = task.metadata?.hashtags || "";
  return [caption, hashtags].filter(Boolean).join("\n\n") || task.title;
}

async function ccFetchAttachmentFile(task) {
  const list = taskAttachmentList(task);
  if (!list.length) return null;
  const a = list[0];
  try {
    const res = await fetch(a.url);
    const blob = await res.blob();
    return new File([blob], a.name || "post-media", { type: blob.type || "application/octet-stream" });
  } catch {
    return null;
  }
}

function postPreviewCardHTML(task) {
  const meta = PLATFORM_META[task.platform] || PLATFORM_META.instagram;
  const fullText = ccBuildShareText(task);
  const charCount = fullText.length;
  const overLimit = meta.limit && charCount > meta.limit;
  const attachment = taskAttachmentList(task)[0];

  return `
    <div class="ticket overflow-hidden" style="border-color: color-mix(in srgb, ${meta.color} 35%, var(--line))">
      <div class="flex items-center gap-2 px-3 py-2.5 border-b border-line">
        <i class="${meta.icon}" style="color:${meta.color}"></i>
        <span class="text-sm font-medium">${escapeHTML(meta.label)}</span>
      </div>
      ${attachment
        ? (isVideoUrl(attachment.url)
            ? `<video src="${attachment.url}" controls class="w-full max-h-64 object-cover bg-black"></video>`
            : `<img src="${attachment.url}" class="w-full max-h-64 object-cover" alt="">`)
        : `<div class="w-full h-32 flex items-center justify-center" style="background:color-mix(in srgb, ${meta.color} 10%, transparent)"><i class="fa-regular fa-image text-3xl" style="color:color-mix(in srgb, ${meta.color} 45%, transparent)"></i></div>`}
      <div class="px-3 py-2.5">
        <p class="text-sm whitespace-pre-wrap">${fullText ? escapeHTML(fullText) : `<span class="text-ink-soft">No caption yet</span>`}</p>
        ${meta.limit ? `<p class="text-[11px] mt-1.5 ${overLimit ? "text-critical" : "text-ink-soft"}">${charCount} / ${meta.limit} characters${overLimit ? " — over the limit" : ""}</p>` : ""}
      </div>
    </div>`;
}

function ccShareLinks(task) {
  const text = ccBuildShareText(task);
  const url = task.published_url || "";
  const links = [
    { label: "X / Twitter", icon: "fa-brands fa-x-twitter", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}${url ? `&url=${encodeURIComponent(url)}` : ""}` },
    { label: "WhatsApp", icon: "fa-brands fa-whatsapp", href: `https://wa.me/?text=${encodeURIComponent(url ? `${text}\n${url}` : text)}` },
    { label: "Telegram", icon: "fa-brands fa-telegram", href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
  ];
  // Facebook and LinkedIn's share links only really work with an actual URL to
  // share (they pull an OG-tag preview from it) - offering them without a
  // published link would just open a broken/empty dialog, so they're skipped
  // until "Mark published" has a link on file.
  if (url) {
    links.push({ label: "Facebook", icon: "fa-brands fa-facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` });
    links.push({ label: "LinkedIn", icon: "fa-brands fa-linkedin", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` });
  }
  return links;
}

function openContentCalendarPreview(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  document.getElementById("cc-preview-title").innerHTML = `<i class="fa-solid fa-eye text-orange mr-1.5"></i>${escapeHTML(task.title)}`;
  document.getElementById("cc-preview-card").innerHTML = postPreviewCardHTML(task);
  document.getElementById("cc-preview-share-options").innerHTML = ccShareLinks(task).map((l) =>
    `<a href="${l.href}" target="_blank" rel="noopener" class="btn btn-ghost text-xs !py-1.5 !px-2.5"><i class="${l.icon} mr-1"></i>${l.label}</a>`
  ).join("") + (["instagram", "tiktok", "youtube"].includes(task.platform)
    ? `<span class="text-[11px] text-ink-soft w-full mt-1">${PLATFORM_META[task.platform].label} doesn't offer a web link for posting — copy the caption below and paste it in the app.</span>`
    : "");
  document.getElementById("cc-preview-copy-btn").dataset.taskId = taskId;
  document.getElementById("cc-preview-modal")?.classList.remove("hidden");
}

/** Tries the real native share sheet first (with the actual attached file,
 *  where the browser/OS supports it) - falls back to the picker in the
 *  Preview modal when Web Share isn't available at all. */
async function shareContentPost(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  if (navigator.share) {
    const file = await ccFetchAttachmentFile(task);
    const shareData = { title: task.title, text: ccBuildShareText(task) };
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      shareData.files = [file];
    } else if (task.published_url) {
      shareData.url = task.published_url;
    }
    try {
      await navigator.share(shareData);
      return;
    } catch (err) {
      if (err?.name === "AbortError") return; // they cancelled the share sheet on purpose
      // any other failure falls through to the manual picker below
    }
  }
  openContentCalendarPreview(taskId);
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
    const previewBtn = e.target.closest("[data-cc-preview]");
    if (previewBtn) { openContentCalendarPreview(previewBtn.dataset.ccPreview); return; }

    const shareBtn = e.target.closest("[data-cc-share]");
    if (shareBtn) { shareContentPost(shareBtn.dataset.ccShare); return; }

    const copyBtn = e.target.closest("[data-cc-copy-caption]");
    if (copyBtn) {
      const task = state.tasks.find((t) => t.id === copyBtn.dataset.ccCopyCaption);
      const caption = task?.metadata?.caption || "";
      if (!caption) return;
      navigator.clipboard.writeText(caption).then(
        () => toast("Caption copied", "ok"),
        () => toast("Couldn't copy - try selecting the text manually", "error")
      );
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

  document.querySelectorAll("[data-close-cc-preview]").forEach((el) =>
    el.addEventListener("click", () => document.getElementById("cc-preview-modal")?.classList.add("hidden"))
  );
  document.getElementById("cc-preview-copy-btn")?.addEventListener("click", (e) => {
    const task = state.tasks.find((t) => t.id === e.target.closest("button").dataset.taskId);
    if (!task) return;
    navigator.clipboard.writeText(ccBuildShareText(task)).then(
      () => toast("Caption copied", "ok"),
      () => toast("Couldn't copy - try selecting the text manually", "error")
    );
  });

  updateContentCalendarButtonVisibility();
});
