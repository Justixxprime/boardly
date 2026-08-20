// ==========================================================================
// BOARDLY - notify-mention Edge Function
// Deploy with:  supabase functions deploy notify-mention
//
// This is what makes an @mention in a task comment actually reach the
// mentioned person, even if they aren't looking at Boardly right now.
// It reuses the exact same push setup Timely already uses (send-push) -
// same VAPID keys, same push_subscriptions table, same web-push library -
// so if Timely's push notifications already work for you, this works
// too with no extra setup beyond deploying this one function.
//
// Needs the SAME secrets send-push already needs (nothing new):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// If you've already run TIMELY_SETUP.md, these are already set.
//
// Called directly by the browser right after a comment is posted (see
// collaboration.js), the same way board-assistant and invite-member are
// called directly by the browser - not on a schedule like send-push is.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

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

  let taskId: string, taskTitle: string, commentBody: string, mentionEmails: string[], boardId: string;
  try {
    const body = await request.json();
    taskId = String(body.taskId || "");
    taskTitle = String(body.taskTitle || "a task");
    commentBody = String(body.commentBody || "");
    boardId = String(body.boardId || "");
    mentionEmails = Array.isArray(body.mentions) ? body.mentions.map((e: string) => String(e).toLowerCase()) : [];
  } catch {
    return json({ error: "Bad request body - expected { taskId, taskTitle, commentBody, boardId, mentions }" }, 400);
  }
  if (!taskId || !boardId || !mentionEmails.length) {
    return json({ ok: true, sent: 0, note: "Nothing to do - no mentions" }, 200);
  }

  // Verify the caller is who they say they are (same pattern as every
  // other Edge Function in this project).
  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) {
    return json({ error: "Could not verify who you are - try logging in again." }, 401);
  }

  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:you@example.com";
  if (!vapidPublic || !vapidPrivate) {
    // Not fatal - comments still work without push, this just quietly
    // skips the notification part. Matches send-push's own error text
    // so the fix is the same either place someone sees this.
    return json({ ok: true, sent: 0, note: "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY aren't set - see TIMELY_SETUP.md" });
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Turn each mentioned email into a real user_id, using board_members -
  // only people actually on this board can be mentioned, and only ones
  // who've accepted (i.e. have a user_id) can receive a push.
  const { data: members } = await admin
    .from("board_members")
    .select("user_id, invited_email")
    .eq("board_id", boardId)
    .in("invited_email", mentionEmails)
    .not("user_id", "is", null);

  let sent = 0;
  let failed = 0;

  for (const member of members || []) {
    if (member.user_id === user.id) continue; // don't notify yourself for your own mention
    const { data: subs } = await admin.from("push_subscriptions").select("*").eq("user_id", member.user_id);
    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: `${user.email} mentioned you`,
            body: `${taskTitle}: ${commentBody.slice(0, 120)}`,
            taskId,
            sound: "default",
          })
        );
        sent++;
      } catch (err) {
        failed++;
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }
  }

  return json({ ok: true, sent, failed });
});
