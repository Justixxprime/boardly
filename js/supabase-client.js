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
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
 * to the dashboard so they don't see a login form for no reason.
 */
async function redirectIfLoggedIn() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    window.location.href = "dashboard.html";
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
