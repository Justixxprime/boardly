// ==========================================================================
// BOARDLY 2.0: marketplace-resolve-dispute Edge Function
// Deploy with:  supabase functions deploy marketplace-resolve-dispute
//
// No --no-verify-jwt here on purpose, unlike marketplace-file-dispute:
// only the provider can resolve a dispute, so the platform's own JWT
// check is enough, this function does not need to also serve an
// unauthenticated client the way filing a dispute does.
//
// "Resolving" here only ever means: closing the dispute RECORD once the
// provider says the underlying issue has actually been sorted out
// (a refund issued by hand through Paystack, a corrected delivery, a
// conversation that settled things). It does NOT itself release,
// refund, or otherwise move the held payment, that still only ever
// happens through marketplace-release-payment (client-initiated) or by
// Charles directly in the Paystack/Supabase dashboard, exactly the real
// limitation schema_v33 and schema_v67 both already state plainly.
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
  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) return json({ error: "Could not verify who you are, try logging in again." }, 401);

  let bookingId: string, resolution: string;
  try {
    const body = await request.json();
    bookingId = String(body.bookingId || "");
    resolution = String(body.resolution || "").trim().slice(0, 2000);
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!bookingId) return json({ error: "Missing booking id" }, 400);
  if (!resolution) return json({ error: "Describe how this was resolved" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: booking, error: fetchError } = await admin
    .from("marketplace_bookings")
    .select("id, profile_user_id, dispute_status")
    .eq("id", bookingId)
    .maybeSingle();
  if (fetchError || !booking) return json({ error: "Booking not found" }, 404);
  if (booking.profile_user_id !== user.id) return json({ error: "This isn't your booking." }, 403);
  if (booking.dispute_status !== "opened") return json({ error: "There's no open dispute on this booking." }, 400);

  const { error: updateError } = await admin
    .from("marketplace_bookings")
    .update({ dispute_status: "resolved", dispute_resolution: resolution, resolved_at: new Date().toISOString() })
    .eq("id", bookingId);
  if (updateError) return json({ error: "Couldn't resolve the dispute: " + updateError.message }, 500);

  return json({ ok: true });
});
