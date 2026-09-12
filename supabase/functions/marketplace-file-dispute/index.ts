// ==========================================================================
// BOARDLY 2.0: marketplace-file-dispute Edge Function
// Deploy with:  supabase functions deploy marketplace-file-dispute --no-verify-jwt
//
// Needs --no-verify-jwt because ONE of its two callers, the paying
// client on booking-status.html, has no Boardly login at all, the same
// reason marketplace-booking-status and marketplace-release-payment
// both need it. The other caller, the provider, does have a login, and
// this function verifies their own JWT itself (same pattern as
// marketplace-setup-payout) rather than relying on the platform-level
// check, since one function has to serve both actors.
//
// Either actor identifies themselves in the request body:
//   - a client sends { bookingId, accessToken, reason }
//   - a provider sends { bookingId, reason } with an Authorization header
// Only one dispute can be open on a booking at a time, and only a
// booking sitting in 'paid_held' can be disputed at all, disputing a
// booking that's still unpaid or one already released/refunded/
// cancelled would not describe anything real.
//
// Writes go through the service-role client, same reasoning as every
// other Edge Function touching marketplace_bookings: schema_v33
// deliberately defines no public write policy on this table at all, so
// every write is a narrow, specific field update made here, in code,
// after identity is checked, never a broad RLS policy a caller could
// otherwise use to touch a column this function never intended to expose.
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

  let bookingId: string, accessToken: string, reason: string;
  try {
    const body = await request.json();
    bookingId = String(body.bookingId || "");
    accessToken = String(body.accessToken || "");
    reason = String(body.reason || "").trim().slice(0, 2000);
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!bookingId) return json({ error: "Missing booking id" }, 400);
  if (!reason) return json({ error: "Describe what's wrong before filing a dispute" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: booking, error: fetchError } = await admin
    .from("marketplace_bookings")
    .select("id, access_token, status, dispute_status, profile_user_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (fetchError || !booking) return json({ error: "Booking not found" }, 404);

  // Work out which of the two actors this is, and verify them properly
  // for that path. Exactly one of these should succeed.
  let disputedBy: "client" | "provider" | null = null;

  if (accessToken && booking.access_token === accessToken) {
    disputedBy = "client";
  } else {
    const authHeader = request.headers.get("authorization") || "";
    if (authHeader.startsWith("Bearer ")) {
      const callerClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await callerClient.auth.getUser();
      if (user && user.id === booking.profile_user_id) disputedBy = "provider";
    }
  }

  if (!disputedBy) {
    return json({ error: "Could not verify who you are for this booking." }, 401);
  }
  if (booking.status !== "paid_held") {
    return json({ error: `This booking is "${booking.status}", only a booking with payment held in escrow can be disputed.` }, 400);
  }
  if (booking.dispute_status === "opened") {
    return json({ error: "A dispute is already open on this booking." }, 400);
  }

  const { error: updateError } = await admin
    .from("marketplace_bookings")
    .update({
      dispute_status: "opened",
      dispute_reason: reason,
      disputed_by: disputedBy,
      disputed_at: new Date().toISOString(),
    })
    .eq("id", bookingId);
  if (updateError) return json({ error: "Couldn't file the dispute: " + updateError.message }, 500);

  return json({ ok: true, disputedBy });
});
