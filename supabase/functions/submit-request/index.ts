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

// ---- rate limiting (schema_v89_rate_limits.sql, finding F9) ----------------
// Counts calls per hashed IP (and optionally per token or email) in a fixed
// window. Returns true when the caller has gone over the limit. If the
// counter itself fails for any reason it lets the request through, so a
// database hiccup can never lock real people out.
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function isRateLimited(
  admin: any,
  request: Request,
  name: string,
  perIp: { limit: number; seconds: number },
  extra?: { value: string; limit: number; seconds: number },
): Promise<boolean> {
  try {
    const ip = request.headers.get("cf-connecting-ip") || (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    const ipCall = await admin.rpc("rate_limit_hit", { p_bucket: `${name}:ip:${await sha256Hex(ip)}`, p_limit: perIp.limit, p_window_seconds: perIp.seconds });
    if (!ipCall.error && ipCall.data === false) return true;
    if (extra && extra.value) {
      const extraCall = await admin.rpc("rate_limit_hit", { p_bucket: `${name}:key:${await sha256Hex(extra.value)}`, p_limit: extra.limit, p_window_seconds: extra.seconds });
      if (!extraCall.error && extraCall.data === false) return true;
    }
  } catch {
    // fail open
  }
  return false;
}

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
  if (await isRateLimited(admin, request, "submit-request", { limit: 10, seconds: 600 }, { value: token, limit: 60, seconds: 3600 })) {
    return json({ error: "Too many requests from your connection. Please wait a few minutes and try again." }, 429);
  }

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
