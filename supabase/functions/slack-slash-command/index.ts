// ==========================================================================
// BOARDLY - slack-slash-command Edge Function
// Deploy with:  supabase functions deploy slack-slash-command --no-verify-jwt
//
// Handles Slack's /addtask slash command: someone types
// "/addtask Call the printer tomorrow" in Slack, and it becomes a real
// ticket on their Boardly board.
//
// Needs --no-verify-jwt because Slack calls this directly, with no
// Boardly login token attached - identity here comes from Slack's own
// signature on the request (proving it really came from Slack) plus
// looking up which Boardly account has that Slack user's ID saved in
// Settings (proving WHICH Boardly account this is for).
//
// SECURITY - why the signature check matters: without it, anyone who
// found this URL could pretend to be any Slack user and create tasks
// on their board. The check below recomputes Slack's own signature
// formula and compares it to what Slack actually sent - see
// https://api.slack.com/authentication/verifying-requests-from-slack
//
// Needs ONE new secret: SLACK_SIGNING_SECRET (from api.slack.com, see
// SLACK_SETUP.md - NOT the same thing as a bot token or webhook URL).
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function verifySlackSignature(rawBody: string, timestamp: string, signature: string, signingSecret: string): Promise<boolean> {
  // Reject anything older than 5 minutes - Slack's own recommendation,
  // stops someone replaying a captured request later.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(baseString));
  const computed = "v0=" + Array.from(new Uint8Array(sigBytes)).map((b) => b.toString(16).padStart(2, "0")).join("");

  // Slack's own docs recommend a timing-safe comparison rather than
  // === , so a mismatch can't be detected faster/slower depending on
  // which character differs (a "timing attack").
  if (computed.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

const slackText = (text: string) => new Response(text, { headers: { "Content-Type": "text/plain" } });

Deno.serve(async (request) => {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") || "";
  const signature = request.headers.get("x-slack-signature") || "";
  const signingSecret = Deno.env.get("SLACK_SIGNING_SECRET");

  if (!signingSecret) return slackText("Slack isn't fully set up yet on the Boardly side - see SLACK_SETUP.md");
  const valid = await verifySlackSignature(rawBody, timestamp, signature, signingSecret);
  if (!valid) return new Response("Signature verification failed", { status: 401 });

  const params = new URLSearchParams(rawBody);
  const slackUserId = params.get("user_id");
  const text = (params.get("text") || "").trim();
  if (!text) return slackText("Type what you want to add after /addtask, e.g. `/addtask Call the printer tomorrow`");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: settings } = await admin.from("user_settings").select("user_id").eq("slack_user_id", slackUserId).maybeSingle();
  if (!settings) {
    return slackText(
      "Your Slack account isn't linked to a Boardly account yet. In Boardly, go to Settings -> Integrations -> Slack, and paste in your Slack member ID."
    );
  }

  // The person's most recently used board, same "default" a fresh
  // sign-in would land on - a slash command has no way to ask "which
  // board?" first, so this is the most reasonable single choice rather
  // than failing or guessing randomly.
  const { data: board } = await admin.from("boards").select("id").eq("user_id", settings.user_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!board) return slackText("Couldn't find a board to add this to - create a board in Boardly first.");

  const { count } = await admin.from("tasks").select("id", { count: "exact", head: true }).eq("board_id", board.id).eq("status", "todo");

  const { error } = await admin.from("tasks").insert({
    title: text,
    category: "general",
    status: "todo",
    position: count || 0,
    user_id: settings.user_id,
    board_id: board.id,
  });

  return slackText(error ? `Couldn't add that: ${error.message}` : `Added to Boardly: "${text}"`);
});
