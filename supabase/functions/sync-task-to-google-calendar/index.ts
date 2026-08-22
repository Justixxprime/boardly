// ==========================================================================
// BOARDLY - sync-task-to-google-calendar Edge Function
// Deploy with:  supabase functions deploy sync-task-to-google-calendar
//
// Called by the browser right after a task with a due date is
// created, edited, or deleted - see dashboard.js's syncTaskToGoogleCalendar().
// Fire-and-forget on purpose: if this fails (not connected, Google is
// down, token expired and refresh also failed), the task itself has
// already been saved successfully in Boardly - a calendar sync hiccup
// should never look like the ticket itself failed to save.
//
// This function does three things depending on what's asked:
//   upsert  - create the event if it's new, or update it if
//             task.google_event_id already points to one
//   delete  - remove the matching event (task was deleted, or its due
//             date was cleared)
//
// No new secrets beyond what google-oauth-callback already needs
// (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) plus the usual
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY every function gets.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

async function getFreshAccessToken(admin: any, userId: string) {
  const { data: conn } = await admin.from("calendar_connections").select("*").eq("user_id", userId).eq("provider", "google").maybeSingle();
  if (!conn) return null;

  // Tokens are valid for about an hour - refresh a little early (60s
  // buffer) rather than right at the edge of expiry.
  if (new Date(conn.expires_at).getTime() > Date.now() + 60000) return conn.access_token;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const refreshed = await res.json();
  if (!res.ok || !refreshed.access_token) return null;

  await admin
    .from("calendar_connections")
    .update({ access_token: refreshed.access_token, expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString() })
    .eq("user_id", userId)
    .eq("provider", "google");

  return refreshed.access_token;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth token" }, 401);

  let action: string, taskId: string, title: string, dueDate: string | null, notes: string | null;
  try {
    const body = await request.json();
    action = body.action;
    taskId = body.taskId;
    title = body.title || "Untitled";
    dueDate = body.dueDate || null;
    notes = body.notes || null;
  } catch {
    return json({ error: "Bad request body" }, 400);
  }
  if (!taskId) return json({ error: "Missing taskId" }, 400);

  const callerClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) return json({ error: "Could not verify who you are" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const accessToken = await getFreshAccessToken(admin, user.id);
  if (!accessToken) return json({ ok: true, skipped: "not-connected" }); // quietly do nothing - most people won't have this connected

  const { data: task } = await admin.from("tasks").select("id, google_event_id, user_id").eq("id", taskId).single();
  if (!task || task.user_id !== user.id) return json({ error: "Ticket not found" }, 404);

  const gcalHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const { data: conn } = await admin.from("calendar_connections").select("calendar_id").eq("user_id", user.id).eq("provider", "google").single();
  const calendarId = conn?.calendar_id || "primary";
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

  if (action === "delete" || !dueDate) {
    if (task.google_event_id) {
      await fetch(`${base}/${task.google_event_id}`, { method: "DELETE", headers: gcalHeaders }).catch(() => {});
      await admin.from("tasks").update({ google_event_id: null }).eq("id", taskId);
    }
    return json({ ok: true, deleted: true });
  }

  const eventBody = {
    summary: title,
    description: notes || undefined,
    start: { date: dueDate }, // all-day event - Boardly tasks have a due date, not a specific time
    end: { date: dueDate },
    source: { title: "Boardly", url: "https://justixxprime.github.io/boardly/dashboard.html" },
  };

  if (task.google_event_id) {
    const res = await fetch(`${base}/${task.google_event_id}`, { method: "PATCH", headers: gcalHeaders, body: JSON.stringify(eventBody) });
    if (res.status === 404) {
      // The event was deleted on the Google side (e.g. by the person,
      // directly in Google Calendar) - recreate it instead of failing.
      const created = await fetch(base, { method: "POST", headers: gcalHeaders, body: JSON.stringify(eventBody) });
      const createdData = await created.json();
      if (created.ok) await admin.from("tasks").update({ google_event_id: createdData.id }).eq("id", taskId);
      return json({ ok: created.ok });
    }
    return json({ ok: res.ok });
  }

  const created = await fetch(base, { method: "POST", headers: gcalHeaders, body: JSON.stringify(eventBody) });
  const createdData = await created.json();
  if (created.ok) await admin.from("tasks").update({ google_event_id: createdData.id }).eq("id", taskId);
  return json({ ok: created.ok, error: created.ok ? undefined : createdData.error?.message });
});
