// ==========================================================================
// BOARDLY - delete-account Edge Function
// Deploy with:  supabase functions deploy delete-account
//
// Why this has to be a server-side function at all: a signed-in user's
// anon-key session can never delete its own row in auth.users - only the
// service role key can do that, and that key must never reach the
// browser. This function is the one safe place it's allowed to exist:
// it runs on Supabase's servers, reads the CALLER'S OWN identity from
// their JWT (it does not trust a user_id passed in the request body,
// which would let anyone delete anyone).
//
// Why there's no manual "delete from tasks / boards / user_settings"
// step here: every one of those tables already has
//   user_id uuid not null references auth.users(id) on delete cascade
// (see schema.sql, schema_v2.sql, schema_v5_timely_plus.sql,
// schema_v4_timely.sql). Deleting the auth user makes Postgres itself
// cascade-delete all of it, correctly and atomically - a hand-written
// sequence of deletes here would be redundant at best and a source of
// subtle bugs at worst (wrong order, a table added later that isn't
// added to this list, etc.). The one thing a SQL cascade genuinely can't
// reach is Supabase Storage, since uploaded files aren't rows in a
// table - so that's the one manual step below, done BEFORE the account
// goes away, since after that this function couldn't authenticate as
// the user to find their files even if it wanted to.
//
// No extra secrets needed beyond what every Edge Function already gets
// automatically (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY).
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Missing auth token" }, 401);
  }

  // A client scoped to the CALLER's own token - used only to verify who
  // they are, never to perform the deletion itself.
  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) {
    return json({ error: "Could not verify who you are - try logging in again." }, 401);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const userId = user.id;

  // Attachment files live in the "task-attachments" bucket under a
  // {userId}/... path (see uploadAttachment() in dashboard.js). Best
  // effort: if this bucket doesn't exist yet on this project (it's an
  // optional feature per FEATURES_V2_SETUP.md), .list() just returns
  // nothing and this quietly does nothing rather than blocking deletion.
  const { data: userFiles } = await admin.storage.from("task-attachments").list(userId);
  if (userFiles && userFiles.length > 0) {
    await admin.storage.from("task-attachments").remove(userFiles.map((f) => `${userId}/${f.name}`));
  }

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    return json({ error: `Couldn't delete the account: ${deleteUserError.message}. Nothing was removed - contact support.` }, 500);
  }

  return json({ ok: true });
});
