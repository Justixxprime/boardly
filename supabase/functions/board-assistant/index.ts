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
// OPTIONAL BACKUP PROVIDER - OpenRouter (see OPENROUTER_BACKUP_SETUP.md):
//   supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
// If this secret is set, Boardly automatically falls back to OpenRouter's
// free tier any time Groq fails (rate-limited, briefly down, etc.) - you
// never notice a thing, the reply just still arrives. If you never set
// this secret, nothing changes: Boardly behaves exactly as it always has,
// Groq-only. Also completely free, no credit card, same "Charles holds
// one key server-side" architecture as everything else in Boardly.
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
    const { message, tasks, categories, boardBrief, imageBase64, workType, verticalFields } = await req.json();
    const groqKey = Deno.env.get("GROQ_API_KEY");
    const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!groqKey && !openRouterKey) {
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
  {"type":"create","title":"<task title>","category":"work"|"urgent"|"general"|"<existing category>","due_date":"YYYY-MM-DD"|null,"platform":"instagram"|"facebook"|"x"|"linkedin"|"tiktok"|"youtube"|"website"|"email"|null,"notes":"<caption/brief text>"|null,"subtasks":["<checklist item>",...]|null,"reminder_at":"<ISO 8601 timestamp with UTC offset>"|null,"task_type":"<see VERTICAL TYPES below>"|null,"metadata":{"<field key>":"<value>",...}|null}
  {"type":"update","id":"<task id>","title"?,"category"?,"due_date"?,"platform"?,"notes"?,"subtasks"?:["<checklist item>",...],"task_type"?,"metadata"?:{"<field key>":"<value>",...}}
  {"type":"complete","id":"<task id>"}
  {"type":"delete","id":"<task id>"}
  {"type":"move","id":"<task id>","status":"todo"|"inprogress"|"done"}
  {"type":"delete_by_status","status":"todo"|"inprogress"|"done"}
  {"type":"move_by_status","from":"todo"|"inprogress"|"done","to":"todo"|"inprogress"|"done"}
  {"type":"add_commitment","what":"<the promise>","to_whom":"<who it was promised to>"|null,"due_date":"YYYY-MM-DD"|null}
  {"type":"add_waiting_item","what":"<what they're waiting for>","who":"<who it's from>"|null,"importance":"normal"|"important"}
Use "create" whenever they ask you to add, write, or plan out one or more NEW tasks/todos - return
one create action per task, in a sensible order. If they describe a multi-step goal ("plan my week",
"write me a packing checklist"), break it into several concrete create actions rather than one vague
one. Use "update" for anything about a ticket that already exists - this includes writing or
rewriting its caption (put that text in "notes"), adding checklist items to it ("subtasks", these are
added to whatever checklist it already has, not replacing it), changing what platform it's for, or
renaming/recategorizing/rescheduling it. Use "move" when they ask to change what stage/column a
ticket is in (they may say "stage," "column," "status," or name the column directly, e.g. "move this
to done" or "put it in progress") - "to do," "in progress," and "done" are Boardly's three stages.
Infer a reasonable due_date from phrases like "tomorrow", "Friday", "next week" relative to today's
date; otherwise use null. Use delete_by_status for requests like "clear my done column" - that one
action clears the whole column, you do not need to list every task's id individually. Use
move_by_status for requests like "move everything in progress back to to do". Match existing tasks
by title similarity to find an id for single-task actions - if nothing in the task list is a
plausible match for what they're describing, say so in your reply rather than guessing at an id.
For a task that's for a specific social platform, set "platform" to that channel and put any
caption/copy you write into "notes" - do not put caption text in the title. Use "subtasks" for a
short checklist (5 items or fewer) when the task genuinely needs one; omit it otherwise - do not
invent a checklist for a simple one-line task. Set
"reminder_at" only when the user's message or a board brief specifies (or clearly implies) a
publish/reminder time - always as a full ISO 8601 timestamp including an explicit UTC offset (e.g.
"2026-03-14T09:00:00+01:00" for 9 AM West Africa Time), never a bare date or a local time with no
offset, since without an explicit offset the time would be interpreted wrong.

VERTICAL TYPES AND FIELDS: this board's own default type is "${workType || "general"}". Each task
also carries its own task_type in the data you're given - null means it just inherits the board's
type, a real value means that ONE task was deliberately set to a different type than the rest of the
board (Boardly supports mixed boards - see schema_v28_task_type_override.sql). Only set "task_type" on
an action when the user's request clearly describes a different kind of work than the task's current
type (e.g. "add a delivery task for the Johnson order" on a non-logistics board) - never set it just
because a field name happens to match; leave it null/omitted the rest of the time.${verticalFields ? `
The available extra fields per type, and their exact key names to use inside "metadata", are:
${JSON.stringify(verticalFields)}
Only ever use keys that exist for that task's actual type (its own task_type if set, otherwise the
board's own "${workType || "general"}"). Every metadata value is a plain string. When updating,
"metadata" is merged into whatever's already there - it never replaces the whole object, so omit any
key you don't want to change.` : " This board hasn't set up vertical fields yet, so never include a\n\"metadata\" object in any action."} If the message starts
with "Emergency mode:" the user has stated how much time they actually have right now and wants a
realistic plan for that window, not a wish list - sort their open tasks into four groups: MUST DO
(genuinely needs to happen in this window - real deadlines, real consequences), CAN DEFER (fine to
push to another day), CAN DELEGATE (someone else could reasonably do this), CAN AUTOMATE (a
repeatable/mechanical task Boardly's other features could reduce next time, like a recurring
reminder). Be honest about what fits - if the stated time genuinely isn't enough for everything in
MUST DO, say so plainly rather than padding the list to look complete. Do not include board actions
for this kind of message unless the user separately asks you to actually move or complete something -
the plan itself is the answer.

If the message starts with "Capture mode:" the user has dumped a messy block of text (notes typed in
a hurry, a voice-to-text transcript, a stream of half-finished thoughts) and wants it sorted, not
answered conversationally. Read through it and, for each distinct thing you find, decide what kind of
thing it actually is, then return the matching action - do not put everything into "create" just
because that's the most familiar one. A line like "waiting on the designer for the logo" or "still
haven't heard back from the client about the budget" is an add_waiting_item, not a task - there is
nothing for the user to go do, the next move belongs to someone else. A line like "I told the client
I'd have the draft by Friday" or "promised Sarah I'd review her essay tomorrow" is an add_commitment -
a promise made TO someone, not a normal to-do. Everything else that's a real piece of work the user
themselves needs to do becomes a create action, same rules as usual. Keep your reply short - a
one-line summary of what you sorted it into (e.g. "Added 2 tasks, 1 commitment, and 1 waiting-on
item.") is enough, the actions themselves are the real answer. If a line is too vague to place
confidently (not clearly a task, promise, or wait), leave it out of the actions and mention it briefly
in your reply instead of guessing.

If the message includes
an attached image, look at it: if it's a screenshot of a list, whiteboard, or notes, offer to turn
the readable items into create actions; if it's a photo relevant to a task (a product, a delivery, a
design draft), describe what's relevant to the task rather than a generic description of the whole
image. If nothing needs to
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

    // Only switch to the vision model when a picture is actually attached.
    // openai/gpt-oss-120b (text only) stays the default for every normal
    // message - it's the faster, cheaper path, and most messages have no
    // image at all. qwen/qwen3.6-27b is Groq's documented vision model,
    // on the exact same free tier and API key, no separate signup:
    // https://console.groq.com/docs/vision
    const userText = `Existing categories on this board: ${JSON.stringify(categories || [])}\nTasks:\n${JSON.stringify(tasks)}\n\nMessage: ${message}`;
    const userContent = imageBase64
      ? [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: imageBase64 } },
        ]
      : userText;

    const chatMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ];

    // Two providers, tried in order. Groq first (it's faster and this is
    // the one Boardly has always used) - OpenRouter only gets a turn if
    // Groq isn't set up at all, OR Groq is set up but this particular
    // request fails (rate limit, temporary outage, bad key, etc). This
    // means: if you never touch OPENROUTER_API_KEY, behavior is 100%
    // unchanged from before. If you do set it, a Groq hiccup silently
    // repairs itself instead of showing you an error.
    async function callGroq() {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${groqKey}` },
        body: JSON.stringify({
          // llama-3.3-70b-versatile was deprecated and fully retired by Groq
          // on June 17, 2026 - openai/gpt-oss-120b is Groq's own recommended
          // replacement for it (see https://console.groq.com/docs/deprecations).
          model: imageBase64 ? "qwen/qwen3.6-27b" : "openai/gpt-oss-120b",
          max_tokens: 900,
          messages: chatMessages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `Groq API error (${res.status})`);
      return data.choices?.[0]?.message?.content as string | undefined;
    }

    async function callOpenRouter() {
      // OpenRouter's free tier (":free" model suffix) - genuinely free,
      // no credit card, rate-limited but fine as a backup path. Both
      // models below support the exact same OpenAI-shaped request Groq
      // uses, so this is a drop-in swap, not a rewrite.
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${openRouterKey}`,
          // OpenRouter asks for these two so it can list your app on its
          // free-tier leaderboard/attribution page - cosmetic only, safe
          // to leave as-is.
          "HTTP-Referer": "https://justixxprime.github.io/boardly/",
          "X-Title": "Boardly",
        },
        body: JSON.stringify({
          model: imageBase64 ? "google/gemini-2.0-flash-exp:free" : "meta-llama/llama-3.3-70b-instruct:free",
          max_tokens: 900,
          messages: chatMessages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `OpenRouter API error (${res.status})`);
      return data.choices?.[0]?.message?.content as string | undefined;
    }

    let text: string | undefined;
    let groqError: string | null = null;
    let openRouterError: string | null = null;

    if (groqKey) {
      try {
        text = await callGroq();
      } catch (err) {
        groqError = err instanceof Error ? err.message : String(err);
        // fall through to OpenRouter below, if it's set up
      }
    }

    if (text === undefined && openRouterKey) {
      try {
        text = await callOpenRouter();
      } catch (err) {
        openRouterError = err instanceof Error ? err.message : String(err);
      }
    }

    if (text === undefined) {
      // both providers that were configured (one or two of them) failed,
      // or the only configured one failed and there was no second to try.
      // Keep BOTH messages when both were attempted - overwriting Groq's
      // real error with OpenRouter's made this much harder to debug
      // (only ever saw the backup's complaint, never the primary's).
      const parts = [groqError && `Groq: ${groqError}`, openRouterError && `Backup (OpenRouter): ${openRouterError}`].filter(Boolean);
      return new Response(
        JSON.stringify({ error: parts.join(". ") || "The AI assistant didn't respond - try again in a moment." }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

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
