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
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, user_id, title, reminder_at")
    .neq("status", "done")
    .not("reminder_at", "is", null)
    .is("reminder_email_sent_at", null)
    .lte("reminder_at", now)
    .limit(100);

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
    await supabase.from("tasks").update({ reminder_email_sent_at: new Date().toISOString() }).eq("id", task.id);
    sent++;
  }
  return json({ sent });
});
