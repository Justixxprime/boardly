// ==========================================================================
// BOARDLY 2.0: marketplace-find-bookings-by-email Edge Function
// Deploy with:  supabase functions deploy marketplace-find-bookings-by-email --no-verify-jwt
//
// Charles reported a real, understandable gap: a client's only way to
// booking-status.html is the id+access_token pair in one specific link
// (the Paystack callback, or one shared by the provider). Close that
// tab too early, lose the email, or just come back days later without
// bookmarking it, and there was no way back in at all.
//
// This looks bookings up by the email the client actually typed when
// booking (marketplace_bookings.client_email), the same address
// Paystack's own receipt went to. No password, matches the security
// bar of "if you know the email, you can find it," the same bar an
// airline's own "find my booking" page uses. It does NOT return
// anything sensitive beyond what the client already put in themselves
// (their own description and amount), and the access_token it returns
// is the same one already reachable via the original callback link,
// this isn't handing out anything new, just a second way to the same
// door.
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

  let email: string;
  try {
    const body = await request.json();
    email = String(body.email || "").trim().toLowerCase();
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!email || !email.includes("@")) return json({ error: "Enter a valid email address." }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await admin
    .from("marketplace_bookings")
    .select("id, description, amount, currency, status, created_at, access_token")
    .ilike("client_email", email)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return json({ error: "Couldn't look that up right now." }, 500);
  return json({ bookings: data || [] });
});
