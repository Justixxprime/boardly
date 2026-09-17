// ==========================================================================
// BOARDLY 2.0: marketplace-delete-booking Edge Function
// Deploy with:  supabase functions deploy marketplace-delete-booking
//
// Provider-only, JWT-verified, same pattern as marketplace-resolve-
// dispute. Charles asked for a way to delete a stray booking (mostly
// test bookings created while trying the flow out, stuck forever in
// "Awaiting payment" since nobody ever actually paid them).
//
// SAFETY RULE, this is the whole point of this function existing as a
// guarded edge function rather than a plain client-side delete: only
// pending_payment and cancelled bookings can ever be deleted. Neither
// status means money ever moved (cancelled is set by marketplace-
// create-booking's own rollback path when Paystack initialization
// itself failed, see that function's comment). paid_held, released,
// and refunded are real financial events and are never deletable here,
// matching brief Section 55's audit-log requirement and Section 89's
// "do not alter payment records destructively." There was never a
// client-side RLS delete policy on marketplace_bookings at all (see
// rls_policy_audit.sql), this function is the one narrow, checked
// path in.
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

  let bookingId: string;
  try {
    const body = await request.json();
    bookingId = String(body.bookingId || "");
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!bookingId) return json({ error: "Missing booking id" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: booking, error: fetchError } = await admin
    .from("marketplace_bookings")
    .select("id, profile_user_id, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (fetchError || !booking) return json({ error: "Booking not found" }, 404);
  if (booking.profile_user_id !== user.id) return json({ error: "This isn't your booking." }, 403);
  if (booking.status !== "pending_payment" && booking.status !== "cancelled") {
    return json({ error: "This booking has payment history and can't be deleted. Bookings can only be removed before payment happens." }, 400);
  }

  const { error: deleteError } = await admin.from("marketplace_bookings").delete().eq("id", bookingId);
  if (deleteError) return json({ error: "Couldn't delete this booking: " + deleteError.message }, 500);

  return json({ ok: true });
});
