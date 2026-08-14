/* ==========================================================================
   BOARDLY - tools.js
   Powers the Quick Tools page. Everything here is local to this device
   (localStorage) on purpose - it's meant to be instant with zero setup,
   not another thing synced through Supabase. Sign-in is still required
   just to keep the page behind the same login as the rest of the app.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  initFocusTimer();
  initScratchpad();
  initCountdown();
  initUnitConverter();
  initDecisionPicker();
  initCalculator();
});

/* ---------------------------------------------------------------------
   FOCUS / POMODORO TIMER
--------------------------------------------------------------------- */
function initFocusTimer() {
  const display = document.getElementById("focus-display");
  const preset = document.getElementById("focus-preset");
  const startBtn = document.getElementById("focus-start-btn");
  const resetBtn = document.getElementById("focus-reset-btn");
  const sessionCountEl = document.getElementById("focus-session-count");
  if (!display) return;

  let totalSeconds = Number(preset.value) * 60;
  let remaining = totalSeconds;
  let ticking = null;

  const sessionsToday = () => {
    const key = `boardly-focus-sessions-${new Date().toISOString().slice(0, 10)}`;
    return Number(localStorage.getItem(key) || 0);
  };
  const bumpSessionsToday = () => {
    const key = `boardly-focus-sessions-${new Date().toISOString().slice(0, 10)}`;
    localStorage.setItem(key, String(sessionsToday() + 1));
    renderSessionCount();
  };
  const renderSessionCount = () => {
    const n = sessionsToday();
    sessionCountEl.textContent = n ? `${n} focus session${n === 1 ? "" : "s"} completed today` : "";
  };
  renderSessionCount();

  const render = () => {
    const m = String(Math.floor(remaining / 60)).padStart(2, "0");
    const s = String(remaining % 60).padStart(2, "0");
    display.textContent = `${m}:${s}`;
    document.title = ticking ? `${m}:${s} - Quick Tools | Boardly` : "Quick Tools | Boardly";
  };

  preset.addEventListener("change", () => {
    clearInterval(ticking); ticking = null;
    totalSeconds = Number(preset.value) * 60;
    remaining = totalSeconds;
    startBtn.textContent = "Start";
    render();
  });

  startBtn.addEventListener("click", () => {
    if (ticking) {
      clearInterval(ticking); ticking = null;
      startBtn.textContent = "Resume";
      return;
    }
    startBtn.textContent = "Pause";
    ticking = setInterval(() => {
      remaining--;
      render();
      if (remaining <= 0) {
        clearInterval(ticking); ticking = null;
        startBtn.textContent = "Start";
        remaining = totalSeconds;
        render();
        bumpSessionsToday();
        toast("Focus session done - nice work", "ok");
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Boardly", { body: "Focus session complete", icon: "icons/icon-192.png" });
        }
      }
    }, 1000);
  });

  resetBtn.addEventListener("click", () => {
    clearInterval(ticking); ticking = null;
    remaining = totalSeconds;
    startBtn.textContent = "Start";
    render();
  });

  render();
}

/* ---------------------------------------------------------------------
   SCRATCHPAD
--------------------------------------------------------------------- */
function initScratchpad() {
  const el = document.getElementById("scratchpad");
  if (!el) return;
  el.value = localStorage.getItem("boardly-scratchpad") || "";
  let debounceTimer = null;
  el.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => localStorage.setItem("boardly-scratchpad", el.value), 300);
  });
}

/* ---------------------------------------------------------------------
   COUNTDOWN
--------------------------------------------------------------------- */
function loadCountdowns() {
  try { return JSON.parse(localStorage.getItem("boardly-countdowns") || "[]"); }
  catch { return []; }
}
function saveCountdowns(list) {
  localStorage.setItem("boardly-countdowns", JSON.stringify(list));
}
function renderCountdowns() {
  const list = document.getElementById("countdown-list");
  if (!list) return;
  const items = loadCountdowns().sort((a, b) => a.date.localeCompare(b.date));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  list.innerHTML = items.length
    ? items.map((item, i) => {
        const target = new Date(item.date + "T00:00:00");
        const days = Math.round((target - today) / 86400000);
        const daysLabel = days === 0 ? "Today" : days === 1 ? "Tomorrow" : days > 0 ? `${days} days` : `${Math.abs(days)} days ago`;
        return `
      <div class="flex items-center justify-between text-sm">
        <span class="truncate">${escapeHTML(item.label)}</span>
        <span class="flex items-center gap-2 shrink-0">
          <span class="font-mono text-xs ${days < 0 ? "text-ink-soft" : days <= 3 ? "text-orange font-semibold" : "text-ink-soft"}">${daysLabel}</span>
          <button data-remove-countdown="${i}" class="text-ink-soft hover:text-orange"><i class="fa-solid fa-xmark text-xs"></i></button>
        </span>
      </div>`;
      }).join("")
    : `<p class="text-xs text-ink-soft">Nothing counting down yet.</p>`;
}
function initCountdown() {
  if (!document.getElementById("countdown-list")) return;
  renderCountdowns();
  document.getElementById("countdown-add-btn")?.addEventListener("click", () => {
    const label = document.getElementById("countdown-label").value.trim();
    const date = document.getElementById("countdown-date").value;
    if (!label || !date) { toast("Add both a name and a date", "error"); return; }
    const items = loadCountdowns();
    items.push({ label, date });
    saveCountdowns(items);
    document.getElementById("countdown-label").value = "";
    document.getElementById("countdown-date").value = "";
    renderCountdowns();
  });
  document.getElementById("countdown-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-countdown]");
    if (!btn) return;
    const items = loadCountdowns();
    items.splice(Number(btn.dataset.removeCountdown), 1);
    saveCountdowns(items);
    renderCountdowns();
  });
}

/* ---------------------------------------------------------------------
   UNIT CONVERTER
   Offline, no live rates needed - length/weight/volume are fixed ratios,
   temperature is a formula. (No currency converter: exchange rates need
   a live external API this environment can't reach, and a stale rate
   would be actively misleading for real freight/invoice numbers.)
--------------------------------------------------------------------- */
const UNIT_DEFS = {
  length: { base: "m", units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 } },
  weight: { base: "kg", units: { mg: 0.000001, g: 0.001, kg: 1, t: 1000, oz: 0.0283495, lb: 0.453592 } },
  volume: { base: "l", units: { ml: 0.001, l: 1, "m³": 1000, "ft³": 28.3168, gal: 3.78541, "20ft container (~33 m³)": 33000, "40ft container (~67 m³)": 67000 } },
};
function initUnitConverter() {
  const catSel = document.getElementById("unit-category");
  const fromSel = document.getElementById("unit-from");
  const toSel = document.getElementById("unit-to");
  const fromVal = document.getElementById("unit-from-value");
  const result = document.getElementById("unit-result");
  if (!catSel) return;

  function populateUnits() {
    if (catSel.value === "temperature") {
      fromSel.innerHTML = `<option value="c">Celsius</option><option value="f">Fahrenheit</option><option value="k">Kelvin</option>`;
      toSel.innerHTML = `<option value="f">Fahrenheit</option><option value="c">Celsius</option><option value="k">Kelvin</option>`;
    } else {
      const units = Object.keys(UNIT_DEFS[catSel.value].units);
      fromSel.innerHTML = units.map((u) => `<option value="${u}">${u}</option>`).join("");
      toSel.innerHTML = units.map((u) => `<option value="${u}">${u}</option>`).join("");
      toSel.selectedIndex = 1 % units.length;
    }
    convert();
  }

  function toCelsius(v, unit) { return unit === "c" ? v : unit === "f" ? (v - 32) * 5 / 9 : v - 273.15; }
  function fromCelsius(c, unit) { return unit === "c" ? c : unit === "f" ? c * 9 / 5 + 32 : c + 273.15; }

  function convert() {
    const v = Number(fromVal.value) || 0;
    let out;
    if (catSel.value === "temperature") {
      out = fromCelsius(toCelsius(v, fromSel.value), toSel.value);
    } else {
      const def = UNIT_DEFS[catSel.value];
      out = (v * def.units[fromSel.value]) / def.units[toSel.value];
    }
    const rounded = Math.abs(out) >= 100 ? Math.round(out * 100) / 100 : Math.round(out * 10000) / 10000;
    result.textContent = `${v} ${fromSel.value === "c" || fromSel.value === "f" || fromSel.value === "k" ? fromSel.value.toUpperCase() : fromSel.value} = ${rounded} ${toSel.value === "c" || toSel.value === "f" || toSel.value === "k" ? toSel.value.toUpperCase() : toSel.value}`;
  }

  catSel.addEventListener("change", populateUnits);
  [fromSel, toSel, fromVal].forEach((el) => el.addEventListener("input", convert));
  populateUnits();
}

/* ---------------------------------------------------------------------
   DECISION PICKER
--------------------------------------------------------------------- */
function initDecisionPicker() {
  const wrap = document.getElementById("decision-options");
  if (!wrap) return;
  let count = 0;

  function addOption(value = "") {
    count++;
    const row = document.createElement("div");
    row.className = "flex items-center gap-2";
    row.innerHTML = `<input type="text" value="${escapeHTML(value)}" placeholder="Option ${count}" class="flex-1 border border-line rounded-lg px-3 py-1.5 text-sm bg-card focus:border-orange outline-none">
      <button type="button" class="text-ink-soft hover:text-orange" data-remove-option><i class="fa-solid fa-xmark text-xs"></i></button>`;
    row.querySelector("[data-remove-option]").addEventListener("click", () => row.remove());
    wrap.appendChild(row);
  }
  addOption(); addOption();

  document.getElementById("decision-add-btn")?.addEventListener("click", () => addOption());
  document.getElementById("decision-pick-btn")?.addEventListener("click", () => {
    const values = [...wrap.querySelectorAll("input")].map((i) => i.value.trim()).filter(Boolean);
    const resultEl = document.getElementById("decision-result");
    if (values.length < 2) { toast("Add at least 2 options", "error"); return; }
    resultEl.textContent = "";
    let i = 0;
    const spin = setInterval(() => {
      resultEl.textContent = values[i % values.length];
      i++;
    }, 80);
    setTimeout(() => {
      clearInterval(spin);
      resultEl.textContent = values[Math.floor(Math.random() * values.length)];
    }, 1200);
  });
}

/* ---------------------------------------------------------------------
   CALCULATOR
--------------------------------------------------------------------- */
function initCalculator() {
  const display = document.getElementById("calc-display");
  const pad = document.getElementById("calc-pad");
  if (!display || !pad) return;

  const keys = ["C", "±", "%", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "0", ".", "⌫", "="];
  pad.innerHTML = keys.map((k) => `<button type="button" data-key="${k}" class="toolbar-btn justify-center py-3 text-sm font-medium">${k}</button>`).join("");

  let expr = "";
  const opMap = { "÷": "/", "×": "*", "−": "-" };

  function render() { display.value = expr ? expr.replace(/\*/g, "×").replace(/\//g, "÷").replace(/-/g, "−") : "0"; }

  pad.addEventListener("click", (e) => {
    const key = e.target.closest("[data-key]")?.dataset.key;
    if (!key) return;
    if (key === "C") { expr = ""; }
    else if (key === "⌫") { expr = expr.slice(0, -1); }
    else if (key === "±") { expr = expr.startsWith("-") ? expr.slice(1) : "-" + expr; }
    else if (key === "%") { expr += "/100"; }
    else if (key === "=") {
      try {
        // Only digits/operators/parens/decimal reach here - never eval() arbitrary text.
        if (!/^[0-9+\-*/.() ]+$/.test(expr.replace(/[÷×−]/g, (m) => opMap[m]))) throw new Error("bad input");
        const safeExpr = expr.replace(/[÷×−]/g, (m) => opMap[m]);
        // eslint-disable-next-line no-new-func
        const value = Function(`"use strict"; return (${safeExpr})`)();
        expr = Number.isFinite(value) ? String(Math.round(value * 1e10) / 1e10) : "";
      } catch { expr = ""; display.value = "Error"; return; }
    }
    else { expr += opMap[key] || key; }
    render();
  });

  render();
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
