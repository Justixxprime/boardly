// ==========================================================================
// BOARDLY 2.0: admin-delete-user Edge Function
// Deploy with:  supabase functions deploy admin-delete-user
//
// The admin-side equivalent of delete-account: that function only ever
// deletes the CALLER's own account (reads identity from their own JWT,
// never trusts a userId in the request body, exactly so nobody could
// delete someone else's account by guessing an id). This is the one
// place that rule is deliberately different, because deleting SOMEONE
// ELSE'S account is exactly the point of an admin tool, gated the same
// way admin-set-plan already gates every other admin action: the
// caller's own email must be in the ADMIN_EMAILS secret.
//
// Same cascade reasoning as delete-account's own comment: every real
// ownership table's user_id column already has "on delete cascade" (a
// handful of attribution-only columns like tasks.assigned_to use "on
// delete set null" on purpose, so someone else's board doesn't vanish
// just because a collaborator's account was removed, checked across
// every schema file before writing this). Deleting the auth user makes
// Postgres cascade all of it in one atomic step, this function does
// the one thing a SQL cascade can't reach on its own first (their
// uploaded files in Storage), same order delete-account uses.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth token" }, 401);

  let targetUserId: string;
  try {
    const body = await request.json();
    targetUserId = String(body.userId || "");
  } catch {
    return json({ error: "Bad request body, expected { userId }" }, 400);
  }
  if (!targetUserId) return json({ error: "Missing userId" }, 400);

  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user?.email) return json({ error: "Could not verify who you are, try logging in again." }, 401);

  const adminEmails = (Deno.env.get("ADMIN_EMAILS") || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!adminEmails.includes(user.email.toLowerCase())) return json({ error: "Not authorized." }, 403);

  // An admin should never be able to delete their own account through
  // this particular door, that's what Settings' own delete-account is
  // for, keeping the two paths separate avoids a confusing "did I just
  // lock myself out of the admin panel" moment.
  if (targetUserId === user.id) {
    return json({ error: "Use your own account settings to delete your own account." }, 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: userFiles } = await admin.storage.from("task-attachments").list(targetUserId);
  if (userFiles && userFiles.length > 0) {
    await admin.storage.from("task-attachments").remove(userFiles.map((f) => `${targetUserId}/${f.name}`));
  }

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(targetUserId);
  if (deleteUserError) {
    return json({ error: `Couldn't delete this account: ${deleteUserError.message}` }, 500);
  }

  return json({ ok: true });
});
