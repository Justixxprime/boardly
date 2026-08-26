// ==========================================================================
// BOARDLY - get-shared-board Edge Function
// Deploy with:  supabase functions deploy get-shared-board --no-verify-jwt
//
// BUG FIX NOTE: earlier setup docs for this function (and for
// client-portal-action) were missing --no-verify-jwt on the deploy
// command. Without it, Supabase's own gateway rejects every request
// to this function with 401 "Missing authorization header" BEFORE
// this code ever runs - because whoever's calling it (someone reading
// a public share link, or a client with no Boardly account at all)
// has no Boardly login token to send. This is the same reason
// zapier-create-task, slack-slash-command, and google-oauth-callback
// all already needed --no-verify-jwt - this function was just missed
// when it was first written. If share.html or the Client Portal
// haven't been working, re-running the deploy command above (with the
// flag) is very likely the fix.
//
// This is the ONLY way to read a password-protected shared board's data
// (see schema_v20_share_hardening.sql - the direct database policy
// refuses access entirely once a password is set). This function runs
// on the server, using the service role key, so it can check the
// password and only THEN decide whether to hand back the real data -
// something a check written in the browser's JavaScript can never
// truly enforce, since a visitor can always skip past browser code.
//
// No login required to call this - a public share link is meant to be
// open to anyone with the link and the password, not just people with
// a Boardly account. It never needs the caller's own auth token.
//
// No new secrets needed beyond what every Edge Function already gets
// automatically (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
//
// PORTAL MODE (added in schema_v27_client_portal.sql): pass
// { token, password, portal: true } and this returns only the tasks
// marked client_visible, plus each of their client_comments - this is
// what client-portal.html calls, sharing the exact same token/password
// check as the regular share.html view rather than inventing a second
// one.
// ==========================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  let token: string, password: string, portal: boolean;
  try {
    const body = await request.json();
    token = String(body.token || "");
    password = String(body.password || "");
    portal = !!body.portal;
  } catch {
    return json({ error: "Bad request - expected { token, password }" }, 400);
  }
  if (!token) return json({ error: "Missing share link" }, 400);

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: board, error: boardError } = await admin
    .from("boards")
    .select("id, name, is_public, share_expires_at, share_password_hash, share_password_salt")
    .eq("share_token", token)
    .maybeSingle();

  if (boardError || !board || !board.is_public) {
    return json({ error: "This board isn't public. The link might be wrong, or the owner turned sharing back off." }, 404);
  }
  if (board.share_expires_at && new Date(board.share_expires_at) <= new Date()) {
    return json({ error: "This share link has expired." }, 410);
  }
  if (board.share_password_hash) {
    if (!password) return json({ needsPassword: true }, 401);
    const attemptHash = await sha256Hex(`${board.share_password_salt}${password}`);
    if (attemptHash !== board.share_password_hash) {
      return json({ needsPassword: true, error: "That password isn't right." }, 401);
    }
  }

  // Portal mode only ever hands back a curated set of columns - a
  // client-facing link shouldn't leak internal-only fields like git
  // branch, priority, or blocked_by_id just because they happen to
  // live on the same row. The regular (non-portal) share view still
  // uses select("*") exactly as it always has - this restriction is
  // specific to the Client Portal.
  let taskQuery = portal
    ? admin.from("tasks").select("id, board_id, title, category, due_date, notes, status, client_visible, client_status, client_feedback, created_at").eq("board_id", board.id).order("position", { ascending: true })
    : admin.from("tasks").select("*").eq("board_id", board.id).order("position", { ascending: true });
  if (portal) taskQuery = taskQuery.eq("client_visible", true);
  const { data: tasks } = await taskQuery;

  if (!portal) {
    return json({ board: { id: board.id, name: board.name }, tasks: tasks || [] });
  }

  const taskIds = (tasks || []).map((t) => t.id);
  const { data: comments } = taskIds.length
    ? await admin.from("client_comments").select("*").in("task_id", taskIds).order("created_at", { ascending: true })
    : { data: [] };

  return json({ board: { id: board.id, name: board.name }, tasks: tasks || [], comments: comments || [] });
});
