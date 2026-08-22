// ==========================================================================
// BOARDLY - zapier-create-task Edge Function
// Deploy with:  supabase functions deploy zapier-create-task --no-verify-jwt
//
// This is the "inbound" half of Zapier support: it's what a Zap's
// "Webhooks by Zapier - POST" action calls to create a real Boardly
// ticket from anything else (a new email, a form submission, whatever
// the Zap is triggered by).
//
// A NOTE ON SCOPE - this is intentionally NOT a published, official
// Zapier app (the kind you'd find by searching "Boardly" inside
// Zapier's own app directory). Building and publishing one of those
// means going through Zapier's own developer platform and review
// process, which is a much bigger, separate undertaking - weeks, not
// hours, and Zapier has to approve it on their end, not something
// that can be finished from here. What this gives instead is full,
// real Zapier connectivity today, through Zapier's generic
// "Webhooks by Zapier" building block, which every Zapier plan
// (including free) already has access to. Functionally equivalent for
// getting things done, just without Boardly's own icon in Zapier's
// app search.
//
// --no-verify-jwt because Zapier has no Boardly login token to send -
// identity here comes entirely from the api_key, checked below.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" } });
  }

  let apiKey: string, title: string, category: string, dueDate: string | null, notes: string | null;
  try {
    const body = await request.json();
    apiKey = String(body.api_key || "");
    title = String(body.title || "").trim();
    category = String(body.category || "general");
    dueDate = body.due_date || null;
    notes = body.notes || null;
  } catch {
    return json({ error: "Bad request - expected JSON with at least api_key and title" }, 400);
  }
  if (!apiKey) return json({ error: "Missing api_key - find yours in Boardly Settings -> Integrations -> Zapier" }, 401);
  if (!title) return json({ error: "Missing title" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: settings } = await admin.from("user_settings").select("user_id").eq("api_key", apiKey).maybeSingle();
  if (!settings) return json({ error: "That API key isn't recognized - it may have been regenerated. Check Settings -> Integrations -> Zapier for the current one." }, 401);

  const { data: board } = await admin.from("boards").select("id").eq("user_id", settings.user_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!board) return json({ error: "No board to add this to - create a board in Boardly first" }, 404);

  const { count } = await admin.from("tasks").select("id", { count: "exact", head: true }).eq("board_id", board.id).eq("status", "todo");

  const { data: task, error } = await admin
    .from("tasks")
    .insert({ title, category, status: "todo", due_date: dueDate, notes, position: count || 0, user_id: settings.user_id, board_id: board.id })
    .select()
    .single();

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, task });
});
