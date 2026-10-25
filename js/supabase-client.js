/* ==========================================================================
   BOARDLY - Supabase client
   --------------------------------------------------------------------------
   1. Create a free project at https://supabase.com
   2. Go to Project Settings -> API
   3. Copy "Project URL" and "anon public" key into the two lines below
   4. Run the SQL in /supabase/schema.sql inside the Supabase SQL editor
   That's it - every page that includes this file shares one client.
   ========================================================================== */

const SUPABASE_URL = "https://cafhqxzjujvxmarvkbxd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZmhxeHpqdWp2eG1hcnZrYnhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMTI5NDEsImV4cCI6MjA5OTY4ODk0MX0.5cHhMuInsdm0TQS5DRlA-Fr0OQs7J6V4rVcMMaaKvR0";

// The Supabase JS library is loaded from a CDN script tag on each page,
// which creates a global `supabase` object with a `.createClient()` method.
// We immediately overwrite the global `supabase` name with our *client
// instance* so every other file can just call supabase.from(...) directly.
/* ---- Backend status banner ------------------------------------------
   Every data request goes through boardlyFetch. If the server keeps
   rejecting or not answering (two bad answers within one minute), a clear
   banner explains it instead of leaving the screen silently empty.
   It hides itself the moment a data request succeeds again.
   Only data and function calls are watched, never sign in or sign out. */
const BOARDLY_BAD_WINDOW_MS = 60000;
let boardlyBadTimes = [];

function boardlyShowBanner(kind) {
  try {
    let bar = document.getElementById("boardly-backend-banner");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "boardly-backend-banner";
      bar.setAttribute("role", "alert");
      bar.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:100;background:#7f1d1d;color:#fff;" +
        "padding:10px 14px;font:500 14px/1.4 system-ui,sans-serif;display:flex;gap:10px;" +
        "align-items:center;justify-content:center;flex-wrap:wrap;text-align:center;";
      document.body.appendChild(bar);
    }
    const msg = kind === "auth"
      ? "Boardly's server is refusing to show your data right now. Your data is safe. This is a server problem, not something you did."
      : "Boardly cannot reach its server right now. Check your internet connection. Your data is safe.";
    bar.innerHTML = "";
    const text = document.createElement("span");
    text.textContent = msg;
    const retry = document.createElement("button");
    retry.textContent = "Try again";
    retry.style.cssText = "background:#fff;color:#7f1d1d;border:0;border-radius:6px;padding:4px 10px;font-weight:600;cursor:pointer;";
    retry.onclick = () => window.location.reload();
    const close = document.createElement("button");
    close.textContent = "Dismiss";
    close.style.cssText = "background:transparent;color:#fff;border:1px solid #fff;border-radius:6px;padding:4px 10px;cursor:pointer;";
    close.onclick = () => bar.remove();
    bar.append(text, retry, close);
  } catch (e) { /* never let the banner break the app */ }
}

function boardlyHideBanner() {
  boardlyBadTimes = [];
  try {
    const bar = document.getElementById("boardly-backend-banner");
    if (bar) bar.remove();
  } catch (e) {}
}

function boardlyNoteBad(kind) {
  const now = Date.now();
  boardlyBadTimes = boardlyBadTimes.filter((t) => now - t < BOARDLY_BAD_WINDOW_MS);
  boardlyBadTimes.push(now);
  if (boardlyBadTimes.length >= 2) boardlyShowBanner(kind);
}

async function boardlyFetch(input, init) {
  const url = typeof input === "string" ? input : (input && input.url) || "";
  const watched = url.indexOf(SUPABASE_URL + "/rest/v1/") === 0 || url.indexOf(SUPABASE_URL + "/functions/v1/") === 0;
  if (!watched) return fetch(input, init);
  try {
    const res = await fetch(input, init);
    if (res.status === 401 && url.indexOf("/rest/v1/") !== -1) boardlyNoteBad("auth");
    else if (res.status >= 500) boardlyNoteBad("down");
    else if (res.ok) boardlyHideBanner();
    return res;
  } catch (err) {
    boardlyNoteBad("down");
    throw err;
  }
}

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: boardlyFetch },
});

/**
 * safeUrl(url): use for ANY link or image address that came from a person
 * (attachment links, portfolio links, published links). It only lets
 * http, https, mailto, tel and plain relative links through, so a value
 * like "javascript:alert(1)" becomes an empty string. The result is already
 * escaped for use inside an HTML attribute, so write it as href="${safeUrl(x)}"
 * and do NOT wrap it in escapeHTML again.
 */
function safeUrl(url) {
  const raw = String(url == null ? "" : url).trim();
  if (!raw) return "";
  // browsers ignore tabs, newlines and spaces inside a scheme, so test a stripped copy
  const probe = raw.replace(/[\u0000-\u0020\u007f-\u009f]/g, "");
  const hasScheme = /^[a-z][a-z0-9+.\-]*:/i.test(probe);
  if (hasScheme && !/^(https?:|mailto:|tel:)/i.test(probe)) return "";
  return raw
    .replace(/\s/g, "%20")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** True when a link is safe to navigate to from code (http, https or relative). */
function isSafeNavUrl(url) {
  const probe = String(url == null ? "" : url).replace(/[\u0000-\u0020\u007f-\u009f]/g, "");
  if (!probe) return false;
  return !/^[a-z][a-z0-9+.\-]*:/i.test(probe) || /^https?:/i.test(probe);
}

/**
 * Guards a page that should only be visible to a logged-in user.
 * Call this at the top of dashboard.js / settings.js.
 * Redirects to login.html if there is no active session.
 */
async function requireSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }

  // "Remember me" was unchecked at login, and this is a fresh browser
  // session (sessionStorage's marker only survives page reloads, not a
  // full browser close/reopen) - honor that choice and sign out instead
  // of silently staying logged in.
  if (localStorage.getItem("boardly-remember-me") === "0" && !sessionStorage.getItem("boardly-session-active")) {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
    return null;
  }
  sessionStorage.setItem("boardly-session-active", "1");

  return session;
}

/**
 * Guards a page that should only be visible to a logged-OUT visitor
 * (login.html / signup.html). Bounces already-logged-in users straight
 * to Home so they don't see a login form for no reason.
 */
async function redirectIfLoggedIn() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    window.location.href = "home.html";
  }
}

/**
 * Best-effort activity/event log entry - the foundation piece for
 * Autopilot, Opportunity Radar, and a real audit trail (see
 * schema_v47_activity_log.sql). Never throws and never blocks the
 * action it's attached to, same discipline as logSecurityEvent above.
 */
async function logActivity(eventType, payload, taskId, boardId) {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    await supabaseClient.from("activity_events").insert({
      user_id: user.id,
      board_id: boardId || null,
      task_id: taskId || null,
      event_type: eventType,
      payload: payload || {},
    });
  } catch {
    // Table may not exist yet on this project (schema_v47 not run) or
    // the network may be down - either way, silently skip.
  }
}

/**
 * Best-effort security/audit log entry (Settings -> Security shows the
 * last 90 days of these). Never throws and never blocks the action it's
 * attached to - a failed log write (e.g. schema_v35 not run yet) should
 * never stop the real thing the person was doing from working.
 */
async function logSecurityEvent(eventType, description, boardId) {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    await supabaseClient.from("security_events").insert({
      user_id: user.id,
      event_type: eventType,
      description,
      board_id: boardId || null,
    });
  } catch {
    // Table may not exist yet on this project (schema_v35 not run) or the
    // network may be down - either way, silently skip. This is a log, not
    // a critical path.
  }
}
