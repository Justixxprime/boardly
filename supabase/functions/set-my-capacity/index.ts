// ==========================================================================
// BOARDLY - set-my-capacity Edge Function
// Deploy with:  supabase functions deploy set-my-capacity
//
// board_members RLS (schema_v17_collaboration.sql) only lets the BOARD
// OWNER update a member's row - on purpose, so a member can't quietly
// promote their own "viewer" role to "editor" by writing to their own
// row directly. That's exactly why this can't just be a client-side
// update: it needs to let someone update ONE specific column on their
// OWN row (weekly_capacity_hours) without opening up every other
// column on that same row. Same reasoning as admin-set-plan - a
// narrow, server-verified write beats loosening a deliberately strict
// RLS policy.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth token" }, 401);

  let boardId: string, weeklyCapacityHours: number | null;
  try {
    const body = await request.json();
    boardId = String(body.boardId || "");
    weeklyCapacityHours = body.weeklyCapacityHours === null || body.weeklyCapacityHours === undefined
      ? null
      : Number(body.weeklyCapacityHours);
    if (weeklyCapacityHours !== null && (!Number.isFinite(weeklyCapacityHours) || weeklyCapacityHours < 0)) {
      return json({ error: "weeklyCapacityHours must be a non-negative number, or null to clear it" }, 400);
    }
  } catch {
    return json({ error: "Bad request body - expected { boardId, weeklyCapacityHours }" }, 400);
  }
  if (!boardId) return json({ error: "boardId is required" }, 400);

  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) return json({ error: "Could not verify who you are - try logging in again." }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: board } = await admin.from("boards").select("id, user_id").eq("id", boardId).maybeSingle();
  if (!board) return json({ error: "Board not found" }, 404);

  // The board owner already has full update rights on their own board
  // row via existing RLS ("Users manage their own boards" - see
  // schema_v2.sql), so an owner setting their OWN capacity never needs
  // this function at all - it goes straight to boards.
  // owner_weekly_capacity_hours from the browser. This function exists
  // ONLY for the collaborator case, where board_members' own RLS
  // deliberately only lets the OWNER write to a member's row.
  if (board.user_id === user.id) {
    return json({ error: "Board owners can set their own capacity directly - this function is only for invited members." }, 400);
  }

  const { error, count } = await admin
    .from("board_members")
    .update({ weekly_capacity_hours: weeklyCapacityHours }, { count: "exact" })
    .eq("board_id", boardId)
    .eq("user_id", user.id);
  if (error) return json({ error: error.message }, 500);
  if (!count) return json({ error: "You're not a member of this board." }, 403);

  return json({ ok: true });
});
