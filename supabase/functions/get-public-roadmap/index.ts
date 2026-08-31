// ==========================================================================
// BOARDLY - get-public-roadmap Edge Function
// Deploy with:  supabase functions deploy get-public-roadmap --no-verify-jwt
//
// Needs --no-verify-jwt for the same reason get-shared-board and
// client-portal-action do: a visitor looking at a public roadmap has no
// Boardly login token to send at all.
//
// This is the ONLY way roadmap.html reads data - there is no RLS policy
// letting anonymous visitors read someone else's ideas table directly,
// on purpose. This function uses the service role key, checks the
// board's roadmap_public_token itself, and only returns ideas in a
// public-appropriate stage (never the raw, unfiltered "idea" stage or
// anything archived) - never full task data, never anything else about
// the board or its owner beyond its name.
// ==========================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

// idea stage -> the public roadmap column it belongs in. "idea" itself
// (freshly captured, unfiltered) and "archived" are deliberately never
// shown publicly - a roadmap is for things worth other people seeing,
// not a window into every raw thought.
const STAGE_TO_COLUMN: Record<string, string> = {
  considering: "later", validated: "later",
  planned: "next",
  building: "now",
  released: "done",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  let token: string;
  try {
    const parsed = await request.json();
    token = String(parsed.token || "");
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!token) return json({ error: "Missing token" }, 400);

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: board, error: boardError } = await admin
    .from("boards")
    .select("id, name")
    .eq("roadmap_public_token", token)
    .maybeSingle();
  if (boardError || !board) return json({ error: "This roadmap link isn't valid." }, 404);

  const { data: ideas, error: ideasError } = await admin
    .from("ideas")
    .select("id, title, description, stage, votes")
    .eq("board_id", board.id)
    .in("stage", Object.keys(STAGE_TO_COLUMN))
    .order("votes", { ascending: false });
  if (ideasError) return json({ error: ideasError.message }, 500);

  const columns: Record<string, unknown[]> = { now: [], next: [], later: [], done: [] };
  for (const idea of ideas || []) {
    columns[STAGE_TO_COLUMN[idea.stage]].push({ id: idea.id, title: idea.title, description: idea.description, votes: idea.votes });
  }

  return json({ boardName: board.name, columns });
});
