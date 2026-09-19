// ==========================================================================
// BOARDLY 2.0: marketplace-find-bookings-by-email Edge Function
// Deploy with:  supabase functions deploy marketplace-find-bookings-by-email --no-verify-jwt
//
// The gap this closes: a client's only way back to booking-status.html is
// the id + access_token pair in one specific link. Close the tab, lose the
// email, come back days later, and there was no way in.
//
// HOW IT WORKS NOW (changed after a security review): this function no
// longer RETURNS anything sensitive. It looks bookings up by the email the
// client typed when booking, then EMAILS the booking links to that same
// address. Whoever asks only ever sees the same neutral reply, whether or
// not a booking exists, so it can't be used to find out whose email is on
// Boardly, and it can't be used to pick up someone else's links.
//
// WHY IT CHANGED: the access_token is the ONLY credential that lets a
// person release held money (marketplace-release-payment), file a dispute
// or leave a review. The first version returned that token in the response
// to anyone who typed the email, and a booking's email is known to the
// provider and often to others. Emailing the links makes the inbox the
// proof of ownership, which is the usual "magic link" pattern.
//
// Needs the same Brevo secrets send-reminders already uses:
//   BREVO_API_KEY, BREVO_SENDER_EMAIL
// Optional: SITE_URL (defaults to the GitHub Pages address below). The link
// base is fixed on purpose. Never build it from the request, or an attacker
// could make Boardly email a victim a link that hands the token to another
// site.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

const DEFAULT_SITE_URL = "https://justixxprime.github.io/boardly";
const EMAILS_PER_ADDRESS_PER_HOUR = 3;
const NEUTRAL_REPLY = { ok: true, message: "If there are bookings under that email, we've sent the links to it. Check your inbox and your spam folder." };

// Best-effort limit so this can't be used to flood someone's inbox. It lives
// in this isolate's memory, so it is a speed bump, not a hard guarantee.
const sentLog = new Map<string, number[]>();
function overLimit(email: string): boolean {
  const now = Date.now();
  const recent = (sentLog.get(email) || []).filter((t) => now - t < 3600_000);
  const over = recent.length >= EMAILS_PER_ADDRESS_PER_HOUR;
  if (!over) recent.push(now);
  sentLog.set(email, recent);
  return over;
}

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  let email: string;
  try {
    const body = await request.json();
    email = String(body.email || "").trim().toLowerCase();
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    return json({ error: "Enter a valid email address." }, 400);
  }

  const brevoKey = Deno.env.get("BREVO_API_KEY");
  const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL");
  if (!brevoKey || !senderEmail) {
    return json({ error: "Email sending isn't set up yet, so we can't send your booking links. Please contact the provider you booked with." }, 500);
  }

  // Same neutral reply when rate limited, so the limit itself reveals nothing.
  if (overLimit(email)) return json(NEUTRAL_REPLY);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await admin
    .from("marketplace_bookings")
    .select("id, description, amount, currency, status, created_at, access_token")
    .ilike("client_email", email.replace(/[\\%_]/g, "\\$&"))
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return json({ error: "Couldn't look that up right now." }, 500);

  if (data && data.length) {
    const base = (Deno.env.get("SITE_URL") || DEFAULT_SITE_URL).replace(/\/+$/, "");
    const rows = data.map((b) => {
      const link = `${base}/booking-status.html?id=${encodeURIComponent(b.id)}&token=${encodeURIComponent(b.access_token)}`;
      const when = new Date(b.created_at).toISOString().slice(0, 10);
      return `<li style="margin-bottom:12px"><strong>${esc(b.description || "Booking")}</strong><br>${esc(b.currency)} ${esc(Number(b.amount).toLocaleString("en-US"))}, ${esc(when)}, status: ${esc(b.status)}<br><a href="${esc(link)}">Open this booking</a></li>`;
    }).join("");
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c1c1c">
      <p>Someone asked for the links to your Boardly Marketplace bookings using this email address. If that was you, here they are:</p>
      <ul style="padding-left:18px">${rows}</ul>
      <p style="color:#666;font-size:12px">Keep these links private. Anyone who has one can confirm work as done and release the payment. If you didn't ask for this email, you can ignore it.</p>
    </div>`;

    const mailRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoKey, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: "Boardly", email: senderEmail },
        to: [{ email }],
        subject: "Your Boardly booking links",
        htmlContent: html,
      }),
    });
    if (!mailRes.ok) {
      console.warn(`marketplace-find-bookings-by-email: Brevo returned ${mailRes.status}`);
      return json({ error: "We couldn't send the email right now. Try again in a few minutes." }, 502);
    }
  }

  return json(NEUTRAL_REPLY);
});
