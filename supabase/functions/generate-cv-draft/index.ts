// ==========================================================================
// BOARDLY generate-cv-draft Edge Function
// Deploy with:  supabase functions deploy generate-cv-draft
//
// Same free Groq + OpenRouter fallback setup as board-assistant and
// generate-proposal-draft, one secret (GROQ_API_KEY), already set up
// if the board assistant works. See AI_SETUP_BABY_STEPS.md if not.
//
// What it does: takes whatever raw background someone pastes in (a
// messy bullet dump, an old CV's text, a few rough sentences about
// their work history) plus an optional target role, and turns it into
// CV Builder's exact data shape (js/cv-builder.js's blankResumeData()).
// Never touches the database. The browser drops the result straight
// into the CV Builder form/preview for the person to review and edit
// before they save anything.
// ==========================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const { background, targetRole } = await req.json();
    const groqKey = Deno.env.get("GROQ_API_KEY");
    const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!groqKey && !openRouterKey) {
      return new Response(JSON.stringify({ error: "GROQ_API_KEY isn't set yet (see AI_SETUP_BABY_STEPS.md)" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if (!background || !String(background).trim()) {
      return new Response(JSON.stringify({ error: "Paste in some background first." }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You turn a person's raw, messy background text into a clean, well-written CV.
You are given whatever they pasted in. This might be an old CV's text, a bullet dump, or a few rough
sentences about their work history and skills.

Only use facts that are actually present in what they gave you. Never invent employers, dates,
schools, or achievements that were not stated or clearly implied. If something is missing (e.g. no
dates given for a job), leave that field blank rather than guessing a date. You may rephrase and
tighten their own achievements into stronger, more concise bullet points, but do not invent new
achievements they didn't mention.${targetRole ? ` They're aiming this CV at a "${targetRole}" role, lean the summary and bullet phrasing toward what matters for that role, using only their real, stated experience.` : ""}

Return ONLY valid JSON, nothing else, in exactly this shape:
{
  "personal": { "fullName": "<if stated>", "title": "<a short professional title, from their stated role/field>", "email": "<if stated>", "phone": "<if stated>", "location": "<if stated>", "website": "<if stated>" },
  "summary": "<2-3 sentence professional summary, first person implied but no 'I', written from their real experience>",
  "experience": [ { "role": "", "company": "", "location": "", "startDate": "", "endDate": "", "bullets": "<one achievement per line, separated by \\n, 2-5 lines>" }, ... ],
  "education": [ { "school": "", "degree": "", "field": "", "startDate": "", "endDate": "" }, ... ],
  "skills": ["<skill>", "..."],
  "projects": [ { "name": "", "description": "", "link": "" }, ... ],
  "certifications": [ { "name": "", "issuer": "", "date": "" }, ... ],
  "languages": [ { "name": "", "level": "" }, ... ]
}

Omit an entire array (return it empty, []) if nothing in the background supports it. Do not
fabricate a certification, project, or language just to fill the shape. Leave any field "" (empty
string) if it genuinely was not given, rather than writing a placeholder.`;

    const userText = `Target role: ${targetRole || "(not specified)"}\n\nBackground:\n${String(background).slice(0, 6000)}`;
    const chatMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ];

    async function callGroq() {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          max_tokens: 1800,
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
        body: JSON.stringify({ model, max_tokens: 1800, messages: chatMessages }),
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
