// ==========================================================================
// BOARDLY - admin-list-users Edge Function
// Deploy with:  supabase functions deploy admin-list-users
//
// Needs a real login (no --no-verify-jwt), same as any function that
// touches account-wide data. On top of that, it checks the caller's own
// email against ADMIN_EMAILS - a comma-separated Edge Function secret,
// NOT anything read from the browser. There is currently no "admin"
// concept anywhere else in Boardly (every account is just a normal
// account), so this is deliberately the one and only place that idea
// exists, and it's enforced here, server-side, not by hiding a link in
// the UI - hiding a link is not access control, it's just etiquette.
//
// Set the secret once with:
//   supabase secrets set ADMIN_EMAILS=you@example.com
// (comma-separate more than one if needed, e.g. "a@x.com,b@x.com")
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth token" }, 401);

  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user?.email) return json({ error: "Could not verify who you are - try logging in again." }, 401);

  const adminEmails = (Deno.env.get("ADMIN_EMAILS") || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!adminEmails.includes(user.email.toLowerCase())) {
    return json({ error: "Not authorized." }, 403);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Same "paginated, filter client-side" approach as invite-member's own
  // user lookup - fine at Boardly's current scale, revisit if the user
  // base gets large enough that 1000 accounts isn't everyone anymore.
  const { data: usersPage, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) return json({ error: listError.message }, 500);

  const { data: plans } = await admin.from("user_plan").select("user_id, plan, plan_note, updated_at");
  const planByUserId = new Map((plans || []).map((p) => [p.user_id, p]));

  const users = (usersPage?.users || [])
    .map((u) => {
      const p = planByUserId.get(u.id);
      return {
        id: u.id,
        email: u.email,
        createdAt: u.created_at,
        plan: p?.plan || "free",
        planNote: p?.plan_note || null,
        planUpdatedAt: p?.updated_at || null,
      };
    })
    .sort((a, b) => (a.email || "").localeCompare(b.email || ""));

  return json({ ok: true, users });
});
