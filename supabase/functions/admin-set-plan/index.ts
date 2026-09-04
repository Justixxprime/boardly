// ==========================================================================
// BOARDLY - admin-set-plan Edge Function
// Deploy with:  supabase functions deploy admin-set-plan
//
// The actual write side of the admin dashboard - see admin-list-users
// for the read side and the ADMIN_EMAILS explanation. This is the ONLY
// way a user's plan can change until real billing exists: there is no
// client-callable "give myself Pro" endpoint anywhere, on purpose (see
// schema_v49_capability_system.sql's header comment).
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

const VALID_PLANS = ["free", "pro", "pro_plus"];

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth token" }, 401);

  let targetUserId: string, plan: string, note: string;
  try {
    const body = await request.json();
    targetUserId = String(body.userId || "");
    plan = String(body.plan || "");
    note = String(body.note || "").slice(0, 500);
  } catch {
    return json({ error: "Bad request body - expected { userId, plan, note? }" }, 400);
  }
  if (!targetUserId || !VALID_PLANS.includes(plan)) {
    return json({ error: "userId and a valid plan (free, pro, or pro_plus) are required" }, 400);
  }

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

  // Only bump plan_started_at when the plan is actually changing, not
  // on every edit of the internal note - otherwise "how long has this
  // person been on Pro" would reset itself every time you jotted down a
  // reason.
  const { data: existing } = await admin.from("user_plan").select("plan").eq("user_id", targetUserId).maybeSingle();
  const planChanged = !existing || existing.plan !== plan;

  const { error: upsertError } = await admin.from("user_plan").upsert(
    {
      user_id: targetUserId,
      plan,
      plan_note: note || null,
      updated_at: new Date().toISOString(),
      ...(planChanged ? { plan_started_at: new Date().toISOString() } : {}),
    },
    { onConflict: "user_id" }
  );
  if (upsertError) return json({ error: upsertError.message }, 500);

  // Best-effort, same discipline as every other server-side notification
  // insert in this project - honest and transparent beats a silent
  // change the person only discovers by chance.
  if (planChanged) {
    try {
      const planLabel = plan === "pro_plus" ? "Pro+" : plan === "pro" ? "Pro" : "Free";
      await admin.from("notifications").insert({
        user_id: targetUserId,
        type: "plan_changed",
        title: `Your Boardly plan is now ${planLabel}`,
        body: plan === "free" ? "Some paid features may no longer be available." : "Paid features are now unlocked.",
        link_url: "settings.html",
      });
    } catch {
      // notifications table may not exist yet - the plan change itself already saved.
    }
  }

  return json({ ok: true });
});
