// ==========================================================================
// BOARDLY 2.0: marketplace-pay-application Edge Function
// Deploy with:  supabase functions deploy marketplace-pay-application
// (keep JWT verification ON, the caller is a signed-in Boardly user)
//
// What this does: the person who POSTED a job has accepted an application and
// now wants to pay for it. This function
//   1. checks who is calling (a real signed-in user) and that they own the job,
//   2. checks the application is 'accepted' and has a real price,
//   3. checks the applicant finished payout setup (same rule as a normal
//      marketplace booking),
//   4. creates the escrow booking (marketplace_bookings, 'pending_payment'),
//      links it to the application, and asks Paystack for a hosted checkout
//      page, then returns that page's address.
//
// The amount ALWAYS comes from the application's proposed_price in the
// database. Nothing about money is read from the browser. The poster's own
// email comes from their login, not from the request. The return address uses
// a fixed SITE_URL, never a browser-sent origin.
//
// The booking only ever becomes paid inside payment-webhook (or
// marketplace-verify-payment), after Squad itself says so. Nothing in this
// function marks anything paid. The held money is released later by the
// poster, through the existing booking-status page and
// marketplace-release-payment, exactly like a normal Marketplace booking.
//
// Safe to call twice: one application gets one booking. A second call returns
// the same checkout page while it is still pending.
//
// SWITCHED TO SQUAD on 22 Sep 2026. Needs SQUAD_SECRET_KEY (already set,
// same secret marketplace-setup-payout uses). PUBLIC_APP_URL is optional
// and defaults to the live GitHub Pages address below.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

function squadBaseUrl(secretKey: string): string {
  return secretKey.startsWith("sandbox_sk_") ? "https://sandbox-api-d.squadco.com" : "https://api-d.squadco.com";
}

const SITE_URL = (Deno.env.get("PUBLIC_APP_URL") || "https://justixxprime.github.io/boardly").replace(/\/+$/, "");
const MIN_AMOUNT_NGN = 100;
// A payment page that has sat unpaid this long is treated as abandoned, and a
// fresh one may be made. Before that, the same page is handed back.
const STALE_PENDING_MS = 24 * 60 * 60 * 1000;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const squadKey = Deno.env.get("SQUAD_SECRET_KEY");
  if (!squadKey) return json({ error: "Payments aren't set up on this Boardly yet." }, 500);

  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth token" }, 401);
  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) return json({ error: "Could not verify who you are, try logging in again." }, 401);
  if (!user.email) return json({ error: "Your account has no email address, so Squad can't take a payment from it." }, 400);

  let applicationId: string;
  try {
    const body = await request.json();
    applicationId = String(body.applicationId || "");
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) return json({ error: "Missing application id" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: app, error: appError } = await admin
    .from("marketplace_applications")
    .select("id, opportunity_id, applicant_user_id, proposed_price, status, booking_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (appError || !app) return json({ error: "Application not found." }, 404);

  const { data: job } = await admin
    .from("marketplace_opportunities")
    .select("id, user_id, title, description, currency")
    .eq("id", app.opportunity_id)
    .maybeSingle();
  if (!job) return json({ error: "Application not found." }, 404);
  // Same answer as "not found" on purpose, so this can't be used to probe
  // which application ids exist.
  if (job.user_id !== user.id) return json({ error: "Application not found." }, 404);

  if (app.status !== "accepted") return json({ error: "Accept this application first, then you can pay for it." }, 400);
  if (job.currency !== "NGN") {
    return json({ error: `Payments through Boardly are in Naira only for now, and this job is priced in ${job.currency}.` }, 400);
  }
  const amount = Number(app.proposed_price);
  if (!Number.isFinite(amount) || amount < MIN_AMOUNT_NGN) {
    return json({ error: `The agreed price must be at least ₦${MIN_AMOUNT_NGN}.` }, 400);
  }

  // Payout readiness of the person who would be paid.
  const { data: profile } = await admin
    .from("marketplace_profiles")
    .select("user_id, display_name, accepts_bookings")
    .eq("user_id", app.applicant_user_id)
    .maybeSingle();
  if (!profile || !profile.accepts_bookings) {
    return json({ error: "This person hasn't finished setting up payouts yet, so Boardly can't hold money for them. Ask them to complete payout setup in their Marketplace profile, then try again." }, 400);
  }
  const { data: payout } = await admin
    .from("marketplace_provider_payouts")
    .select("account_number, paystack_recipient_code")
    .eq("user_id", app.applicant_user_id)
    .maybeSingle();
  if (!payout || (!payout.account_number && !payout.paystack_recipient_code)) {
    return json({ error: "This person's payout setup looks incomplete, so Boardly can't hold money for them yet." }, 400);
  }

  // Already linked to a booking? Decide whether to reuse it.
  if (app.booking_id) {
    const { data: existing } = await admin
      .from("marketplace_bookings")
      .select("id, status, access_token, checkout_url, created_at")
      .eq("id", app.booking_id)
      .maybeSingle();
    if (existing) {
      if (existing.status === "paid_held" || existing.status === "released" || existing.status === "refunded") {
        return json({ error: "This application has already been paid for.", bookingId: existing.id, accessToken: existing.access_token, status: existing.status }, 409);
      }
      if (existing.status === "pending_payment") {
        // If Squad already has the money, do not open a second payment.
        const verifyRes = await fetch(`${squadBaseUrl(squadKey)}/transaction/verify/${encodeURIComponent(existing.id)}`, {
          headers: { authorization: `Bearer ${squadKey}` },
        });
        const verifyData = await verifyRes.json().catch(() => ({}));
        if (verifyRes.ok && verifyData?.data?.transaction_status?.toLowerCase() === "success") {
          return json({
            error: "Your payment went through and is being confirmed. Open the payment status page to check.",
            bookingId: existing.id, accessToken: existing.access_token, status: "pending_payment",
          }, 409);
        }
        const age = Date.now() - new Date(existing.created_at).getTime();
        if (existing.checkout_url && age < STALE_PENDING_MS) {
          return json({ authorizationUrl: existing.checkout_url, bookingId: existing.id, accessToken: existing.access_token, reused: true });
        }
        // Old, unpaid, abandoned: close it and start fresh below. The
        // conditional update means a payment that lands right now still wins.
        const { data: closed } = await admin
          .from("marketplace_bookings")
          .update({ status: "cancelled" })
          .eq("id", existing.id)
          .eq("status", "pending_payment")
          .select("id");
        if (!closed || closed.length === 0) {
          return json({ error: "This payment just changed state. Refresh the page and check its status." }, 409);
        }
      }
      // 'cancelled' falls through to a fresh booking.
    }
    await admin
      .from("marketplace_applications")
      .update({ booking_id: null, booking_access_token: null })
      .eq("id", app.id)
      .eq("booking_id", app.booking_id);
  }

  const clientName = String(user.user_metadata?.full_name || user.user_metadata?.name || user.email.split("@")[0]).slice(0, 120);
  const description = `${job.title}\n\n${String(job.description || "")}`.slice(0, 2000);

  const { data: booking, error: insertError } = await admin
    .from("marketplace_bookings")
    .insert({
      profile_user_id: app.applicant_user_id,
      client_name: clientName,
      client_email: user.email,
      description,
      amount,
      currency: "NGN",
      status: "pending_payment",
    })
    .select("id, access_token")
    .single();
  if (insertError || !booking) {
    return json({ error: "Couldn't start this payment: " + (insertError?.message || "unknown error") }, 500);
  }

  // Claim the application for this booking. Only one caller can win, so two
  // quick double-clicks can never leave two live bookings on one application.
  const { data: claimed } = await admin
    .from("marketplace_applications")
    .update({ booking_id: booking.id, booking_access_token: booking.access_token })
    .eq("id", app.id)
    .is("booking_id", null)
    .select("id");
  if (!claimed || claimed.length === 0) {
    await admin.from("marketplace_bookings").delete().eq("id", booking.id).eq("status", "pending_payment");
    return json({ error: "Another payment is already being started for this application. Wait a moment and check again." }, 409);
  }

  const callbackUrl = `${SITE_URL}/booking-status.html?id=${booking.id}&token=${booking.access_token}`;
  const initRes = await fetch(`${squadBaseUrl(squadKey)}/transaction/initiate`, {
    method: "POST",
    headers: { authorization: `Bearer ${squadKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      email: user.email,
      amount: Math.round(amount * 100), // naira to kobo
      currency: "NGN",
      initiate_type: "inline",
      transaction_ref: booking.id,
      callback_url: callbackUrl,
      customer_name: clientName,
      metadata: { booking_id: booking.id, application_id: app.id, provider_name: profile.display_name },
    }),
  });
  const initData = await initRes.json().catch(() => ({}));
  if (!initRes.ok || initData.status !== 200 || !initData.data?.checkout_url) {
    // Nothing was charged. Undo the link so the poster can simply try again.
    await admin.from("marketplace_bookings").update({ status: "cancelled" }).eq("id", booking.id);
    await admin
      .from("marketplace_applications")
      .update({ booking_id: null, booking_access_token: null })
      .eq("id", app.id)
      .eq("booking_id", booking.id);
    return json({ error: initData.message || "Squad couldn't start this payment" }, 502);
  }

  await admin
    .from("marketplace_bookings")
    .update({ paystack_reference: booking.id, checkout_url: initData.data.checkout_url })
    .eq("id", booking.id);

  return json({ authorizationUrl: initData.data.checkout_url, bookingId: booking.id, accessToken: booking.access_token });
});
