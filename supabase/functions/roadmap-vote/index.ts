// ==========================================================================
// BOARDLY - roadmap-vote Edge Function
// Deploy with:  supabase functions deploy roadmap-vote --no-verify-jwt
//
// Same reasoning as get-public-roadmap: an anonymous visitor voting on a
// public roadmap has no Boardly login to send.
//
// Abuse prevention here is intentionally simple, matching how most
// small public voting features on the internet actually work: the
// visitor's browser generates a random id once (see roadmap.html) and
// remembers it in localStorage, sent with every vote. The real
// enforcement is server-side though, not just a client-side check
// anyone could bypass - idea_votes has a unique constraint on
// (idea_id, voter_id) (see schema_v44_public_roadmap.sql), so a repeat
// vote from the same remembered voter_id is rejected by the database
// itself, not just politely ignored by the frontend.
// ==========================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  let token: string, ideaId: string, voterId: string;
  try {
    const parsed = await request.json();
    token = String(parsed.token || "");
    ideaId = String(parsed.ideaId || "");
    voterId = String(parsed.voterId || "").slice(0, 100);
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!token || !ideaId || !voterId) return json({ error: "Missing fields" }, 400);

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: board, error: boardError } = await admin
    .from("boards").select("id").eq("roadmap_public_token", token).maybeSingle();
  if (boardError || !board) return json({ error: "This roadmap link isn't valid." }, 404);

  // Confirm the idea actually belongs to THIS roadmap before letting a
  // vote through - otherwise a crafted request could vote on any idea
  // id from any board just by guessing/enumerating ids.
  const { data: idea, error: ideaError } = await admin
    .from("ideas").select("id, votes").eq("id", ideaId).eq("board_id", board.id).maybeSingle();
  if (ideaError || !idea) return json({ error: "That idea isn't part of this roadmap." }, 404);

  const { error: voteError } = await admin.from("idea_votes").insert({ idea_id: ideaId, voter_id: voterId });
  if (voteError) {
    // Unique-constraint violation = this voter already voted on this
    // idea - a normal, expected outcome, not a real error.
    if (voteError.code === "23505") return json({ error: "You've already voted on this one." }, 409);
    return json({ error: voteError.message }, 500);
  }

  return json({ ok: true, votes: idea.votes + 1 });
});
