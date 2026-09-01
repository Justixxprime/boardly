// ==========================================================================
// BOARDLY - submit-request Edge Function
// Deploy with:  supabase functions deploy submit-request --no-verify-jwt
//
// Needs --no-verify-jwt for the same reason every other public-facing
// function in this project does: a stranger filling out a request form
// has no Boardly login token to send.
//
// This is the ONLY way request.html can create anything - there is no
// RLS policy letting an anonymous visitor insert into tasks directly,
// on purpose. This function uses the service role key, confirms the
// board's request_portal_token is real, and only then creates one new
// task, always landing in "todo", always clearly marked as having come
// from the public portal so the owner can never mistake it for their
// own note. It cannot read, update, or delete anything - creation only.
// ==========================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  let token: string, name: string, email: string, title: string, details: string;
  try {
    const parsed = await request.json();
    token = String(parsed.token || "");
    name = String(parsed.name || "").trim().slice(0, 100);
    email = String(parsed.email || "").trim().slice(0, 200);
    title = String(parsed.title || "").trim().slice(0, 200);
    details = String(parsed.details || "").trim().slice(0, 4000);
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!token) return json({ error: "Missing token" }, 400);
  if (!name || !title) return json({ error: "Your name and a short title for the request are both required." }, 400);

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: board, error: boardError } = await admin
    .from("boards").select("id, name, user_id").eq("request_portal_token", token).maybeSingle();
  if (boardError || !board) return json({ error: "This request link isn't valid." }, 404);

  const notesParts = [`Submitted via the public request portal by ${name}${email ? ` (${email})` : ""}.`];
  if (details) notesParts.push(details);

  const { error: insertError } = await admin.from("tasks").insert({
    user_id: board.user_id,
    board_id: board.id,
    title,
    notes: notesParts.join("\n\n"),
    category: "general",
    status: "todo",
    position: 0,
  });
  if (insertError) return json({ error: insertError.message }, 500);

  return json({ ok: true, boardName: board.name });
});
