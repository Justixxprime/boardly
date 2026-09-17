// ==========================================================================
// BOARDLY generate-proposal-draft Edge Function
// Deploy with:  supabase functions deploy generate-proposal-draft
//
// Uses the exact same free AI setup board-assistant already uses -
// Groq first (GROQ_API_KEY), OpenRouter as an automatic backup
// (OPENROUTER_API_KEY, optional). If board-assistant's "Ask AI" panel
// already works in your Boardly, this needs no new setup at all, it's
// the same secret. See AI_SETUP_BABY_STEPS.md if it isn't set up yet.
//
// What it does: takes a short plain-English brief (what the project
// is, roughly what it needs, any budget hint) and drafts a FULL
// proposal document in one go: feature groups, a real cost
// breakdown, a "why this price" paragraph, a timeline estimate, and a
// payment-stage schedule, shaped exactly like schema_v72's new
// proposal columns. This never touches the database and never sends
// anything to a client; it hands a draft back to the browser, which
// drops it straight into the Proposal Builder form for the person to
// read, edit, and only then save. Same "AI proposes, you approve"
// boundary as board-assistant's own actions.
// ==========================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const { brief, currency, clientName } = await req.json();
    const groqKey = Deno.env.get("GROQ_API_KEY");
    const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!groqKey && !openRouterKey) {
      return new Response(JSON.stringify({ error: "GROQ_API_KEY isn't set yet (see AI_SETUP_BABY_STEPS.md)" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if (!brief || !String(brief).trim()) {
      return new Response(JSON.stringify({ error: "Describe the project first." }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You write client-facing project proposals for Boardly, a work/client/money
platform used mostly by freelancers, small agencies, and service businesses (many in Nigeria, so
default to NGN pricing and Nigerian-market rates unless told otherwise). You are given a short brief
describing a project. Write a complete, professional, realistic proposal from it.

Only state facts that are given in the brief or that you are clearly inventing as a normal, generic
part of this type of project (e.g. "testing and deployment" is a normal line item for any website
build). Never invent specific client history, prior conversations, or claims about the club/company
that were not in the brief. If the brief doesn't say something, leave it out rather than making it up.

Return ONLY valid JSON, nothing else, in exactly this shape:
{
  "title": "<short project title>",
  "intro_text": "<2-4 sentence project overview, plain confident language, no hype words like 'supercharge' or 'unlock'>",
  "prepared_by_role": "<a short role label, e.g. 'Web Developer', guess a sensible one from the brief if not stated>",
  "feature_groups": [ { "category": "<feature category name>", "items": ["<feature>", "..."] }, ... ],
  "line_items": [ { "description": "<cost line item>", "quantity": 1, "unit_price": <number, no currency symbol or commas> }, ... ],
  "why_price_text": "<2-4 sentences explaining why the total is reasonable for the scope, honest and specific to what's actually involved, not generic sales language>",
  "timeline_text": "<a short realistic estimate, e.g. 'Approximately 5 to 6 weeks'>",
  "payment_stages": [ { "label": "<stage name>", "percent": <number> }, ... ],
  "notes_text": "<2-4 short bullet-style lines as one string separated by newlines, practical project notes like what the client needs to provide, what's excluded, how extra scope is handled>",
  "closing_text": "<2-3 sentence warm, professional closing statement>"
}

Rules: feature_groups should have 3 to 7 categories, each with 2 to 8 concrete items, grouped the way
the brief's own scope suggests (e.g. Public Website, Membership System, Payments, Admin). line_items
should be 5 to 10 real cost lines that plausibly add up to a sensible total for the described scope
(planning, design, frontend, backend, specific features mentioned, testing/deployment), do not just
return one lump-sum line, break the cost down the way a real quotation does. payment_stages percents
must sum to exactly 100, and should be 3 to 5 stages (e.g. deposit at commencement, a milestone
payment, a completion payment), use whole numbers. Currency for line_items and any money mentioned
in text is ${currency || "NGN"}.${clientName ? ` The client/organization this is for is "${clientName}".` : ""}`;

    // No artificial character cap here, the brief is sent through in full.
    // The only real ceiling is the model's own context window, not a
    // number Boardly picked.
    const userText = String(brief);
    const chatMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ];

    // Same two-provider fallback chain as board-assistant: Groq first
    // (fast, and the one Boardly has always used), OpenRouter's free
    // tier only gets a turn if Groq isn't configured or this
    // particular request fails. Leaving OPENROUTER_API_KEY unset
    // changes nothing about existing behavior.
    async function callGroq() {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          max_tokens: 6000,
          messages: chatMessages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `Groq API error (${res.status})`);
      return data.choices?.[0]?.message?.content as string | undefined;
    }

    async function callOpenRouter(model: string) {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${openRouterKey}`,
          "HTTP-Referer": "https://justixxprime.github.io/boardly/",
          "X-Title": "Boardly",
        },
        body: JSON.stringify({ model, max_tokens: 6000, messages: chatMessages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `OpenRouter API error (${res.status})`);
      return data.choices?.[0]?.message?.content as string | undefined;
    }

    const openRouterModels = ["meta-llama/llama-3.3-70b-instruct:free", "deepseek/deepseek-chat-v3-0324:free"];

    let text: string | undefined;
    let groqError: string | null = null;
    let openRouterError: string | null = null;

    if (groqKey) {
      try {
        text = await callGroq();
      } catch (err) {
        groqError = err instanceof Error ? err.message : String(err);
      }
    }

    if (text === undefined && openRouterKey) {
      const openRouterErrors: string[] = [];
      for (const model of openRouterModels) {
        try {
          text = await callOpenRouter(model);
          break;
        } catch (err) {
          openRouterErrors.push(`${model}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (text === undefined) openRouterError = openRouterErrors.join(" | ");
    }

    if (text === undefined) {
      const parts = [groqError && `Groq: ${groqError}`, openRouterError && `Backup (OpenRouter): ${openRouterError}`].filter(Boolean);
      return new Response(
        JSON.stringify({ error: parts.join(". ") || "The AI writer didn't respond, try again in a moment." }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    let draft: Record<string, unknown> | null = null;
    try {
      const jsonMatch = text?.match(/\{[\s\S]*\}/);
      if (jsonMatch) draft = JSON.parse(jsonMatch[0]);
    } catch {
      // fall through to the error below
    }
    if (!draft) {
      return new Response(JSON.stringify({ error: "The AI reply wasn't valid, try generating again." }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ draft }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
