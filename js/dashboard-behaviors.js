/* ==========================================================================
   BOARDLY - dashboard-behaviors.js
   --------------------------------------------------------------------------
   Second batch of the ongoing split described at the top of dashboard.js
   (see js/dashboard-extras.js for the first batch and the full
   explanation of why and how this is being done gradually and safely).

   Loaded as a plain script, same shared global scope as everything
   else - nothing about how any of this behaves has changed, only
   where the code lives.

   Moved here, unchanged, from dashboard.js:
     - LOCATION-BASED (GEOFENCE) REMINDERS   - was section 4c
     - SWIPE GESTURES (touch devices)        - was section 5f
     - ZEN / FOCUS MODE                      - was section 5j
     - KEYBOARD NAVIGATION                   - was section 5k
     - GAMIFICATION (XP, levels, badges)     - was section 5n
   ========================================================================== */

// ---------------------------------------------------------------------------
// LOCATION-BASED (GEOFENCE) REMINDERS
//    An alternative/additional way to set a reminder: "when I arrive at"
//    or "when I leave" a place, instead of (or alongside) a fixed time.
//    Only active while this tab is open and location permission is
//    granted - same real-world limitation as the time-based browser
//    reminders, just for position instead of a clock.
// ---------------------------------------------------------------------------

let geoWatchId = null;
const geoInsideState = new Map();      // task.id -> boolean, "currently within radius"
const geoNotifiedThisSession = new Set(); // task.id, so a single arrival/departure doesn't spam notifications

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function updateGeofenceWatch() {
  if (!state.proReady || !("geolocation" in navigator)) return;
  const hasGeoTasks = state.tasks.some((t) => t.reminder_lat != null && t.status !== "done");
  if (!hasGeoTasks) {
    if (geoWatchId !== null) { navigator.geolocation.clearWatch(geoWatchId); geoWatchId = null; }
    return;
  }
  if (geoWatchId !== null) return; // already watching
  geoWatchId = navigator.geolocation.watchPosition(onGeoPosition, () => {}, {
    enableHighAccuracy: false, maximumAge: 30000, timeout: 20000,
  });
}

function onGeoPosition(pos) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (localStorage.getItem("boardly-notify-muted") === "1") return;
  state.tasks.forEach((task) => {
    if (task.reminder_lat == null || task.status === "done") return;
    const dist = haversineMeters(pos.coords.latitude, pos.coords.longitude, task.reminder_lat, task.reminder_lng);
    const within = dist <= (task.reminder_radius_m || 300);
    const prev = geoInsideState.has(task.id) ? geoInsideState.get(task.id) : within;
    geoInsideState.set(task.id, within);
    if (prev === within) return;

    const trigger = task.reminder_geo_trigger || "arrive";
    const shouldFire = (trigger === "arrive" && within) || (trigger === "leave" && !within);
    if (!shouldFire || geoNotifiedThisSession.has(task.id)) return;
    geoNotifiedThisSession.add(task.id);

    const place = task.reminder_geo_label ? ` — ${task.reminder_geo_label}` : "";
    new Notification("Boardly location reminder", { body: `${task.title}${place}`, icon: "icons/icon-192.png" });
    toast(`Location reminder: ${task.title}`, "ok");
  });
}

// ---------------------------------------------------------------------------
// SWIPE GESTURES (touch devices)
//    Swipe a card right to mark it done, left to delete it.
// ---------------------------------------------------------------------------

function initSwipeGestures() {
  const board = document.getElementById("board");
  if (!board) return;
  let startX = 0, startY = 0, activeCard = null, dragging = false, swipeIntent = false;
  const THRESHOLD = 80;
  const INTENT_THRESHOLD = 14;

  board.addEventListener("touchstart", (e) => {
    if (state.bulkMode) return;
    if (e.target.closest(".drag-handle")) return;
    const card = e.target.closest(".ticket[data-id]");
    if (!card) return;
    activeCard = card;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dragging = true;
    swipeIntent = false;
  }, { passive: true });

  board.addEventListener("touchmove", (e) => {
    if (!dragging || !activeCard) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!swipeIntent) {
      if (Math.abs(dy) > Math.abs(dx) || Math.max(Math.abs(dx), Math.abs(dy)) < INTENT_THRESHOLD) return;
      swipeIntent = true;
      activeCard.style.transition = "none";
    }
    activeCard.style.transform = `translateX(${dx}px)`;
    activeCard.style.opacity = String(Math.max(1 - Math.abs(dx) / 250, 0.4));
  }, { passive: true });

  board.addEventListener("touchend", (e) => {
    if (!dragging || !activeCard) return;
    const dx = e.changedTouches[0].clientX - startX;
    const card = activeCard;
    card.style.transition = "transform .2s ease, opacity .2s ease";
    dragging = false;
    activeCard = null;

    if (swipeIntent && dx > THRESHOLD) {
      toggleComplete(card.dataset.id);
    } else {
      card.style.transform = "translateX(0)";
      card.style.opacity = "1";
    }
  });
}

// ---------------------------------------------------------------------------
// ZEN / FOCUS MODE
// ---------------------------------------------------------------------------

const COLUMN_LABEL = { todo: "To do", inprogress: "In progress", done: "Done" };

function setZenColumn(col) {
  state.zenColumn = col;
  const board = document.getElementById("board");
  board?.classList.toggle("zen-active", !!col);
  board?.querySelectorAll("section[data-col]").forEach((s) => s.classList.toggle("zen-visible", s.dataset.col === col));
  const bar = document.getElementById("exit-focus-bar");
  bar?.classList.toggle("hidden", !col);
  if (col) document.getElementById("exit-focus-label").textContent = COLUMN_LABEL[col] || col;
}

function initZenMode() {
  document.querySelectorAll("[data-zen]").forEach((btn) => {
    btn.addEventListener("click", () => setZenColumn(btn.dataset.zen));
  });
  document.getElementById("exit-focus-btn")?.addEventListener("click", () => setZenColumn(null));
  document.querySelectorAll("[data-clear-column]").forEach((btn) => {
    btn.addEventListener("click", () => clearColumn(btn.dataset.clearColumn));
  });
}

// ---------------------------------------------------------------------------
// KEYBOARD NAVIGATION (arrow keys / j-k-h-l, Enter, Space)
// ---------------------------------------------------------------------------

function initKeyboardNav() {
  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (!document.getElementById("edit-modal")?.classList.contains("hidden")) return;
    if (!document.getElementById("cmdk")?.classList.contains("hidden")) return;

    const cards = [...document.querySelectorAll(".ticket[data-id]")];
    if (!cards.length) return;
    let idx = cards.findIndex((c) => c.dataset.id === state.focusedCardId);

    const focusCard = (i) => {
      cards.forEach((c) => c.classList.remove("ticket-kbd-focus"));
      const card = cards[Math.max(0, Math.min(i, cards.length - 1))];
      card.classList.add("ticket-kbd-focus");
      card.scrollIntoView({ block: "nearest" });
      state.focusedCardId = card.dataset.id;
    };

    if (["ArrowDown", "j"].includes(e.key)) { e.preventDefault(); focusCard(idx + 1); }
    else if (["ArrowUp", "k"].includes(e.key)) { e.preventDefault(); focusCard(idx - 1); }
    else if (["ArrowRight", "l"].includes(e.key) && idx !== -1) {
      e.preventDefault();
      const col = cards[idx].closest("[data-col]")?.dataset.col;
      const nextCol = COLUMNS[Math.min(COLUMNS.indexOf(col) + 1, COLUMNS.length - 1)];
      const target = document.querySelector(`#col-${nextCol} .ticket[data-id]`);
      if (target) focusCard(cards.indexOf(target));
    } else if (["ArrowLeft", "h"].includes(e.key) && idx !== -1) {
      e.preventDefault();
      const col = cards[idx].closest("[data-col]")?.dataset.col;
      const prevCol = COLUMNS[Math.max(COLUMNS.indexOf(col) - 1, 0)];
      const target = document.querySelector(`#col-${prevCol} .ticket[data-id]`);
      if (target) focusCard(cards.indexOf(target));
    } else if (e.key === "Enter" && state.focusedCardId) {
      openEditModal(state.focusedCardId);
    } else if (e.key === " " && state.focusedCardId) {
      e.preventDefault();
      toggleComplete(state.focusedCardId);
    }
  });
}

// ---------------------------------------------------------------------------
// GAMIFICATION - XP, levels, badges, streak
//    All computed from real task data (total completed count drives
//    level/XP) plus a small local completion log for the streak, since
//    the database doesn't track a completion timestamp separately from
//    status. The log lives in this browser only.
// ---------------------------------------------------------------------------

const BADGES = [
  { threshold: 1, name: "First done", icon: "fa-flag-checkered" },
  { threshold: 10, name: "Getting going", icon: "fa-fire" },
  { threshold: 25, name: "On a roll", icon: "fa-bolt" },
  { threshold: 50, name: "Half century", icon: "fa-medal" },
  { threshold: 100, name: "Centurion", icon: "fa-trophy" },
  { threshold: 250, name: "Machine", icon: "fa-gem" },
  { threshold: 500, name: "Legend", icon: "fa-crown" },
  { threshold: 1000, name: "Unstoppable", icon: "fa-meteor" },
];

function levelForCompleted(n) {
  return Math.floor(Math.sqrt(n / 2)) + 1;
}
function xpIntoLevel(n) {
  const level = levelForCompleted(n);
  const thisLevelStart = 2 * (level - 1) * (level - 1);
  const nextLevelStart = 2 * level * level;
  return { into: n - thisLevelStart, needed: nextLevelStart - thisLevelStart };
}

function readCompletionLog() {
  try { return JSON.parse(localStorage.getItem("boardly-completion-log") || "[]"); }
  catch { return []; }
}

function logCompletion() {
  const log = readCompletionLog();
  log.push(toDateStr(new Date()));
  localStorage.setItem("boardly-completion-log", JSON.stringify(log.slice(-2000)));
}

function currentStreak() {
  const days = new Set(readCompletionLog());
  (state.tasks || []).forEach((t) => { if (t.done_at) days.add(t.done_at.slice(0, 10)); });
  let streak = 0;
  const d = new Date();
  if (!days.has(toDateStr(d))) d.setDate(d.getDate() - 1);
  while (days.has(toDateStr(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function renderGamification() {
  const rawCompleted = state.tasks.filter((t) => t.status === "done").length;
  const resetOffset = Number(localStorage.getItem("boardly-gamification-reset-offset") || 0);
  const completed = Math.max(0, rawCompleted - resetOffset);
  const level = levelForCompleted(completed);
  const { into, needed } = xpIntoLevel(completed);
  const streak = currentStreak();

  document.getElementById("level-pill-label").textContent = `Lv ${level}`;
  document.getElementById("progress-level-title").textContent = `Level ${level}`;
  document.getElementById("progress-streak").innerHTML = `<i class="fa-solid fa-fire text-orange"></i>${streak} day streak`;
  document.getElementById("progress-xp-fill").style.width = `${Math.min((into / needed) * 100, 100)}%`;
  document.getElementById("progress-xp-label").textContent = `${into} / ${needed} to next level`;

  document.getElementById("badges-grid").innerHTML = BADGES.map((b) => {
    const unlocked = completed >= b.threshold;
    return `<div title="${b.name} (${b.threshold}+)" class="aspect-square rounded-lg border flex items-center justify-center text-sm ${unlocked ? "border-orange bg-orange/10 text-orange" : "border-line text-ink-soft opacity-40"}">
      <i class="fa-solid ${b.icon}"></i>
    </div>`;
  }).join("");

  const lastSeenLevel = Number(localStorage.getItem("boardly-last-level") || 1);
  if (level > lastSeenLevel) {
    localStorage.setItem("boardly-last-level", String(level));
    showLevelUpPopup(level);
  } else if (level < lastSeenLevel) {
    localStorage.setItem("boardly-last-level", String(level));
  }
}

/**
 * Resets your level, XP, streak, and badges back to zero without
 * touching any real tasks - see the original comment in dashboard.js's
 * history for the full explanation of how the offset approach works.
 */
async function resetGamification() {
  const confirmed = await showConfirmModal(
    "Reset your level, XP, streak, and badges back to zero? Your tasks won't be touched.",
    { title: "Reset progress?", confirmLabel: "Reset progress" }
  );
  if (!confirmed) return;
  const rawCompleted = state.tasks.filter((t) => t.status === "done").length;
  localStorage.setItem("boardly-gamification-reset-offset", String(rawCompleted));
  localStorage.setItem("boardly-completion-log", "[]");
  localStorage.setItem("boardly-last-level", "1");
  renderGamification();
  toast("Progress reset", "ok");
}

function showLevelUpPopup(level) {
  const popup = document.getElementById("levelup-popup");
  document.getElementById("levelup-label").textContent = `Level ${level}`;
  popup.classList.remove("hidden");
  playSound("complete");
  setTimeout(() => popup.classList.add("hidden"), 2600);
}

/** Fires once when every task on the current board is done, and again is silenced until something becomes not-done. */
function checkBoardCleared() {
  const total = state.tasks.length;
  const done = state.tasks.filter((t) => t.status === "done").length;
  const banner = document.getElementById("board-cleared-banner");
  if (total > 0 && done === total) {
    if (banner.dataset.shown === "true") return;
    banner.dataset.shown = "true";
    banner.classList.remove("hidden");
    const boardEl = document.getElementById("board");
    if (boardEl) celebrate(boardEl);
    setTimeout(() => celebrate(boardEl), 200);
    setTimeout(() => celebrate(boardEl), 400);
    setTimeout(() => banner.classList.add("hidden"), 3200);
  } else {
    banner.dataset.shown = "false";
  }
}
