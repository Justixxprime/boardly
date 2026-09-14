-- ===========================================================================
-- BOARDLY 2.0: RLS policy audit (Section 78/79)
-- Run this any time in the Supabase SQL Editor, read-only, changes nothing.
--
-- This project has no build step and no test runner (no package.json,
-- no Jest, nothing that "npm test" could run), so a conventional
-- automated test suite the way Section 78 describes one isn't
-- something that actually executes here. What genuinely does run,
-- any time, with no setup: a direct query against Postgres's own
-- policy catalog. This file is that query, saved so the exact same
-- checks can be re-run after any schema change to catch a real
-- regression, not a one-off check that only ever happened once in a
-- chat session.
--
-- Each block below states what SHOULD be true and why, then the query
-- that verifies it. Read the output against the stated expectation.
-- ===========================================================================

-- ---------------------------------------------------------------------
-- CHECK 1: every table has row level security actually turned on.
-- Expected: every row's rls_enabled is true. The one exception is
-- idea_votes, which has RLS enabled but deliberately zero policies
-- (every write to it goes through an Edge Function using the service
-- role, verified separately below), that is correct, not a gap, do
-- not "fix" it by adding a permissive policy.
-- ---------------------------------------------------------------------
select tablename, rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
order by rowsecurity asc, tablename;

-- ---------------------------------------------------------------------
-- CHECK 2: money-adjacent and identity tables are scoped to the owner,
-- never to "true" (which would mean anyone signed in can read/write
-- everyone's data, the exact "User A can read User B's workspace" bug
-- Section 78 names directly).
-- Expected: every qual and with_check below reads
-- "(user_id = auth.uid())", nothing weaker.
-- ---------------------------------------------------------------------
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('invoices', 'transactions', 'clients', 'boards', 'marketplace_provider_payouts')
order by tablename, cmd;

-- ---------------------------------------------------------------------
-- CHECK 3: tables where a client (or any other unauthenticated/other-
-- account party) must NEVER be able to write directly, only ever
-- through a verified Edge Function using the service role. This is
-- what actually backs "frontend cannot mark payment as confirmed" and
-- "client cannot modify invoice amount" for money moved through
-- Marketplace, and "cannot fabricate a review."
-- Expected: zero rows with cmd in ('INSERT','UPDATE','DELETE','ALL')
-- for marketplace_bookings and marketplace_reviews. If either ever
-- shows up here, something added a write policy that should not
-- exist, that is a real regression, not a false positive.
-- ---------------------------------------------------------------------
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('marketplace_bookings', 'marketplace_reviews')
  and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');
-- Expected result: 0 rows.

-- ---------------------------------------------------------------------
-- CHECK 4: no table anywhere has RLS enabled with genuinely zero
-- policies UNLESS it's the one documented exception (idea_votes).
-- A table matching this with any other name is either a table that
-- needs a real policy added, or one where RLS should never have been
-- turned on without a plan for it.
-- Expected: only idea_votes appears.
-- ---------------------------------------------------------------------
select t.tablename
from pg_tables t
left join pg_policies p on p.tablename = t.tablename and p.schemaname = t.schemaname
where t.schemaname = 'public' and t.rowsecurity = true
group by t.tablename
having count(p.policyname) = 0;
-- Expected result: exactly one row, idea_votes.

-- ---------------------------------------------------------------------
-- CHECK 5: admin-gated functionality never checks a client-supplied
-- flag. This can't be verified from SQL (the check lives in Edge
-- Function code, in ADMIN_EMAILS, an Edge Function secret), included
-- here as a pointer rather than a query: read
-- supabase/functions/admin-list-users/index.ts and
-- supabase/functions/admin-system-health/index.ts and confirm both
-- verify the caller's own JWT-derived email server-side against
-- ADMIN_EMAILS before returning anything, never trusting a header or
-- body field the caller could set themselves.
-- ---------------------------------------------------------------------
