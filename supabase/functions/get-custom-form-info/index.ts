// ==========================================================================
// BOARDLY - get-custom-form-info Edge Function
// Deploy with:  supabase functions deploy get-custom-form-info --no-verify-jwt
//
// Needs --no-verify-jwt for the same reason get-request-portal-info and
// get-public-roadmap do: a stranger about to fill out a form has no
// Boardly login token to send at all.
//
// Returns exactly what form.html needs to render the form and nothing
// about the owner beyond the board's name - the field DEFINITIONS are
// safe to hand back in full, since they're literally what the public
// page is meant to display. Refuses (404, same message as an invalid
// token) if the form exists but isn't published - an unpublished form
// should be exactly as unreachable as a nonexistent one.
// ==========================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  let token: string;
  try {
    const parsed = await request.json();
    token = String(parsed.token || "");
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!token) return json({ error: "Missing token" }, 400);

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: form, error: formError } = await admin
    .from("custom_forms")
    .select("name, description, fields, published, board_id")
    .eq("public_token", token)
    .maybeSingle();
  if (formError || !form || !form.published) return json({ error: "This form link isn't valid, or it's no longer accepting responses." }, 404);

  const { data: board } = await admin.from("boards").select("name").eq("id", form.board_id).maybeSingle();

  return json({
    formName: form.name,
    formDescription: form.description || "",
    fields: form.fields || [],
    boardName: board?.name || "",
  });
});
