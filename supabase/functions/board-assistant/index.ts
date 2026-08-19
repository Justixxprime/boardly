// ==========================================================================
// BOARDLY - board-assistant Edge Function
// Deploy with:  supabase functions deploy board-assistant
// Needs one secret set first (free, no credit card):
//   supabase secrets set GROQ_API_KEY=gsk_...
// Full walkthrough in AI_SETUP_BABY_STEPS.md.
//
// Runs on Groq (https://groq.com), which has a genuinely free API tier,
// no credit card required. It speaks the same request/response shape as
// OpenAI's API, which is why the fetch call below looks a little
// different from a typical Anthropic call.
//
// What it does: takes the message you typed in the "Ask AI" panel plus a
// trimmed-down list of your current board's tasks, asks the model to
// reply AND (optionally) propose simple actions, then hands both back to
// the browser. The browser is the one that actually applies any actions
// (complete/delete/move) using the exact same functions every other
// button on the board uses - this function never touches your database.
// ==========================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const { message, tasks, categories, boardBrief } = await req.json();
    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GROQ_API_KEY isn't set yet - see AI_SETUP_BABY_STEPS.md" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const systemPrompt = `You are Boardly's board assistant. You see a user's kanban board tasks as JSON
and a message from them. Today's date is ${today}. Reply conversationally in under 80 words.
If their message asks you to change the board, add, write, or plan tasks for them, also return an
"actions" array. Each action is one of:
  {"type":"create","title":"<task title>","category":"work"|"urgent"|"general"|"<existing category>","due_date":"YYYY-MM-DD"|null,"platform":"instagram"|"facebook"|"x"|"linkedin"|"tiktok"|"youtube"|"website"|"email"|null,"notes":"<caption/brief text>"|null,"subtasks":["<checklist item>",...]|null,"reminder_at":"<ISO 8601 timestamp with UTC offset>"|null}
  {"type":"update","id":"<task id>","title"?,"category"?,"due_date"?,"platform"?,"notes"?}
  {"type":"complete","id":"<task id>"}
  {"type":"delete","id":"<task id>"}
  {"type":"move","id":"<task id>","status":"todo"|"inprogress"|"done"}
  {"type":"delete_by_status","status":"todo"|"inprogress"|"done"}
  {"type":"move_by_status","from":"todo"|"inprogress"|"done","to":"todo"|"inprogress"|"done"}
Use "create" whenever they ask you to add, write, or plan out one or more tasks/todos - return one
create action per task, in a sensible order. If they describe a multi-step goal ("plan my week",
"write me a packing checklist"), break it into several concrete create actions rather than one vague
one. Infer a reasonable due_date from phrases like "tomorrow", "Friday", "next week" relative to
today's date; otherwise use null. Use update to rename, recategorize, or reschedule an existing
task they refer to. Use delete_by_status for requests like "clear my done column" - that one action
clears the whole column, you do not need to list every task's id individually. Use move_by_status
for requests like "move everything in progress back to to do". Match existing tasks by title
similarity to find an id for single-task actions. For a task that's for a specific social platform,
set "platform" to that channel and put any caption/copy you write into "notes" - do not put caption
text in the title. Use "subtasks" for a short checklist (5 items or fewer) when the task genuinely
needs one; omit it otherwise - do not invent a checklist for a simple one-line task. Set
"reminder_at" only when the user's message or a board brief specifies (or clearly implies) a
publish/reminder time - always as a full ISO 8601 timestamp including an explicit UTC offset (e.g.
"2026-03-14T09:00:00+01:00" for 9 AM West Africa Time), never a bare date or a local time with no
offset, since without an explicit offset the time would be interpreted wrong. If nothing needs to
change, omit "actions" or return an empty array. Only ever return valid JSON, nothing else, in
exactly this shape:
{"reply": "...", "actions": [...]}${boardBrief ? `

This board has its own custom brief from the user - follow it for every reply and action on this
board, in addition to everything above. If it conflicts with a general instruction above, the brief
wins for anything specific to this board (tone, required fields, contact info, scheduling times,
etc.); the JSON action format above always still applies regardless of what the brief says, since
that's how your reply actually reaches the board.

BOARD BRIEF:
${String(boardBrief).slice(0, 6000)}` : ""}`;

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // llama-3.3-70b-versatile was deprecated and fully retired by Groq
        // on June 17, 2026 - openai/gpt-oss-120b is Groq's own recommended
        // replacement for it (see https://console.groq.com/docs/deprecations).
        model: "openai/gpt-oss-120b",
        max_tokens: 900,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Existing categories on this board: ${JSON.stringify(categories || [])}\nTasks:\n${JSON.stringify(tasks)}\n\nMessage: ${message}` },
        ],
      }),
    });

    const groqData = await groqRes.json();

    if (!groqRes.ok) {
      // surface the real reason (bad API key, invalid model, rate limit, etc.)
      // instead of pretending the assistant just "didn't understand"
      return new Response(
        JSON.stringify({ error: groqData.error?.message || `Groq API error (${groqRes.status})` }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const text: string | undefined = groqData.choices?.[0]?.message?.content;
    let parsed = { reply: text || "I didn't get a usable reply back, try asking again.", actions: [] };
    try {
      const jsonMatch = text?.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // model didn't return clean JSON - fall back to plain text reply above
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
