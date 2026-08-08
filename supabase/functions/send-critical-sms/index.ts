// ==========================================================================
// BOARDLY - send-critical-sms Edge Function ("Timely+")
// Deploy with:  supabase functions deploy send-critical-sms
// Schedule it to run every minute alongside send-push and auto-advance.
//
// Needs these secrets (in addition to CRON_SECRET, already set):
//   supabase secrets set TWILIO_ACCOUNT_SID=AC...
//   supabase secrets set TWILIO_AUTH_TOKEN=...
//   supabase secrets set TWILIO_FROM_NUMBER=+1...
// Free trial account works for testing (Twilio makes you verify each
// destination number first on a trial account - fine for personal use,
// see TIMELY_SETUP.md).
//
// What it does: for tickets marked "critical" with a phone number saved
// (edit modal -> "Critical ticket"), if the reminder has been due and
// unacknowledged for more than CRITICAL_GRACE_MS, sends exactly one SMS.
// This is deliberately the last resort, not the first thing that fires -
// push (send-push) already tried, more than once, before this ever runs.
// A text message is the one thing here that can actually get through a
// phone's silent mode / Do Not Disturb, which is the whole point of it
// existing as a fallback rather than the primary alert.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const CRITICAL_GRACE_MS = 3 * 60 * 1000; // give push 3 minutes to work first

Deno.serve(async (request) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = request.headers.get("authorization") || "";
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!sid || !token || !from) {
    return json({ error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER aren't set - see TIMELY_SETUP.md" }, 500);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const now = new Date();
  const cutoff = new Date(now.getTime() - CRITICAL_GRACE_MS).toISOString();

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, user_id, title")
    .eq("critical", true)
    .neq("status", "done")
    .is("reminder_acked_at", null)
    .is("critical_alert_sent_at", null)
    .not("reminder_at", "is", null)
    .lte("reminder_at", cutoff)
    .limit(100);

  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  let failed = 0;
  let noPhone = 0;

  for (const task of tasks || []) {
    const { data: settings } = await supabase
      .from("user_settings")
      .select("notify_phone")
      .eq("user_id", task.user_id)
      .maybeSingle();

    if (!settings?.notify_phone) {
      noPhone++;
      continue;
    }

    try {
      const body = new URLSearchParams({
        To: settings.notify_phone,
        From: from,
        Body: `Boardly: you missed "${task.title}" - open the app when you can.`,
      });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      if (!res.ok) throw new Error(await res.text());
      sent++;
    } catch (err) {
      failed++;
      console.error("Twilio send failed for task", task.id, err);
      continue; // don't mark critical_alert_sent_at if it actually failed - retry next minute
    }

    await supabase.from("tasks").update({ critical_alert_sent_at: now.toISOString() }).eq("id", task.id);
  }

  return json({ checked: tasks?.length || 0, sent, failed, noPhone });
});
