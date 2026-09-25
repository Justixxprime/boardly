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
// (marketplace_bookings, status 'pending_payment'), and (3) asks Squad
// for a hosted checkout link, which the browser then redirects to.
// Nobody's card details ever pass through Boardly - Squad's own page
// handles that entirely.
//
// SWITCHED TO SQUAD on 22 Sep 2026, same reason as everywhere else in
// Marketplace: Squad doesn't require a registered business to start
// taking and holding money, which matters while Boardly is still being
// tested. Squad's own signed webhook confirms the charge exactly like
// Paystack's did (see payment-webhook and marketplace-payment-webhook).
//
// Needs SQUAD_SECRET_KEY (same secret marketplace-setup-payout uses)
// plus the service role key every Edge Function already gets
// automatically. The "paystack_reference" column on marketplace_bookings
// keeps its old name for now (renaming needs a migration nobody has
// needed yet), but it just holds "whichever reference the payment
// provider was given," Squad's transaction_ref goes there exactly the
// same as a Paystack reference used to.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

// Fixed, server-side site address, same pattern as
// marketplace-find-bookings-by-email's DEFAULT_SITE_URL and
// video-workroom's siteUrl. This used to be built from a browser-sent
// "origin" field instead, which meant anyone calling this function could
// point Paystack's post-payment redirect at any domain they liked (a
// paying client would finish a real charge and land on a page Boardly
// never controlled). Set PUBLIC_APP_URL as a secret only if the real site
// ever moves off this address.
const SITE_URL = (Deno.env.get("PUBLIC_APP_URL") || "https://justixxprime.github.io/boardly").replace(/\/+$/, "");

function squadBaseUrl(secretKey: string): string {
  return secretKey.startsWith("sandbox_sk_") ? "https://sandbox-api-d.squadco.com" : "https://api-d.squadco.com";
}

const MIN_AMOUNT_NGN = 100; // Squad's own practical floor is much lower, but this keeps test/junk bookings out of a real provider's inbox

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const squadKey = Deno.env.get("SQUAD_SECRET_KEY");
  if (!squadKey) {
    return json({ error: "Payments aren't set up on this Boardly yet - the provider needs to finish payout setup first." }, 500);
  }

  let profileUserId: string, clientName: string, clientEmail: string, description: string, amount: number, serviceId: string | null;
  try {
    const body = await request.json();
    profileUserId = String(body.profileUserId || "");
    clientName = String(body.clientName || "").trim().slice(0, 120);
    clientEmail = String(body.clientEmail || "").trim().slice(0, 200);
    description = String(body.description || "").trim().slice(0, 2000);
    amount = Number(body.amount);
    serviceId = body.serviceId ? String(body.serviceId) : null;
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!profileUserId || !clientName || !clientEmail || !clientEmail.includes("@") || !description) {
    return json({ error: "Missing required booking details" }, 400);
  }
  if (!Number.isFinite(amount) || amount < MIN_AMOUNT_NGN) {
    return json({ error: `Amount must be at least ₦${MIN_AMOUNT_NGN}` }, 400);
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
    .select("account_number, paystack_recipient_code")
    .eq("user_id", profileUserId)
    .maybeSingle();
  if (payoutError || !payout || (!payout.account_number && !payout.paystack_recipient_code)) {
    return json({ error: "This provider's payout setup looks incomplete - try sending an inquiry instead." }, 400);
  }

  // serviceId is never trusted for the amount (the client-editable amount
  // field works exactly as it did before this feature existed), it's only
  // stored so the provider can see which listing a booking came from. It's
  // checked here against the actual profile so a booking can never point
  // at a service belonging to a different provider entirely.
  let validServiceId: string | null = null;
  if (serviceId) {
    const { data: service } = await admin
      .from("marketplace_services")
      .select("id")
      .eq("id", serviceId)
      .eq("user_id", profileUserId)
      .maybeSingle();
    if (service) validServiceId = service.id;
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
      service_id: validServiceId,
    })
    .select()
    .single();
  if (insertError || !booking) {
    return json({ error: "Couldn't start this booking: " + (insertError?.message || "unknown error") }, 500);
  }

  const callbackUrl = `${SITE_URL}/booking-status.html?id=${booking.id}&token=${booking.access_token}`;

  const initRes = await fetch(`${squadBaseUrl(squadKey)}/transaction/initiate`, {
    method: "POST",
    headers: { authorization: `Bearer ${squadKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      email: clientEmail,
      amount: Math.round(amount * 100), // naira -> kobo
      currency: "NGN",
      initiate_type: "inline",
      transaction_ref: booking.id,
      callback_url: callbackUrl,
      customer_name: clientName,
      metadata: { booking_id: booking.id, provider_name: profile.display_name },
    }),
  });
  const initData = await initRes.json();
  if (!initRes.ok || initData.status !== 200 || !initData.data?.checkout_url) {
    // Roll the booking back to 'cancelled' rather than leaving an orphan
    // pending row nobody will ever pay - keeps the provider's Bookings
    // tab honest about what's actually in flight.
    await admin.from("marketplace_bookings").update({ status: "cancelled" }).eq("id", booking.id);
    return json({ error: initData.message || "Squad couldn't start this payment" }, 502);
  }

  await admin.from("marketplace_bookings").update({ paystack_reference: booking.id }).eq("id", booking.id);

  return json({
    authorizationUrl: initData.data.checkout_url,
    bookingId: booking.id,
    accessToken: booking.access_token,
  });
});
