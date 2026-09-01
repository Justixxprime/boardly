// ==========================================================================
// BOARDLY - notify-assignment Edge Function
// Deploy with:  supabase functions deploy notify-assignment
//
// (No --no-verify-jwt here - unlike the public-facing functions in this
// project, this one is only ever called by an already signed-in
// collaborator assigning a task to someone else on the same board, so
// Supabase's normal JWT check is exactly what should gate it.)
//
// The task's own assigned_to column is updated directly by the client
// (already covered by the existing "editor members can update tasks"
// RLS policy - see schema_v17_collaboration.sql, nothing new needed
// there). This function exists ONLY for the one thing the client can't
// safely do itself: writing a notification row into someone ELSE's
// notifications - RLS only allows inserting your own (see
// schema_v36_notifications.sql), on purpose, so nobody's browser can
// spam notifications into another person's bell. This function checks
// both people actually belong to the same board before creating one.
// ==========================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Please sign in." }, 401);

  let taskId: string, assigneeId: string;
  try {
    const parsed = await request.json();
    taskId = String(parsed.taskId || "");
    assigneeId = String(parsed.assigneeId || "");
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!taskId || !assigneeId) return json({ error: "Missing fields" }, 400);

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await caller.auth.getUser();
  if (userError || !user) return json({ error: "Could not verify your login." }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: task, error: taskError } = await admin.from("tasks").select("id, title, board_id, user_id").eq("id", taskId).maybeSingle();
  if (taskError || !task) return json({ error: "Task not found." }, 404);

  // The caller must actually have access to this board - owner, or a
  // member row for their own user id.
  const callerIsOwner = task.user_id === user.id;
  if (!callerIsOwner) {
    const { data: callerMembership } = await admin.from("board_members")
      .select("id").eq("board_id", task.board_id).eq("user_id", user.id).maybeSingle();
    if (!callerMembership) return json({ error: "You don't have access to this board." }, 403);
  }

  // The person being assigned must ALSO genuinely belong to this same
  // board - owner, or a member row for their own user id - otherwise
  // this could be used to push a notification at a total stranger.
  const assigneeIsOwner = task.user_id === assigneeId;
  if (!assigneeIsOwner) {
    const { data: assigneeMembership } = await admin.from("board_members")
      .select("id").eq("board_id", task.board_id).eq("user_id", assigneeId).maybeSingle();
    if (!assigneeMembership) return json({ error: "That person isn't a member of this board." }, 403);
  }

  // Assigning something to yourself doesn't need a notification - you
  // already know.
  if (assigneeId === user.id) return json({ ok: true, skipped: true });

  const { error: insertError } = await admin.from("notifications").insert({
    user_id: assigneeId,
    type: "task_assigned",
    title: `You were assigned "${task.title}"`,
    body: `${user.email} assigned this to you.`,
    link_url: "dashboard.html",
    board_id: task.board_id,
  });
  if (insertError) return json({ error: insertError.message }, 500);

  return json({ ok: true });
});
