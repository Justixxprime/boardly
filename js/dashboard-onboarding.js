/* ==========================================================================
   BOARDLY - dashboard-onboarding.js
   --------------------------------------------------------------------------
   Third batch of the ongoing split described at the top of dashboard.js
   (see js/dashboard-extras.js and js/dashboard-behaviors.js for the
   first two batches, and the full explanation of why and how this is
   being done gradually and safely).

   Loaded as a plain script, same shared global scope as everything
   else - nothing about how any of this behaves has changed, only
   where the code lives.

   Moved here, unchanged, from dashboard.js:
     - ONBOARDING TOUR                          - was section 5l
     - QUICK-ADD TEMPLATES & HISTORY             - was section 5m
     - BUILT-IN TEMPLATE GALLERY                 - was section 5s
     - LIVE COLLABORATOR CURSORS                 - was section 5t

   Note: this file's BOARD_TEMPLATES and useTemplate() are the built-in
   templates (Sprint planning, Content calendar, and so on). They're a
   separate, older system from js/board-templates-custom.js, which adds
   a person's OWN saved templates alongside these - see that file's own
   header comment for how the two relate.
   ========================================================================== */

// ---------------------------------------------------------------------------
// ONBOARDING TOUR
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
// QUICK-ADD TEMPLATES & HISTORY (↑ / ↓ to cycle past entries)
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
// BUILT-IN TEMPLATE GALLERY
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
// LIVE COLLABORATOR CURSORS
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
