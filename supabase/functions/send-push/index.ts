// ==========================================================================
// BOARDLY - send-push Edge Function ("Timely")
// Deploy with:  supabase functions deploy send-push
// Then schedule it to run every minute - see TIMELY_SETUP.md.
//
// Needs three secrets set first:
//   supabase secrets set VAPID_PUBLIC_KEY=...
//   supabase secrets set VAPID_PRIVATE_KEY=...
//   supabase secrets set VAPID_SUBJECT=mailto:you@example.com
//   supabase secrets set CRON_SECRET=<any random string you make up>
// Generate the VAPID pair with: npx web-push generate-vapid-keys
//
// What it does: finds tickets with a reminder_at (or a snooze) that has
// arrived and hasn't been pushed yet, and sends a real Web Push
// notification to every device you've enabled alerts on. This is what
// wakes the phone even if the Boardly tab isn't open - the OS delivers it
// straight to the service worker (sw.js), which is what shows the loud
// notification with Snooze/Open actions.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = request.headers.get("authorization") || "";
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: "Unauthorized - set CRON_SECRET and call this with a matching Authorization header" }, 401);
  }

  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:you@example.com";
  if (!vapidPublic || !vapidPrivate) {
    return json({ error: "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY aren't set - see TIMELY_SETUP.md" }, 500);
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const now = new Date();
  const nowIso = now.toISOString();

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, user_id, title, reminder_at, reminder_snoozed_until, alarm_sound, reminder_push_sent_at, reminder_push_count, reminder_acked_at")
    .neq("status", "done")
    .not("reminder_at", "is", null)
    .is("reminder_acked_at", null)
    .lte("reminder_at", nowIso)
    .limit(200);

  if (error) return json({ error: error.message }, 500);

  const MAX_ESCALATIONS = 5; // stop re-alerting after this many pushes for one reminder
  const RESEND_EVERY_MS = 5 * 60 * 1000; // re-push every 5 minutes while unacknowledged

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const task of tasks || []) {
    if (task.reminder_snoozed_until && new Date(task.reminder_snoozed_until) > now) {
      skipped++;
      continue;
    }
    const count = task.reminder_push_count || 0;
    if (count >= MAX_ESCALATIONS) {
      skipped++;
      continue;
    }
    // First push for this reminder goes out immediately; every push after
    // that waits for RESEND_EVERY_MS since the last one, so it escalates
    // (re-alerts) instead of just firing once and going silent.
    if (task.reminder_push_sent_at && now.getTime() - new Date(task.reminder_push_sent_at).getTime() < RESEND_EVERY_MS) {
      skipped++;
      continue;
    }

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", task.user_id);

    let anySent = false;
    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: count > 0 ? `Boardly alarm (still waiting - reminder ${count + 1})` : "Boardly alarm",
            body: task.title,
            taskId: task.id,
            sound: task.alarm_sound || "siren",
          })
        );
        sent++;
        anySent = true;
      } catch (err) {
        failed++;
        const statusCode = (err as { statusCode?: number })?.statusCode;
        // 404/410 means the browser unsubscribed or the subscription
        // expired - clean it up so future runs don't keep retrying it.
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }

    if (anySent || !subs?.length) {
      await supabase.from("tasks").update({
        reminder_push_sent_at: nowIso,
        reminder_push_count: count + 1,
      }).eq("id", task.id);
    }
  }

  return json({ checked: tasks?.length || 0, sent, failed, skipped });
});
