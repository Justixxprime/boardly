// ==========================================================================
// BOARDLY - get-proposal-info Edge Function
// Deploy with:  supabase functions deploy get-proposal-info --no-verify-jwt
//
// A prospective client opening a proposal link has no Boardly login,
// same reasoning as every other public-facing function here.
//
// Refuses a proposal still in "draft" - a link only becomes reachable
// once its owner has actually sent it, the same way an unpublished
// Custom Form or unpublished Public Roadmap link is refused. "accepted"
// and "declined" proposals stay viewable on purpose, so a client can
// still open their own past proposal and see it, and so a "declined"
// status page can point them back to whoever sent it if they've
// changed their mind.
// ==========================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

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

  const { data: proposal, error } = await admin
    .from("proposals")
    .select("title, intro_text, line_items, currency, status, client_name, responded_at, board_id")
    .eq("public_token", token)
    .maybeSingle();
  if (error || !proposal || proposal.status === "draft") {
    return json({ error: "This proposal link isn't valid." }, 404);
  }

  const { data: board } = await admin.from("boards").select("name").eq("id", proposal.board_id).maybeSingle();

  return json({
    title: proposal.title,
    introText: proposal.intro_text || "",
    lineItems: proposal.line_items || [],
    currency: proposal.currency,
    status: proposal.status,
    clientName: proposal.client_name || "",
    respondedAt: proposal.responded_at,
    fromName: board?.name || "",
  });
});
