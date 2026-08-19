// ==========================================================================
// BOARDLY - send-critical-sms Edge Function ("Timely+") - Termii edition
// Deploy with:  supabase functions deploy send-critical-sms
// Schedule it to run every minute alongside send-push and auto-advance.
//
// Uses Termii (termii.com) instead of Twilio - Nigerian-founded, and its
// "dnd" channel is specifically built to bypass Do-Not-Disturb and the
// 8PM-8AM delivery restriction Nigerian carriers otherwise enforce on
// generic/promotional routes. Twilio has known restrictions/reliability
// issues on Nigerian numbers - this is the more reliable option if
// that's where your numbers are.
//
// Needs these secrets (in addition to CRON_SECRET, already set):
//   supabase secrets set TERMII_API_KEY=your-api-key
//   supabase secrets set TERMII_SENDER_ID=Boardly
//   supabase secrets set TERMII_BASE_URL=https://api.ng.termii.com
// Get your API key and confirm your base URL from your Termii dashboard
// (accounts.termii.com) - Termii routes requests through a
// region-specific base URL shown on your own dashboard; api.ng.termii.com
// is the standard one for Nigeria-registered accounts, override the
// secret if yours is different.
// A sender ID (TERMII_SENDER_ID) needs approval in the Termii dashboard
// before it'll send on the DND route - takes a short review, do this
// before relying on it. Alphanumeric, 3-11 characters, e.g. "Boardly".
//
// What it does: for tickets marked "critical" with a phone number saved
// (edit modal -> "Critical ticket"), if the reminder has been due and
// unacknowledged for more than CRITICAL_GRACE_MS, sends exactly one SMS
// via Termii's DND (transactional) route. This is deliberately the last
// resort, not the first thing that fires - push (send-push) already
// tried, more than once, before this ever runs.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const CRITICAL_GRACE_MS = 3 * 60 * 1000; // give push 3 minutes to work first

// Termii wants international format with no leading "+" (e.g.
// "2348012345678") - normalizes whatever the person typed into the
// "Critical" phone prompt (which does accept a leading +).
function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

Deno.serve(async (request) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = request.headers.get("authorization") || "";
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const apiKey = Deno.env.get("TERMII_API_KEY");
  const senderId = Deno.env.get("TERMII_SENDER_ID") || "Boardly";
  const baseUrl = Deno.env.get("TERMII_BASE_URL") || "https://api.ng.termii.com";
  if (!apiKey) {
    return json({ error: "TERMII_API_KEY isn't set - see TIMELY_SETUP.md" }, 500);
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
      .select("notify_phone, notify_channel")
      .eq("user_id", task.user_id)
      .maybeSingle();

    // notify_channel added in schema_v15 - defaults to "both" for anyone
    // who ran that migration, and is simply undefined (falls through to
    // the ?? "both" below) for anyone who hasn't, so this never silently
    // stops SMS for someone who never touched the new setting.
    const channel = settings?.notify_channel ?? "both";
    if (channel === "off" || channel === "email") {
      continue; // this person opted out of text alerts specifically
    }

    if (!settings?.notify_phone) {
      noPhone++;
      continue;
    }

    try {
      const res = await fetch(`${baseUrl}/api/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          to: normalizePhone(settings.notify_phone),
          from: senderId,
          sms: `Boardly: you missed "${task.title}" - open the app when you can.`,
          type: "plain",
          channel: "dnd", // transactional route - bypasses DND/time restrictions, unlike "generic"
        }),
      });
      const body = await res.json();
      if (!res.ok || body?.code === "error") throw new Error(JSON.stringify(body));
      sent++;
    } catch (err) {
      failed++;
      console.error("Termii send failed for task", task.id, err);
      continue; // don't mark critical_alert_sent_at if it actually failed - retry next minute
    }

    await supabase.from("tasks").update({ critical_alert_sent_at: now.toISOString() }).eq("id", task.id);
  }

  return json({ checked: tasks?.length || 0, sent, failed, noPhone });
});
