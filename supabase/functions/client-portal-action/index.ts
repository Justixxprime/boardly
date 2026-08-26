// ==========================================================================
// BOARDLY - client-portal-action Edge Function
// Deploy with:  supabase functions deploy client-portal-action --no-verify-jwt
//
// Needs --no-verify-jwt because a client using the portal has no
// Boardly login token to send - same reason get-shared-board needs it
// too (see that file for the full explanation of the bug this fixes).
//
// This is the ONLY way a client using the Client Portal can leave a
// comment, approve a task, or request changes. It runs the exact same
// token/password/expiry check as get-shared-board (see that file and
// schema_v20_share_hardening.sql) BEFORE writing anything - the client
// never has a real Supabase auth session, so there is no RLS policy
// that could safely let them write directly. This function uses the
// service role key and does that gatekeeping itself, on the server,
// same principle as the password check.
//
// It also re-checks that the task being acted on actually belongs to
// that board AND is marked client_visible - so even someone who
// somehow guessed a task id from a different board, or a task the
// owner never chose to share, can't be commented on or approved
// through this endpoint.
//
// No new secrets needed beyond what every Edge Function already gets
// automatically (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
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

const VALID_ACTIONS = ["comment", "approve", "request_changes"];

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  let token: string, password: string, action: string, taskId: string, authorName: string, body: string;
  try {
    const parsed = await request.json();
    token = String(parsed.token || "");
    password = String(parsed.password || "");
    action = String(parsed.action || "");
    taskId = String(parsed.taskId || "");
    authorName = String(parsed.authorName || "").trim().slice(0, 80);
    body = String(parsed.body || "").trim().slice(0, 2000);
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!token || !taskId) return json({ error: "Missing token or task" }, 400);
  if (!VALID_ACTIONS.includes(action)) return json({ error: "Unknown action" }, 400);
  if (!authorName) return json({ error: "Your name is required" }, 400);
  if (action === "comment" && !body) return json({ error: "Comment can't be empty" }, 400);

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: board, error: boardError } = await admin
    .from("boards")
    .select("id, is_public, share_expires_at, share_password_hash, share_password_salt")
    .eq("share_token", token)
    .maybeSingle();

  if (boardError || !board || !board.is_public) {
    return json({ error: "This portal link isn't valid anymore." }, 404);
  }
  if (board.share_expires_at && new Date(board.share_expires_at) <= new Date()) {
    return json({ error: "This link has expired." }, 410);
  }
  if (board.share_password_hash) {
    if (!password) return json({ needsPassword: true }, 401);
    const attemptHash = await sha256Hex(`${board.share_password_salt}${password}`);
    if (attemptHash !== board.share_password_hash) {
      return json({ needsPassword: true, error: "That password isn't right." }, 401);
    }
  }

  const { data: task, error: taskError } = await admin
    .from("tasks")
    .select("id, board_id, client_visible")
    .eq("id", taskId)
    .eq("board_id", board.id)
    .eq("client_visible", true)
    .maybeSingle();

  if (taskError || !task) {
    return json({ error: "That item isn't part of this portal." }, 404);
  }

  if (action === "comment") {
    const { error } = await admin.from("client_comments").insert({
      task_id: taskId, board_id: board.id, author_name: authorName, body,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  const updates = action === "approve"
    ? { client_status: "approved", client_feedback: body || null }
    : { client_status: "changes_requested", client_feedback: body || null };

  const { error } = await admin.from("tasks").update(updates).eq("id", taskId);
  if (error) return json({ error: error.message }, 500);

  // A status change is also logged as a comment, so the owner sees a
  // plain-language trail ("Approved by Amaka") instead of just a badge
  // that changed with no record of who did it or when.
  const statusLine = action === "approve" ? "✓ Approved this" : "✎ Requested changes" + (body ? `: ${body}` : "");
  await admin.from("client_comments").insert({ task_id: taskId, board_id: board.id, author_name: authorName, body: statusLine });

  return json({ ok: true });
});
