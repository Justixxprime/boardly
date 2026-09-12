// ==========================================================================
// BOARDLY 2.0: marketplace-submit-review Edge Function (Section 17)
// Deploy with:  supabase functions deploy marketplace-submit-review --no-verify-jwt
//
// Needs --no-verify-jwt, the client leaving a review on
// booking-status.html has no Boardly account, same as every other
// client-facing Marketplace function.
//
// What keeps this from being a fake-review system: a review can only
// be filed against a booking that is (1) real, (2) actually
// 'released' (the client themselves already confirmed the work was
// done, this function does not accept a review for anything less),
// and (3) matched by that booking's own access_token, not just an id
// anyone could guess. schema_v68's unique constraint on booking_id
// backstops all of this: even if this check somehow had a bug, the
// database itself refuses a second review on the same booking.
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

  let bookingId: string, accessToken: string, rating: number, comment: string;
  try {
    const body = await request.json();
    bookingId = String(body.bookingId || "");
    accessToken = String(body.accessToken || "");
    rating = Number(body.rating);
    comment = String(body.comment || "").trim().slice(0, 2000);
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!bookingId || !accessToken) return json({ error: "Missing booking id or access token" }, 400);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: "Rating must be between 1 and 5" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: booking, error: fetchError } = await admin
    .from("marketplace_bookings")
    .select("id, access_token, status, profile_user_id, client_name")
    .eq("id", bookingId)
    .maybeSingle();
  if (fetchError || !booking || booking.access_token !== accessToken) {
    return json({ error: "Booking not found" }, 404);
  }
  if (booking.status !== "released") {
    return json({ error: "You can only leave a review once the work is confirmed done and payment released." }, 400);
  }

  const { error: insertError } = await admin.from("marketplace_reviews").insert({
    booking_id: booking.id,
    profile_user_id: booking.profile_user_id,
    rating,
    comment: comment || null,
    client_name: booking.client_name,
  });
  if (insertError) {
    const alreadyReviewed = insertError.code === "23505"; // unique constraint on booking_id
    return json({ error: alreadyReviewed ? "You've already reviewed this booking." : "Couldn't save the review: " + insertError.message }, 400);
  }

  return json({ ok: true });
});
