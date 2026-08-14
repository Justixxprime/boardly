// ===========================================================================
// BOARDLY - scheduled email reminders through Brevo
//
// Deploy: supabase functions deploy send-reminders --no-verify-jwt
// Secrets: BREVO_API_KEY, BREVO_SENDER_EMAIL, CRON_SECRET
// See REMINDERS_BREVO_SETUP.md for every setup click and command.
// ===========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Mirrors js/timely.js's nextZonedOccurrence(): given the instant a
// repeating reminder just fired, returns the next UTC instant it should
// fire at (same wall-clock time, evaluated in the task's own IANA
// timezone so DST is handled correctly), stepping by 1 day for
// "daily"/"weekdays" (skipping Sat/Sun for "weekdays") or 7 days for
// "weekly". Deno's Intl fully supports the `timeZone` option used here,
// same as a browser.
function nextZonedOccurrence(currentUtcIso: string, timeZone: string | null, recurrence: string): Date | null {
  const tz = timeZone || "UTC";
  const current = new Date(currentUtcIso);
  const hh = current.toLocaleString("en-US", { timeZone: tz, hour12: false, hour: "2-digit" }).padStart(2, "0");
  const mm = current.toLocaleString("en-US", { timeZone: tz, minute: "2-digit" }).padStart(2, "0");
  const stepDays = recurrence === "weekly" ? 7 : 1;

  let cursor = new Date(current.getTime() + stepDays * 24 * 60 * 60 * 1000);
  for (let i = 0; i < 14; i++) {
    const y = cursor.toLocaleString("en-US", { timeZone: tz, year: "numeric" });
    const m = cursor.toLocaleString("en-US", { timeZone: tz, month: "2-digit" });
    const d = cursor.toLocaleString("en-US", { timeZone: tz, day: "2-digit" });
    const dow = new Date(`${y}-${m}-${d}T12:00:00Z`).getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    if (recurrence !== "weekdays" || !isWeekend) {
      const naiveUtc = new Date(`${y}-${m}-${d}T${hh}:${mm}:00Z`);
      const asTz = new Date(naiveUtc.toLocaleString("en-US", { timeZone: tz }));
      const asUtc = new Date(naiveUtc.toLocaleString("en-US", { timeZone: "UTC" }));
      return new Date(naiveUtc.getTime() + (asUtc.getTime() - asTz.getTime()));
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return null;
}

Deno.serve(async (request) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const brevoKey = Deno.env.get("BREVO_API_KEY");
  const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL");
  if (!brevoKey || !senderEmail) return json({ error: "Missing Brevo secrets" }, 500);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const now = new Date().toISOString();
  let { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, user_id, title, reminder_at, reminder_repeat, timezone")
    .neq("status", "done")
    .not("reminder_at", "is", null)
    .is("reminder_email_sent_at", null)
    .lte("reminder_at", now)
    .limit(100);

  // schema_v7_reminder_repeat.sql not run yet on this project - fall back
  // to the original column set so one-off email reminders keep working
  // exactly as before; repeating ones just won't be recognised until the
  // migration is run (same graceful-degradation pattern as the client).
  if (error && /reminder_repeat/i.test(error.message || "")) {
    ({ data: tasks, error } = await supabase
      .from("tasks")
      .select("id, user_id, title, reminder_at")
      .neq("status", "done")
      .not("reminder_at", "is", null)
      .is("reminder_email_sent_at", null)
      .lte("reminder_at", now)
      .limit(100));
  }

  if (error) return json({ error: error.message }, 500);
  let sent = 0;

  for (const task of tasks || []) {
    const { data: userResult, error: userError } = await supabase.auth.admin.getUserById(task.user_id);
    const email = userResult?.user?.email;
    if (userError || !email) continue;

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoKey, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: "Boardly", email: senderEmail },
        to: [{ email }],
        subject: `Boardly reminder: ${task.title}`,
        textContent: `Reminder: ${task.title}\n\nOpen Boardly to view or complete this ticket.`,
      }),
    });

    if (!response.ok) {
      console.error("Brevo send failed", task.id, await response.text());
      continue;
    }

    if (task.reminder_repeat) {
      // Roll forward instead of marking permanently sent, so the next
      // occurrence still matches this query once its time comes around.
      const nextAt = nextZonedOccurrence(task.reminder_at, task.timezone, task.reminder_repeat);
      if (nextAt) {
        await supabase.from("tasks").update({ reminder_at: nextAt.toISOString() }).eq("id", task.id);
      } else {
        await supabase.from("tasks").update({ reminder_email_sent_at: new Date().toISOString() }).eq("id", task.id);
      }
    } else {
      await supabase.from("tasks").update({ reminder_email_sent_at: new Date().toISOString() }).eq("id", task.id);
    }
    sent++;
  }
  return json({ sent });
});
