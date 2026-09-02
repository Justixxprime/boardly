// ==========================================================================
// BOARDLY - get-request-portal-info Edge Function
// Deploy with:  supabase functions deploy get-request-portal-info --no-verify-jwt
//
// Needs --no-verify-jwt for the same reason get-public-roadmap and
// submit-request do: a stranger about to fill out a request form has no
// Boardly login token to send at all.
//
// This exists ONLY so request.html can show the real board/business name
// instead of a generic "Send a request" heading - it deliberately mirrors
// get-public-roadmap's shape (same token-lookup pattern, same "return the
// name and nothing else about the owner or their board" restraint) rather
// than reusing submit-request for this, since submit-request's own header
// comment promises it is creation-only; keeping that promise true matters
// more than saving one small file.
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

  const { data: board, error: boardError } = await admin
    .from("boards")
    .select("name")
    .eq("request_portal_token", token)
    .maybeSingle();
  if (boardError || !board) return json({ error: "This request link isn't valid." }, 404);

  return json({ boardName: board.name });
});
