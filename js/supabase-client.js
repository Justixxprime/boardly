/* ==========================================================================
   BOARDLY — Supabase client
   --------------------------------------------------------------------------
   1. Create a free project at https://supabase.com
   2. Go to Project Settings -> API
   3. Copy "Project URL" and "anon public" key into the two lines below
   4. Run the SQL in /supabase/schema.sql inside the Supabase SQL editor
   That's it — every page that includes this file shares one client.
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
