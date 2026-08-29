// ==========================================================================
// BOARDLY - marketplace-create-booking Edge Function
// Deploy with:  supabase functions deploy marketplace-create-booking --no-verify-jwt
//
// Needs --no-verify-jwt because the person calling this is a client
// browsing marketplace.html with no Boardly account at all - same
// reason client-portal-action and get-shared-board both need it too.
//
// What this does: a client on a provider's public profile page fills in
// a booking request (what they need, how much they'll pay) and this
// function (1) checks that provider is actually real, published, and
// has finished payout setup, (2) creates the escrow ledger row
// (marketplace_bookings, status 'pending_payment'), and (3) asks
// Paystack for a hosted checkout link, which the browser then redirects
// to. Nobody's card details ever pass through Boardly - Paystack's own
// page handles that entirely.
//
// Needs PAYSTACK_SECRET_KEY (same secret marketplace-setup-payout uses)
// plus the service role key every Edge Function already gets
// automatically.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

const MIN_AMOUNT_NGN = 100; // Paystack's own practical floor is much lower, but this keeps test/junk bookings out of a real provider's inbox

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!paystackKey) {
    return json({ error: "Payments aren't set up on this Boardly yet - the provider needs to finish payout setup first." }, 500);
  }

  let profileUserId: string, clientName: string, clientEmail: string, description: string, amount: number, origin: string;
  try {
    const body = await request.json();
    profileUserId = String(body.profileUserId || "");
    clientName = String(body.clientName || "").trim().slice(0, 120);
    clientEmail = String(body.clientEmail || "").trim().slice(0, 200);
    description = String(body.description || "").trim().slice(0, 2000);
    amount = Number(body.amount);
    origin = String(body.origin || "").replace(/\/$/, "");
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!profileUserId || !clientName || !clientEmail || !clientEmail.includes("@") || !description) {
    return json({ error: "Missing required booking details" }, 400);
  }
  if (!Number.isFinite(amount) || amount < MIN_AMOUNT_NGN) {
    return json({ error: `Amount must be at least ₦${MIN_AMOUNT_NGN}` }, 400);
  }
  if (!origin || !/^https?:\/\//.test(origin)) {
    return json({ error: "Missing page origin" }, 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: profile, error: profileError } = await admin
    .from("marketplace_profiles")
    .select("user_id, display_name, is_public, accepts_bookings")
    .eq("user_id", profileUserId)
    .maybeSingle();
  if (profileError || !profile || !profile.is_public) {
    return json({ error: "This profile isn't available for booking." }, 404);
  }
  if (!profile.accepts_bookings) {
    return json({ error: "This provider hasn't finished setting up payments yet - try sending an inquiry instead." }, 400);
  }

  const { data: payout, error: payoutError } = await admin
    .from("marketplace_provider_payouts")
    .select("paystack_recipient_code")
    .eq("user_id", profileUserId)
    .maybeSingle();
  if (payoutError || !payout?.paystack_recipient_code) {
    return json({ error: "This provider's payout setup looks incomplete - try sending an inquiry instead." }, 400);
  }

  const { data: booking, error: insertError } = await admin
    .from("marketplace_bookings")
    .insert({
      profile_user_id: profileUserId,
      client_name: clientName,
      client_email: clientEmail,
      description,
      amount,
      currency: "NGN",
      status: "pending_payment",
    })
    .select()
    .single();
  if (insertError || !booking) {
    return json({ error: "Couldn't start this booking: " + (insertError?.message || "unknown error") }, 500);
  }

  const callbackUrl = `${origin}/booking-status.html?id=${booking.id}&token=${booking.access_token}`;

  const initRes = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { authorization: `Bearer ${paystackKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      email: clientEmail,
      amount: Math.round(amount * 100), // naira -> kobo
      reference: booking.id,
      callback_url: callbackUrl,
      metadata: { booking_id: booking.id, provider_name: profile.display_name },
    }),
  });
  const initData = await initRes.json();
  if (!initRes.ok || !initData.status) {
    // Roll the booking back to 'cancelled' rather than leaving an orphan
    // pending row nobody will ever pay - keeps the provider's Bookings
    // tab honest about what's actually in flight.
    await admin.from("marketplace_bookings").update({ status: "cancelled" }).eq("id", booking.id);
    return json({ error: initData.message || "Paystack couldn't start this payment" }, 502);
  }

  await admin.from("marketplace_bookings").update({ paystack_reference: booking.id }).eq("id", booking.id);

  return json({
    authorizationUrl: initData.data.authorization_url,
    bookingId: booking.id,
    accessToken: booking.access_token,
  });
});
