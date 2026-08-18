// ==========================================================================
// BOARDLY - daily-digest Edge Function
// Deploy with:  supabase functions deploy daily-digest
// Needs two secrets set first:
//   supabase secrets set GROQ_API_KEY=gsk_...        (free, no card)
//   supabase secrets set RESEND_API_KEY=re_...        (free tier)
// Then schedule it to run every morning - full walkthrough, including the
// scheduling step, is in AI_SETUP_BABY_STEPS.md.
//
// What it does, once a day: for every account, finds tasks that are
// overdue or due today, asks a free Groq-hosted model to write a short
// plain-English summary, and emails it via Resend. Accounts with nothing
// due or overdue get skipped entirely (no empty "you have 0 tasks" email).
//
// This one runs with the service role key (auto-provided by Supabase to
// every Edge Function), which is the only way a background job can read
// every account's tasks - your everyday RLS rules still fully protect
// the database from anyone else.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const groqKey = Deno.env.get("GROQ_API_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!groqKey || !resendKey) {
    return new Response("Missing GROQ_API_KEY or RESEND_API_KEY secret", { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: users } = await supabaseAdmin.auth.admin.listUsers();
  let sent = 0;

  for (const user of users?.users || []) {
    const { data: tasks } = await supabaseAdmin
      .from("tasks")
      .select("title, due_date, status")
      .eq("user_id", user.id)
      .neq("status", "done")
      .not("due_date", "is", null)
      .lte("due_date", today);

    if (!tasks || tasks.length === 0) continue; // nothing due or overdue - skip this account
    if (!user.email) continue;

    const summaryRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        // See board-assistant/index.ts - llama-3.3-70b-versatile was
        // retired by Groq on June 17, 2026.
        model: "openai/gpt-oss-120b",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `Write a short, warm, 2-3 sentence morning summary for someone about
their overdue/due-today kanban tasks. Plain text, no markdown, no greeting like "Hi", just
the summary. Tasks: ${JSON.stringify(tasks)}`,
        }],
      }),
    });
    const summaryData = await summaryRes.json();
    if (!summaryRes.ok) {
      console.error("Groq API error in daily-digest:", summaryData.error?.message || summaryRes.status);
    }
    const summary = summaryData.choices?.[0]?.message?.content
      || `You have ${tasks.length} task(s) due today or overdue.`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: "Boardly <onboarding@resend.dev>", // free, no domain needed - only delivers to your own Resend signup email. See AI_SETUP_BABY_STEPS.md Part C.
        to: user.email,
        subject: `Boardly: ${tasks.length} task${tasks.length === 1 ? "" : "s"} for today`,
        text: summary,
      }),
    });
    sent++;
  }

  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});
