// ==========================================================================
// BOARDLY - auto-advance Edge Function ("Timely")
// Deploy with:  supabase functions deploy auto-advance
// Then schedule it to run every minute - see TIMELY_SETUP.md.
//
// Needs one secret (shared with send-push, set it once):
//   supabase secrets set CRON_SECRET=<any random string you make up>
//
// What it does: moves a ticket from To do -> In progress the moment its
// auto_start_at passes, and from In progress -> Done the moment its
// auto_done_at passes (or auto_start_at + auto_duration_minutes, if a
// duration was set instead of a fixed done time). Runs server-side on a
// schedule, so it still happens even if Boardly is closed on every
// device - the client-side timer in timely.js does the same thing
// instantly while the app is open, this is what covers the rest of the
// time.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = request.headers.get("authorization") || "";
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: "Unauthorized - set CRON_SECRET and call this with a matching Authorization header" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const nowIso = new Date().toISOString();
  let started = 0;
  let finished = 0;

  const { data: toStart, error: startErr } = await supabase
    .from("tasks")
    .select("id, auto_duration_minutes")
    .eq("status", "todo")
    .not("auto_start_at", "is", null)
    .lte("auto_start_at", nowIso)
    .limit(300);
  if (startErr) return json({ error: startErr.message }, 500);

  for (const t of toStart || []) {
    const patch: Record<string, unknown> = { status: "inprogress" };
    if (t.auto_duration_minutes) {
      patch.auto_done_at = new Date(Date.now() + t.auto_duration_minutes * 60000).toISOString();
    }
    await supabase.from("tasks").update(patch).eq("id", t.id);
    started++;
  }

  const { data: toFinish, error: finishErr } = await supabase
    .from("tasks")
    .select("id")
    .eq("status", "inprogress")
    .not("auto_done_at", "is", null)
    .lte("auto_done_at", nowIso)
    .limit(300);
  if (finishErr) return json({ error: finishErr.message }, 500);

  for (const t of toFinish || []) {
    await supabase.from("tasks").update({ status: "done" }).eq("id", t.id);
    finished++;
  }

  // Opt-in: users with auto_start_on_due set also get plain-due-date
  // tickets (no explicit auto_start_at) started automatically once the
  // date arrives, mirroring the same toggle in the client's More menu.
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: dueUsers } = await supabase.from("user_settings").select("user_id").eq("auto_start_on_due", true);
  let dueStarted = 0;
  for (const u of dueUsers || []) {
    const { data: dueTasks } = await supabase
      .from("tasks")
      .select("id")
      .eq("user_id", u.user_id)
      .eq("status", "todo")
      .is("auto_start_at", null)
      .not("due_date", "is", null)
      .lte("due_date", todayStr)
      .limit(100);
    for (const t of dueTasks || []) {
      await supabase.from("tasks").update({ status: "inprogress" }).eq("id", t.id);
      dueStarted++;
    }
  }

  return json({ started, finished, dueStarted });
});
