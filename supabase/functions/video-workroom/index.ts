// ===========================================================================
// BOARDLY - Daily Video Workroom
//
// Deploy with: supabase functions deploy video-workroom --no-verify-jwt
//
// `start` is authenticated inside the function and only the task owner can
// create/reopen a workroom. `join` deliberately accepts no Boardly login so
// an invited guest can participate, but requires both an opaque workroom id
// and its random access token. The Daily API key remains server-side.
// ===========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function dailyRequest(path: string, apiKey: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.daily.co/v1${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.info || data?.error || "Daily could not complete this request");
  return data;
}

async function issueMeetingToken(roomName: string, apiKey: string, expiresAt: Date, userName: string, isOwner: boolean) {
  const data = await dailyRequest("/meeting-tokens", apiKey, {
    properties: {
      room_name: roomName,
      exp: Math.floor(expiresAt.getTime() / 1000),
      eject_at_token_exp: true,
      user_name: userName,
      is_owner: isOwner,
      enable_prejoin_ui: true,
    },
  });
  return data.token as string;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const dailyApiKey = Deno.env.get("DAILY_API_KEY");
  if (!dailyApiKey) return json({ error: "Video Workroom is not configured yet. Add DAILY_API_KEY and deploy this function." }, 503);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "Bad request body" }, 400); }
  const action = String(body.action || "");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (action === "start") {
    const authHeader = request.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Please sign in before starting a workroom." }, 401);
    const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await caller.auth.getUser();
    if (userError || !user) return json({ error: "Could not verify your login. Please sign in again." }, 401);

    const taskId = String(body.taskId || "");
    if (!isUuid(taskId)) return json({ error: "Invalid task." }, 400);
    const { data: task, error: taskError } = await admin
      .from("tasks").select("id, title, user_id").eq("id", taskId).eq("user_id", user.id).maybeSingle();
    if (taskError || !task) return json({ error: "Task not found." }, 404);

    const now = new Date();
    const { data: existing } = await admin.from("video_workrooms")
      .select("id, daily_room_name, daily_room_url, access_token, expires_at")
      .eq("task_id", task.id).eq("user_id", user.id).eq("status", "active").gt("expires_at", now.toISOString())
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    let room = existing;
    if (!room) {
      const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      const roomName = `boardly-${task.id.replaceAll("-", "").slice(0, 12)}-${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
      let dailyRoom: { url?: string };
      try {
        dailyRoom = await dailyRequest("/rooms", dailyApiKey, {
          name: roomName,
          privacy: "private",
          properties: {
            exp: Math.floor(expiresAt.getTime() / 1000),
            max_participants: 12,
            enable_chat: true,
            enable_screenshare: true,
            enable_prejoin_ui: true,
          },
        });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Couldn't create the Daily room." }, 502);
      }
      if (!dailyRoom.url) return json({ error: "Daily did not return a room URL." }, 502);
      const { data: inserted, error: insertError } = await admin.from("video_workrooms").insert({
        task_id: task.id, user_id: user.id, daily_room_name: roomName, daily_room_url: dailyRoom.url, expires_at: expiresAt.toISOString(),
      }).select("id, daily_room_name, daily_room_url, access_token, expires_at").single();
      if (insertError || !inserted) return json({ error: "Daily room created, but Boardly could not save it. Please try again." }, 500);
      room = inserted;
    }

    const expiresAt = new Date(room.expires_at);
    const token = await issueMeetingToken(room.daily_room_name, dailyApiKey, expiresAt, user.email || "Boardly host", true);
    const siteUrl = Deno.env.get("PUBLIC_APP_URL") || "https://justixxprime.github.io/boardly";
    const inviteUrl = `${siteUrl.replace(/\/$/, "")}/video-workroom.html?room=${encodeURIComponent(room.id)}&access=${encodeURIComponent(room.access_token)}`;
    return json({ roomUrl: room.daily_room_url, token, title: task.title, inviteUrl, expiresAt: room.expires_at });
  }

  if (action === "join") {
    const roomId = String(body.roomId || "");
    const accessToken = String(body.accessToken || "");
    const requestedName = String(body.name || "Guest").trim().replace(/[^\p{L}\p{N}\s.'-]/gu, "").slice(0, 80) || "Guest";
    if (!isUuid(roomId) || !isUuid(accessToken)) return json({ error: "This invitation is invalid or has expired." }, 404);
    const { data: room, error } = await admin.from("video_workrooms")
      .select("daily_room_name, daily_room_url, access_token, expires_at, status")
      .eq("id", roomId).maybeSingle();
    if (error || !room || room.access_token !== accessToken || room.status !== "active" || new Date(room.expires_at) <= new Date()) {
      return json({ error: "This invitation is invalid or has expired." }, 404);
    }
    const token = await issueMeetingToken(room.daily_room_name, dailyApiKey, new Date(room.expires_at), requestedName, false);
    return json({ roomUrl: room.daily_room_url, token, expiresAt: room.expires_at });
  }

  return json({ error: "Unknown action." }, 400);
});
