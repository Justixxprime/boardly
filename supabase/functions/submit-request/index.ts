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

  // Best-effort, same discipline as every other server-side notification
  // insert in this project (see notify-assignment) - a request that
  // lands on the board but never surfaces in the bell icon is easy to
  // miss entirely if the owner isn't already looking at that specific
  // board right when it comes in.
  try {
    await admin.from("notifications").insert({
      user_id: board.user_id,
      type: "request_portal_submission",
      title: `New request: "${title}"`,
      body: `${name}${email ? ` (${email})` : ""} sent this through your Request Portal.`,
      link_url: "dashboard.html",
      board_id: board.id,
    });
  } catch {
    // notifications table may not exist yet (schema_v36 not run) - the
    // task itself was already created successfully either way.
  }

  return json({ ok: true, boardName: board.name });
});
