// ==========================================================================
// BOARDLY - respond-to-proposal Edge Function
// Deploy with:  supabase functions deploy respond-to-proposal --no-verify-jwt
//
// The only way a proposal's status can move from "sent" to "accepted"
// or "declined" - there's no RLS policy letting an anonymous client
// update a row directly, same discipline as client-portal-action and
// roadmap-vote use for their own public write paths.
//
// Deliberately a ONE-WAY door once responded to: a proposal already
// "accepted" or "declined" can't be responded to again through this
// endpoint. If a client changes their mind, that's a real conversation
// to have with whoever sent it, not a link they can just click again.
// ==========================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  let token: string, decision: string;
  try {
    const parsed = await request.json();
    token = String(parsed.token || "");
    decision = String(parsed.decision || "");
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!token) return json({ error: "Missing token" }, 400);
  if (decision !== "accepted" && decision !== "declined") return json({ error: "Invalid decision" }, 400);

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: proposal, error: findError } = await admin
    .from("proposals")
    .select("id, title, status, board_id")
    .eq("public_token", token)
    .maybeSingle();
  if (findError || !proposal) return json({ error: "This proposal link isn't valid." }, 404);
  if (proposal.status !== "sent") {
    return json({ error: `This proposal has already been ${proposal.status}.` }, 409);
  }

  const { error: updateError } = await admin
    .from("proposals")
    .update({ status: decision, responded_at: new Date().toISOString() })
    .eq("id", proposal.id);
  if (updateError) return json({ error: updateError.message }, 500);

  const { data: board } = await admin.from("boards").select("user_id").eq("id", proposal.board_id).maybeSingle();
  if (board) {
    try {
      await admin.from("notifications").insert({
        user_id: board.user_id,
        type: "proposal_response",
        title: `Proposal ${decision}: "${proposal.title}"`,
        body: decision === "accepted" ? "Good news - your proposal was accepted." : "Your proposal was declined.",
        link_url: "dashboard.html",
        board_id: proposal.board_id,
      });
    } catch {
      // notifications table may not exist yet - the response itself was already saved.
    }
  }

  return json({ ok: true, status: decision });
});
