// ==========================================================================
// BOARDLY - marketplace-booking-status Edge Function
// Deploy with:  supabase functions deploy marketplace-booking-status --no-verify-jwt
//
// Needs --no-verify-jwt - the person calling this is a paying client on
// booking-status.html, with no Boardly login at all.
//
// Powers the confirmation page a client lands on after paying (and
// whenever they revisit that same link). Requires BOTH the booking id
// AND its access_token to match - this is deliberately not a plain RLS
// "select by id" policy (see schema_v33's own comment on
// marketplace_bookings for why that can't work: RLS can't compare a
// request-supplied token against a column). Getting the id right but
// the token wrong (or missing) returns the same "not found" response as
// a booking that doesn't exist - no hint given either way.
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

  let bookingId: string, accessToken: string;
  try {
    const body = await request.json();
    bookingId = String(body.bookingId || "");
    accessToken = String(body.accessToken || "");
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!bookingId || !accessToken) return json({ error: "Missing booking id or access token" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: booking, error } = await admin
    .from("marketplace_bookings")
    .select("id, access_token, status, amount, currency, description, profile_user_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !booking || booking.access_token !== accessToken) {
    return json({ error: "Booking not found" }, 404);
  }

  const { data: profile } = await admin
    .from("marketplace_profiles")
    .select("display_name")
    .eq("user_id", booking.profile_user_id)
    .maybeSingle();

  return json({
    status: booking.status,
    amount: booking.amount,
    currency: booking.currency,
    description: booking.description,
    providerDisplayName: profile?.display_name || "the provider",
  });
});
