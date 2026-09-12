// ==========================================================================
// BOARDLY 2.0: marketplace-get-trust-badges Edge Function (Section 18)
// Deploy with:  supabase functions deploy marketplace-get-trust-badges --no-verify-jwt
//
// Needs --no-verify-jwt because anyone browsing the public Marketplace
// directory has no Boardly login, same reasoning as
// marketplace-create-booking and get-invoice-info.
//
// Section 18 of the brief: "Build transparent trust indicators... Show
// reasons. Never create an opaque AI trust score that users cannot
// understand." Every badge here is a real, independently-checkable
// fact, not a score, and never fabricated:
//   - emailVerified: comes straight from Supabase Auth's own
//     email_confirmed_at, the same flag that actually gates whether
//     that person can use a password-reset flow. Needs the admin API
//     (auth.users is never publicly readable), so this has to be an
//     Edge Function, RLS alone can't expose this safely.
//   - payoutVerified: a row exists in marketplace_provider_payouts only
//     if Paystack itself resolved a real bank account for this person
//     (schema_v33's own comment: account_name is filled in BY Paystack,
//     never typed by the provider). Only a boolean is returned, never
//     the account number or bank code themselves.
//   - completedBookings: a plain count of marketplace_bookings with
//     status='released' for this provider. marketplace_bookings has no
//     public read policy at all (schema_v33), so this count is the
//     only thing about their bookings this function ever exposes, not
//     amounts, not client names, not descriptions.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  let profileUserId: string;
  try {
    const body = await request.json();
    profileUserId = String(body.profileUserId || "");
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!profileUserId) return json({ error: "Missing profileUserId" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Only bother computing anything for a profile that's actually
  // published, same rule the directory itself already enforces via RLS.
  const { data: profile } = await admin
    .from("marketplace_profiles")
    .select("user_id, is_public, created_at")
    .eq("user_id", profileUserId)
    .eq("is_public", true)
    .maybeSingle();
  if (!profile) return json({ error: "Profile not found" }, 404);

  const [{ data: userResult }, { data: payout }, { count: completedBookings }] = await Promise.all([
    admin.auth.admin.getUserById(profileUserId),
    admin.from("marketplace_provider_payouts").select("id").eq("user_id", profileUserId).maybeSingle(),
    admin.from("marketplace_bookings").select("id", { count: "exact", head: true }).eq("profile_user_id", profileUserId).eq("status", "released"),
  ]);

  return json({
    emailVerified: Boolean(userResult?.user?.email_confirmed_at),
    payoutVerified: Boolean(payout),
    completedBookings: completedBookings || 0,
    memberSince: profile.created_at,
  });
});
