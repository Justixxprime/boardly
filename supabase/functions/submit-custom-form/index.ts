// ==========================================================================
// BOARDLY - submit-custom-form Edge Function
// Deploy with:  supabase functions deploy submit-custom-form --no-verify-jwt
//
// Needs --no-verify-jwt for the same reason submit-request does: a
// stranger filling out a public form has no Boardly login token.
//
// This is the ONLY way form.html can create anything - there's no RLS
// policy letting an anonymous visitor insert into tasks or
// custom_form_submissions directly, on purpose (see schema_v58's own
// comment on that). This function uses the service role key, confirms
// the token belongs to a real PUBLISHED form, re-checks "required" on
// the server (a client-side required attribute is only ever a courtesy -
// the real gate has to live here, same discipline as every other
// server-side check in this project), then creates one ticket and one
// submission row. Creation only - it cannot read, update, or delete
// anything belonging to the form's owner beyond that.
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

  let token: string, answers: Record<string, unknown>;
  try {
    const parsed = await request.json();
    token = String(parsed.token || "");
    answers = (parsed.answers && typeof parsed.answers === "object") ? parsed.answers : {};
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!token) return json({ error: "Missing token" }, 400);

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (await isRateLimited(admin, request, "submit-custom-form", { limit: 10, seconds: 600 }, { value: token, limit: 100, seconds: 3600 })) {
    return json({ error: "Too many requests from your connection. Please wait a few minutes and try again." }, 429);
  }

  const { data: form, error: formError } = await admin
    .from("custom_forms")
    .select("id, name, fields, published, target_status, board_id")
    .eq("public_token", token)
    .maybeSingle();
  if (formError || !form || !form.published) return json({ error: "This form link isn't valid, or it's no longer accepting responses." }, 404);

  const fields: Array<{ id: string; label: string; type: string; required?: boolean; useAsTitle?: boolean }> = form.fields || [];

  // Real, server-side validation - trims every text-ish answer to a
  // sane length regardless of type, since a stranger's browser is the
  // one place in this whole project we control the least.
  const cleanAnswers: Record<string, string | boolean> = {};
  for (const field of fields) {
    const raw = answers[field.id];
    if (field.type === "checkbox") {
      cleanAnswers[field.id] = !!raw;
      continue;
    }
    const value = String(raw ?? "").trim().slice(0, 4000);
    if (field.required && !value) {
      return json({ error: `"${field.label}" is required.` }, 400);
    }
    cleanAnswers[field.id] = value;
  }

  const board = { id: form.board_id };
  const { data: boardRow, error: boardError } = await admin.from("boards").select("id, name, user_id").eq("id", board.id).maybeSingle();
  if (boardError || !boardRow) return json({ error: "This form link isn't valid." }, 404);

  const titleField = fields.find((f) => f.useAsTitle);
  const titleValue = titleField ? String(cleanAnswers[titleField.id] || "").trim() : "";
  const title = titleValue || `New submission: ${form.name}`;

  const notesParts = fields
    .filter((f) => !f.useAsTitle)
    .map((f) => `${f.label}: ${f.type === "checkbox" ? (cleanAnswers[f.id] ? "Yes" : "No") : (cleanAnswers[f.id] || "-")}`);
  const notes = [`Submitted via the "${form.name}" form.`, ...notesParts].join("\n");

  const { data: task, error: insertError } = await admin
    .from("tasks")
    .insert({
      user_id: boardRow.user_id,
      board_id: boardRow.id,
      title,
      notes,
      category: "general",
      status: form.target_status || "todo",
      position: 0,
    })
    .select("id")
    .single();
  if (insertError) return json({ error: insertError.message }, 500);

  await admin.from("custom_form_submissions").insert({
    form_id: form.id,
    board_id: boardRow.id,
    task_id: task.id,
    answers: cleanAnswers,
  });

  // Best-effort, same discipline as submit-request's own notification
  // insert - a form response that lands on the board but never surfaces
  // in the bell icon is easy to miss if the owner isn't already looking
  // at that specific board right when it comes in.
  try {
    await admin.from("notifications").insert({
      user_id: boardRow.user_id,
      type: "custom_form_submission",
      title: `New form response: "${title}"`,
      body: `Someone filled out your "${form.name}" form.`,
      link_url: "dashboard.html",
      board_id: boardRow.id,
    });
  } catch {
    // notifications table may not exist yet - the ticket itself was
    // already created successfully either way.
  }

  return json({ ok: true, boardName: boardRow.name });
});
