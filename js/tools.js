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
  initJsonTool();
  initContrastChecker();
  initBase64Tool();
  initUrlEncodeTool();
  initRegexTester();
  initLoremIpsum();
  initSnippetVault();
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
  // Same custom calendar used on the board's due-date/reminder fields -
  // not the browser's native <input type="date"> picker, which is what
  // was rendering in the wrong spot/inconsistently across browsers.
  window.Timely?.attachDatePicker?.(document.getElementById("countdown-date"));
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

/* ---------------------------------------------------------------------
   DEV TOOLS
--------------------------------------------------------------------- */

async function copyText(text, label) {
  try { await navigator.clipboard.writeText(text); toast(`${label || "Copied"}`, "ok"); }
  catch { toast("Couldn't copy - your browser blocked clipboard access", "error"); }
}

// ---- 1. JSON formatter & validator ----
function initJsonTool() {
  const input = document.getElementById("json-input");
  if (!input) return;
  const output = document.getElementById("json-output");
  const status = document.getElementById("json-status");
  let lastValid = "";

  function run(mode) {
    const raw = input.value.trim();
    if (!raw) { output.textContent = ""; status.textContent = ""; return; }
    try {
      const parsed = JSON.parse(raw);
      lastValid = mode === "minify" ? JSON.stringify(parsed) : JSON.stringify(parsed, null, 2);
      output.textContent = lastValid;
      status.textContent = "Valid JSON";
      status.className = "text-xs mb-2 text-teal";
    } catch (err) {
      output.textContent = "";
      status.textContent = "Invalid JSON: " + err.message;
      status.className = "text-xs mb-2 text-orange";
    }
  }
  document.getElementById("json-format-btn").addEventListener("click", () => run("format"));
  document.getElementById("json-minify-btn").addEventListener("click", () => run("minify"));
  document.getElementById("json-copy-btn").addEventListener("click", () => lastValid && copyText(lastValid, "JSON copied"));
}

// ---- 2. Color & contrast checker (WCAG) ----
function initContrastChecker() {
  const fgPicker = document.getElementById("contrast-fg-picker");
  if (!fgPicker) return;
  const bgPicker = document.getElementById("contrast-bg-picker");
  const fgText = document.getElementById("contrast-fg");
  const bgText = document.getElementById("contrast-bg");
  const preview = document.getElementById("contrast-preview");
  const result = document.getElementById("contrast-result");

  function hexToRgb(hex) {
    const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
  }
  function relLuminance([r, g, b]) {
    const [rs, gs, bs] = [r, g, b].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  function update() {
    const fgRgb = hexToRgb(fgText.value.trim());
    const bgRgb = hexToRgb(bgText.value.trim());
    preview.style.color = fgText.value.trim();
    preview.style.background = bgText.value.trim();
    if (!fgRgb || !bgRgb) { result.innerHTML = `<span class="text-orange">Enter valid hex colors (e.g. #12203A)</span>`; return; }
    const l1 = relLuminance(fgRgb), l2 = relLuminance(bgRgb);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const rounded = Math.round(ratio * 100) / 100;
    const passAA = ratio >= 4.5, passAAA = ratio >= 7, passAALarge = ratio >= 3;
    result.innerHTML = `
      <p class="font-mono text-lg font-semibold mb-1">${rounded}:1</p>
      <div class="flex flex-wrap gap-2 text-xs">
        <span class="stamp ${passAA ? "text-teal" : "text-orange"}">${passAA ? "✓" : "✗"} AA text</span>
        <span class="stamp ${passAALarge ? "text-teal" : "text-orange"}">${passAALarge ? "✓" : "✗"} AA large text</span>
        <span class="stamp ${passAAA ? "text-teal" : "text-orange"}">${passAAA ? "✓" : "✗"} AAA text</span>
      </div>`;
  }
  fgPicker.addEventListener("input", () => { fgText.value = fgPicker.value.toUpperCase(); update(); });
  bgPicker.addEventListener("input", () => { bgText.value = bgPicker.value.toUpperCase(); update(); });
  [fgText, bgText].forEach((el) => el.addEventListener("input", () => {
    if (/^#[0-9a-f]{6}$/i.test(el.value.trim())) (el === fgText ? fgPicker : bgPicker).value = el.value.trim();
    update();
  }));
  update();
}

// ---- 3. Base64 encode/decode ----
function initBase64Tool() {
  const input = document.getElementById("b64-input");
  if (!input) return;
  const output = document.getElementById("b64-output");
  document.getElementById("b64-encode-btn").addEventListener("click", () => {
    try { output.value = btoa(unescape(encodeURIComponent(input.value))); }
    catch { toast("Couldn't encode that text", "error"); }
  });
  document.getElementById("b64-decode-btn").addEventListener("click", () => {
    try { output.value = decodeURIComponent(escape(atob(input.value.trim()))); }
    catch { toast("That doesn't look like valid Base64", "error"); }
  });
  document.getElementById("b64-copy-btn").addEventListener("click", () => output.value && copyText(output.value, "Copied"));
}

// ---- 4. URL encode/decode ----
function initUrlEncodeTool() {
  const input = document.getElementById("url-input");
  if (!input) return;
  const output = document.getElementById("url-output");
  document.getElementById("url-encode-btn").addEventListener("click", () => { output.value = encodeURIComponent(input.value); });
  document.getElementById("url-decode-btn").addEventListener("click", () => {
    try { output.value = decodeURIComponent(input.value); }
    catch { toast("Couldn't decode that", "error"); }
  });
  document.getElementById("url-copy-btn").addEventListener("click", () => output.value && copyText(output.value, "Copied"));
}

// ---- 5. Regex tester ----
function initRegexTester() {
  const pattern = document.getElementById("regex-pattern");
  if (!pattern) return;
  const flags = document.getElementById("regex-flags");
  const testStr = document.getElementById("regex-test-string");
  const result = document.getElementById("regex-result");

  function run() {
    if (!pattern.value) { result.textContent = ""; return; }
    try {
      const re = new RegExp(pattern.value, flags.value.replace(/[^gimsuy]/g, ""));
      const matches = [...testStr.value.matchAll(re.global ? re : new RegExp(re.source, re.flags + "g"))];
      result.innerHTML = matches.length
        ? `<span class="text-teal font-semibold">${matches.length} match${matches.length === 1 ? "" : "es"}</span>: ` +
          matches.slice(0, 20).map((m) => `<code class="bg-[var(--paper-2)] px-1.5 py-0.5 rounded font-mono">${escapeHTML(m[0])}</code>`).join(" ")
        : `<span class="text-ink-soft">No matches</span>`;
    } catch (err) {
      result.innerHTML = `<span class="text-orange">${escapeHTML(err.message)}</span>`;
    }
  }
  [pattern, flags, testStr].forEach((el) => el.addEventListener("input", run));
}

// ---- 6. Lorem ipsum generator ----
function initLoremIpsum() {
  const btn = document.getElementById("lorem-generate-btn");
  if (!btn) return;
  const WORDS = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum".split(" ");
  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const sentence = () => {
    const len = 6 + Math.floor(Math.random() * 10);
    const words = Array.from({ length: len }, () => rand(WORDS));
    words[0] = words[0][0].toUpperCase() + words[0].slice(1);
    return words.join(" ") + ".";
  };
  const paragraph = () => Array.from({ length: 3 + Math.floor(Math.random() * 3) }, sentence).join(" ");

  btn.addEventListener("click", () => {
    const count = Math.max(1, Number(document.getElementById("lorem-count").value) || 1);
    const unit = document.getElementById("lorem-unit").value;
    let out;
    if (unit === "words") out = Array.from({ length: count }, () => rand(WORDS)).join(" ");
    else if (unit === "sentences") out = Array.from({ length: count }, sentence).join(" ");
    else out = Array.from({ length: count }, paragraph).join("\n\n");
    document.getElementById("lorem-output").value = out;
  });
  document.getElementById("lorem-copy-btn").addEventListener("click", () => {
    const val = document.getElementById("lorem-output").value;
    if (val) copyText(val, "Copied");
  });
}

// ---- 7. Snippet vault ----
function loadSnippets() {
  try { return JSON.parse(localStorage.getItem("boardly-dev-snippets") || "[]"); }
  catch { return []; }
}
function saveSnippets(list) { localStorage.setItem("boardly-dev-snippets", JSON.stringify(list.slice(0, 50))); }

function renderSnippets() {
  const wrap = document.getElementById("snippet-list");
  if (!wrap) return;
  const snippets = loadSnippets();
  wrap.innerHTML = snippets.length
    ? snippets.map((s, i) => `
      <div class="border border-line rounded-lg p-3">
        <div class="flex items-center justify-between mb-2">
          <p class="text-sm font-semibold truncate">${escapeHTML(s.title)}</p>
          <div class="flex items-center gap-2 shrink-0">
            <button data-copy-snippet="${i}" title="Copy" class="text-ink-soft hover:text-orange"><i class="fa-solid fa-copy text-xs"></i></button>
            <button data-load-snippet="${i}" title="Load into editor" class="text-ink-soft hover:text-orange"><i class="fa-solid fa-pen text-xs"></i></button>
            <button data-remove-snippet="${i}" title="Delete" class="text-ink-soft hover:text-orange"><i class="fa-solid fa-xmark text-xs"></i></button>
          </div>
        </div>
        <pre class="text-xs font-mono bg-[var(--paper-2)] rounded p-2 overflow-x-auto max-h-24">${escapeHTML(s.code.slice(0, 300))}${s.code.length > 300 ? "…" : ""}</pre>
      </div>`).join("")
    : `<p class="text-xs text-ink-soft">No snippets saved yet.</p>`;
}

function initSnippetVault() {
  const saveBtn = document.getElementById("snippet-save-btn");
  if (!saveBtn) return;
  renderSnippets();

  saveBtn.addEventListener("click", () => {
    const title = document.getElementById("snippet-title").value.trim();
    const code = document.getElementById("snippet-editor").value;
    if (!title || !code.trim()) { toast("Give it a name and some code first", "error"); return; }
    const snippets = loadSnippets();
    snippets.unshift({ title, code });
    saveSnippets(snippets);
    document.getElementById("snippet-title").value = "";
    document.getElementById("snippet-editor").value = "";
    renderSnippets();
    toast("Snippet saved", "ok");
  });

  document.getElementById("snippet-list").addEventListener("click", (e) => {
    const snippets = loadSnippets();
    const copyBtn = e.target.closest("[data-copy-snippet]");
    if (copyBtn) { copyText(snippets[Number(copyBtn.dataset.copySnippet)].code, "Snippet copied"); return; }
    const loadBtn = e.target.closest("[data-load-snippet]");
    if (loadBtn) {
      const s = snippets[Number(loadBtn.dataset.loadSnippet)];
      document.getElementById("snippet-title").value = s.title;
      document.getElementById("snippet-editor").value = s.code;
      document.getElementById("snippet-editor").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const removeBtn = e.target.closest("[data-remove-snippet]");
    if (removeBtn) {
      snippets.splice(Number(removeBtn.dataset.removeSnippet), 1);
      saveSnippets(snippets);
      renderSnippets();
    }
  });
}
