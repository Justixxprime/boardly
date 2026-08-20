// ==========================================================================
// BOARDLY - invite-member Edge Function
// Deploy with:  supabase functions deploy invite-member
//
// Why this has to be a server-side function: adding a row to
// board_members is something the OWNER's own session can already do
// under RLS (see schema_v17_collaboration.sql), so this function isn't
// bypassing security - what it's for is looking up whether the invited
// email already has a Boardly account, and if so, wiring up user_id
// immediately instead of leaving it null until they sign up. That
// lookup requires the service role key, which must never reach the
// browser, so it happens here.
//
// What it does NOT do: it never lets the caller add themselves to
// someone else's board, and it never lets the caller invite someone to
// a board they don't own - both are re-checked server side below, on
// top of RLS.
//
// No extra secrets needed beyond what every Edge Function already gets
// automatically (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY).
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Missing auth token" }, 401);
  }

  let boardId: string, inviteEmail: string, role: string;
  try {
    const body = await request.json();
    boardId = String(body.boardId || "");
    inviteEmail = String(body.email || "").trim().toLowerCase();
    role = body.role === "viewer" ? "viewer" : "editor";
  } catch {
    return json({ error: "Bad request body - expected { boardId, email, role }" }, 400);
  }
  if (!boardId || !inviteEmail || !inviteEmail.includes("@")) {
    return json({ error: "boardId and a valid email are required" }, 400);
  }

  // A client scoped to the CALLER's own token - used to verify identity
  // and to confirm they actually own the board, same pattern as
  // delete-account/index.ts.
  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) {
    return json({ error: "Could not verify who you are - try logging in again." }, 401);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Confirm the caller actually owns this board before doing anything else.
  const { data: board, error: boardError } = await admin
    .from("boards")
    .select("id, user_id, name")
    .eq("id", boardId)
    .single();
  if (boardError || !board) return json({ error: "Board not found." }, 404);
  if (board.user_id !== user.id) return json({ error: "Only the board owner can invite people." }, 403);
  if (inviteEmail === user.email) return json({ error: "You already own this board." }, 400);

  // Look up whether this email already has a Boardly account. listUsers
  // is paginated and there's no direct "get by email" in older SDKs, so
  // this filters client-side on a single page - fine at Boardly's
  // current scale, revisit if the user base gets large.
  const { data: usersPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const matchedUser = usersPage?.users?.find((u) => u.email?.toLowerCase() === inviteEmail);

  const { data: member, error: insertError } = await admin
    .from("board_members")
    .upsert(
      {
        board_id: boardId,
        invited_email: inviteEmail,
        user_id: matchedUser?.id ?? null,
        role,
        invited_by: user.id,
        // If they already have an account, treat the invite as
        // auto-accepted - there's no separate accept step in v1.
        accepted_at: matchedUser ? new Date().toISOString() : null,
      },
      { onConflict: "board_id,invited_email" }
    )
    .select()
    .single();

  if (insertError) return json({ error: `Couldn't add that person: ${insertError.message}` }, 500);

  return json({
    ok: true,
    member,
    hasAccount: !!matchedUser,
    note: matchedUser
      ? `${inviteEmail} already has a Boardly account and can see "${board.name}" now.`
      : `${inviteEmail} doesn't have a Boardly account yet. They'll get access automatically the moment they sign up with this email.`,
  });
});
