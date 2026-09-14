// ==========================================================================
// BOARDLY 2.0: admin-system-health Edge Function (Section 77)
// Deploy with:  supabase functions deploy admin-system-health
//
// Needs a real login (no --no-verify-jwt) and the same ADMIN_EMAILS
// check as admin-list-users, verified the exact same way, server-side,
// against an Edge Function secret, never a client-side flag.
//
// Section 77 asks for "an internal health page" covering payment
// monitoring, webhook monitoring, and audit logs. This is that page's
// data source. Every number below is a real count from a real table,
// nothing here is a fabricated uptime percentage or invented latency
// figure, Boardly has no infrastructure monitoring stack, so this
// only ever reports what the database itself actually knows:
//   - failedPayments7d / failedPayments30d: transactions with
//     status='failed', the direct signal that Paystack's webhook (or
//     checkout) is not completing cleanly for someone.
//   - openDisputes: marketplace_bookings.dispute_status='opened'
//     across every provider, not just one account.
//   - pendingOver24h: transactions stuck in status='pending' for more
//     than a day, a real sign a webhook never arrived (see
//     expire_stale_pending_transactions in schema_v63, this is what
//     that function would clean up if it were scheduled).
//   - overdueInvoices: invoices.status='overdue' platform-wide.
//   - recentSecurityEvents: a row count from the existing
//     security_events table (schema_v35), Boardly's real audit log.
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
  if (userError || !user?.email) return json({ error: "Could not verify who you are, try logging in again." }, 401);

  const adminEmails = (Deno.env.get("ADMIN_EMAILS") || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!adminEmails.includes(user.email.toLowerCase())) {
    return json({ error: "Not authorized." }, 403);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 86400000).toISOString();

  const [
    failedPayments7d,
    failedPayments30d,
    openDisputes,
    stalePending,
    overdueInvoices,
    recentSecurityEvents,
  ] = await Promise.all([
    admin.from("transactions").select("id", { count: "exact", head: true }).eq("type", "payment").eq("status", "failed").gte("created_at", sevenDaysAgo),
    admin.from("transactions").select("id", { count: "exact", head: true }).eq("type", "payment").eq("status", "failed").gte("created_at", thirtyDaysAgo),
    admin.from("marketplace_bookings").select("id", { count: "exact", head: true }).eq("dispute_status", "opened"),
    admin.from("transactions").select("id", { count: "exact", head: true }).eq("status", "pending").lt("created_at", oneDayAgo),
    admin.from("invoices").select("id", { count: "exact", head: true }).eq("status", "overdue"),
    admin.from("security_events").select("id", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
  ]);

  return json({
    ok: true,
    checkedAt: now.toISOString(),
    failedPayments7d: failedPayments7d.count || 0,
    failedPayments30d: failedPayments30d.count || 0,
    openDisputes: openDisputes.count || 0,
    stalePendingPayments: stalePending.count || 0,
    overdueInvoices: overdueInvoices.count || 0,
    recentSecurityEvents: recentSecurityEvents.count || 0,
  });
});
