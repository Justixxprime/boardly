/* ==========================================================================
   BOARDLY - dashboard-extras.js
   --------------------------------------------------------------------------
   WHY THIS FILE EXISTS:
   dashboard.js was one very large file (4,400+ lines) holding everything
   the board does. This is step one of splitting it into smaller,
   easier-to-navigate pieces - moving out the small, self-contained
   "extra" features first, since they're the safest to relocate: none of
   them are needed by dashboard.js while the page is first loading, they
   only get called later, after a person clicks something.

   IMPORTANT - NOTHING ABOUT HOW BOARDLY WORKS HAS CHANGED. This file is
   loaded as a plain script, exactly like dashboard.js itself, timely.js,
   visual.js, and the rest - not as an "ES module." That means every
   function below still lives in the same shared global space it always
   did, and every place elsewhere in the app that calls, say,
   exportBoard() or undoLastAction() keeps working completely unchanged.
   This file is purely about WHERE the code lives, not HOW it behaves.

   Moved here, unchanged, from dashboard.js:
     - EXPORT (CSV / JSON)                 - was section 5c
     - BULK IMPORT (paste plain text)      - was section 5d
     - UNDO/REDO HISTORY (Ctrl+Z)          - was section 5i
     - BOARD BACKGROUNDS                   - was section 5o
     - PRESENTATION / TV MODE              - was section 5p
     - AMBIENT ANIMATED BACKGROUND         - was section 5q

   Still to move in future passes (left in dashboard.js for now, on
   purpose, so this change stays small and easy to verify): due-soon
   notifications, geofence reminders, swipe gestures, AI assistant,
   preferences, zen mode, keyboard nav, onboarding tour, quick-add
   templates, gamification, calendar view, the built-in template
   gallery, live cursors, and the command palette. Section 53 of the
   Boardly 2.0 prompt calls this "extract progressively, not a
   dangerous rewrite" - that's exactly the approach here.
   ========================================================================== */

// ---------------------------------------------------------------------------
// EXPORT (CSV / JSON)
// ---------------------------------------------------------------------------

function triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function exportBoard(format) {
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "json") {
    const data = state.tasks.map(({ id, title, category, status, due_date, position }) => ({
      id, title, category, status, due_date, position,
    }));
    triggerDownload(`boardly-${stamp}.json`, JSON.stringify(data, null, 2), "application/json");
  } else {
    const header = ["title", "category", "status", "due_date"];
    const rows = state.tasks.map((t) => [t.title, t.category, t.status, t.due_date || ""].map(csvEscape).join(","));
    triggerDownload(`boardly-${stamp}.csv`, [header.join(","), ...rows].join("\n"), "text/csv");
  }
  toast(`Exported board as ${format.toUpperCase()}`, "ok");
}

// ---------------------------------------------------------------------------
// BULK IMPORT (paste plain text, one task per line)
// ---------------------------------------------------------------------------

function openImportModal() {
  document.getElementById("import-modal").classList.remove("hidden");
  const textarea = document.getElementById("import-textarea");
  textarea.value = "";
  textarea.focus();
}

function closeImportModal() {
  document.getElementById("import-modal").classList.add("hidden");
}

async function importPastedTasks() {
  const raw = document.getElementById("import-textarea").value;
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) { closeImportModal(); return; }
  closeImportModal();

  let imported = 0;
  for (const line of lines) {
    const { title, category, platform, dueDate } = parseQuickAdd(line);
    if (!title && !line) continue;
    await addTask(title || line, category, dueDate, platform);
    imported++;
  }
  toast(`Imported ${imported} task${imported === 1 ? "" : "s"}`, "ok");
}

// ---------------------------------------------------------------------------
// UNDO/REDO HISTORY (Ctrl+Z)
//    Delete already has its own "Undo" toast (see deleteTask); this stack
//    additionally covers add / complete / move / edit / bulk-move so
//    Ctrl+Z works as a general "take that back" for the whole board.
// ---------------------------------------------------------------------------

function pushHistory(undo) {
  state.actionHistory.push({ undo });
  if (state.actionHistory.length > 20) state.actionHistory.shift();
}

function undoLastAction() {
  const entry = state.actionHistory.pop();
  if (!entry) { toast("Nothing left to undo", "error"); return; }
  entry.undo();
}

// ---------------------------------------------------------------------------
// BOARD BACKGROUNDS - per-board, stored locally on this device/browser
// ---------------------------------------------------------------------------

const BOARD_BACKGROUNDS = {
  none: "none",
  sunrise: "linear-gradient(160deg, color-mix(in srgb, var(--orange) 12%, transparent), transparent 55%)",
  ocean: "linear-gradient(160deg, color-mix(in srgb, #2C7BE8 12%, transparent), transparent 55%)",
  forest: "linear-gradient(160deg, color-mix(in srgb, #3E8E4F 12%, transparent), transparent 55%)",
  dusk: "linear-gradient(160deg, color-mix(in srgb, var(--violet) 12%, transparent), transparent 55%)",
};

function applyBoardBackground() {
  const key = localStorage.getItem(`boardly-bg-${state.currentBoardId}`) || "none";
  const main = document.querySelector("main");
  if (main) main.style.backgroundImage = BOARD_BACKGROUNDS[key] || "none";
  document.querySelectorAll("#board-bg-swatches [data-bg]").forEach((el) =>
    el.classList.toggle("active", el.dataset.bg === key)
  );
}

function renderBoardBgSwatches() {
  const wrap = document.getElementById("board-bg-swatches");
  if (!wrap) return;
  const colors = { none: "transparent", sunrise: "var(--orange)", ocean: "#2C7BE8", forest: "#3E8E4F", dusk: "var(--violet)" };
  wrap.innerHTML = Object.keys(BOARD_BACKGROUNDS)
    .map(
      (key) =>
        `<button type="button" data-bg="${key}" class="accent-swatch" style="background:${colors[key]}; border-color:var(--line)" title="${key}"></button>`
    )
    .join("");
  applyBoardBackground();
}

// ---------------------------------------------------------------------------
// PRESENTATION / TV MODE
// ---------------------------------------------------------------------------

function togglePresentationMode() {
  const on = document.body.classList.toggle("presentation-mode");
  document.getElementById("exit-presentation-btn").classList.toggle("hidden", !on);
  if (on && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else if (!on && document.exitFullscreen && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// AMBIENT ANIMATED BACKGROUND
// ---------------------------------------------------------------------------

let ambientRAF = null;
function startAmbientBackground() {
  const canvas = document.getElementById("ambient-canvas");
  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  canvas.classList.remove("hidden");
  const ctx = canvas.getContext("2d");
  let w, h;
  const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
  resize();
  window.addEventListener("resize", resize);

  const blobs = Array.from({ length: 5 }, () => ({
    x: Math.random() * w, y: Math.random() * h,
    r: 120 + Math.random() * 160,
    dx: (Math.random() - 0.5) * 0.15, dy: (Math.random() - 0.5) * 0.15,
    hue: ["var(--orange)", "var(--teal)", "var(--violet)"][Math.floor(Math.random() * 3)],
  }));

  const styles = getComputedStyle(document.documentElement);
  const resolve = (v) => (v.startsWith("var(") ? styles.getPropertyValue(v.slice(4, -1)).trim() : v);

  function frame() {
    ctx.clearRect(0, 0, w, h);
    blobs.forEach((b) => {
      b.x += b.dx; b.y += b.dy;
      if (b.x < -b.r || b.x > w + b.r) b.dx *= -1;
      if (b.y < -b.r || b.y > h + b.r) b.dy *= -1;
      const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      grad.addColorStop(0, resolve(b.hue) + "14");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ambientRAF = requestAnimationFrame(frame);
  }
  frame();
}
function stopAmbientBackground() {
  const canvas = document.getElementById("ambient-canvas");
  canvas?.classList.add("hidden");
  if (ambientRAF) cancelAnimationFrame(ambientRAF);
  ambientRAF = null;
}
function initAmbientBackground() {
  const on = localStorage.getItem("boardly-ambient") === "1";
  document.getElementById("ambient-toggle")?.classList.toggle("active", on);
  if (on) startAmbientBackground();
}

// ---------------------------------------------------------------------------
// AUTO-GROWING TEXTAREAS (Edit ticket: Title, Notes)
//    Before this, #edit-title was a fixed 1-line box with no code
//    telling it to grow - so the moment typed text wrapped past one
//    line, the browser's only option was to scroll the box's own tiny
//    window to keep the cursor visible, which feels exactly like "the
//    text keeps moving while I type." This makes the box actually grow
//    with what's typed instead, up to the height already set in its
//    own CSS (max-height:160px for Title, so it can't grow forever and
//    push the rest of the form off-screen).
// ---------------------------------------------------------------------------

function autoGrowTextarea(el) {
  const max = parseInt(el.style.maxHeight, 10) || 9999;
  el.style.height = "auto"; // shrink first, so deleting text can shrink the box back down too
  el.style.height = Math.min(el.scrollHeight, max) + "px";
}

function initAutoGrowTextareas() {
  document.querySelectorAll("#edit-title, #edit-notes").forEach((el) => {
    el.addEventListener("input", () => autoGrowTextarea(el));
  });
}

// The box also needs to be sized correctly the moment a ticket with an
// existing long title/notes is opened, not only as you type - this
// wraps openEditModal() the same safe way js/collaboration.js already
// wraps it for loading comments, rather than editing dashboard.js.
const _originalOpenEditModalForAutoGrow = window.openEditModal;
if (typeof _originalOpenEditModalForAutoGrow === "function") {
  window.openEditModal = function (...args) {
    const result = _originalOpenEditModalForAutoGrow.apply(this, args);
    requestAnimationFrame(() => {
      document.querySelectorAll("#edit-title, #edit-notes").forEach(autoGrowTextarea);
    });
    return result;
  };
}
