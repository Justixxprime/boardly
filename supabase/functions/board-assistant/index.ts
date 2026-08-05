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
    const { message, tasks } = await req.json();
    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GROQ_API_KEY isn't set yet - see AI_SETUP_BABY_STEPS.md" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are Boardly's board assistant. You see a user's kanban board tasks as JSON
and a message from them. Reply conversationally in under 80 words.
If their message clearly asks you to change the board, also return an "actions" array. Each action is one of:
  {"type":"complete","id":"<task id>"}
  {"type":"delete","id":"<task id>"}
  {"type":"move","id":"<task id>","status":"todo"|"inprogress"|"done"}
  {"type":"delete_by_status","status":"todo"|"inprogress"|"done"}
  {"type":"move_by_status","from":"todo"|"inprogress"|"done","to":"todo"|"inprogress"|"done"}
Use delete_by_status for requests like "clear my done column" or "delete everything in to do" -
that one action clears the whole column, you do not need to list every task's id individually.
Use move_by_status for requests like "move everything in progress back to to do".
Match tasks by title similarity to find an id for the single-task actions. If nothing needs to
change, omit "actions" or return an empty array. Only ever return valid JSON, nothing else, in
exactly this shape: {"reply": "...", "actions": [...]}`;

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 500,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Tasks:\n${JSON.stringify(tasks)}\n\nMessage: ${message}` },
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
