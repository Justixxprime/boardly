// ==========================================================================
// BOARDLY - generate-embedding Edge Function
// Deploy with:  supabase functions deploy generate-embedding
// (no --no-verify-jwt here on purpose - unlike the Client Portal
// functions, this one is only ever called by a signed-in Boardly
// user, so it should require their normal login, which Supabase's
// gateway checks automatically before this code even runs.)
//
// WHY GEMINI: of the realistic free options, Google's Gemini API is
// the best fit for embeddings specifically - genuinely free forever
// (not a trial that expires), no credit card required to start, and
// it's a "you hold one key, server-side" model like everything else
// in Boardly - nobody using your app needs their own separate account
// (unlike Puter.js, which needs every end user to sign up and pay for
// their own usage through a third party - not what Boardly wants).
//
// This function is deliberately small and single-purpose: give it
// text, get back a 768-number vector representing that text's
// meaning. It doesn't know or care whether that text is a task, a
// decision, or a search query - see memory-vault.js for how the
// "Build search index" button and the search box both call this same
// function for their two different jobs (one embeds stored content,
// the other embeds what you just typed to search for).
//
// SECRET NEEDED: GEMINI_API_KEY - see MEMORY_VAULT_EMBEDDINGS_SETUP.md
// for exactly how to get one (free, no card) and add it as a secret:
//   supabase secrets set GEMINI_API_KEY=your_key_here
// ==========================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

const EMBEDDING_DIMENSIONS = 768; // must match the vector(768) columns in schema_v29

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  let text: string, taskType: string;
  try {
    const body = await request.json();
    text = String(body.text || "").trim();
    taskType = body.taskType === "RETRIEVAL_QUERY" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT";
  } catch {
    return json({ error: "Bad request - expected { text, taskType? }" }, 400);
  }
  if (!text) return json({ error: "Nothing to embed - text was empty" }, 400);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return json({ error: "GEMINI_API_KEY isn't set up yet. See MEMORY_VAULT_EMBEDDINGS_SETUP.md for how to get a free key and add it." }, 500);
  }

  // Gemini caps embedding input around 2,048 tokens - trimming to a safe
  // character count up front avoids a confusing API error on a long note.
  const trimmedText = text.length > 8000 ? text.slice(0, 8000) : text;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text: trimmedText }] },
        taskType,
        outputDimensionality: EMBEDDING_DIMENSIONS,
      }),
    }
  );

  if (!geminiRes.ok) {
    const errBody = await geminiRes.text();
    return json({ error: `Gemini returned an error (status ${geminiRes.status}): ${errBody.slice(0, 300)}` }, 502);
  }

  const data = await geminiRes.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
    return json({ error: "Gemini's response didn't include a usable embedding" }, 502);
  }

  return json({ embedding: values });
});
