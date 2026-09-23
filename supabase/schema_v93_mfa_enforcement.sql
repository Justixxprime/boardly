-- ===========================================================================
-- BOARDLY - schema v93: MFA server-side enforcement (F6, Step A)
--
-- This is the part of two-factor authentication that actually matters.
-- js/mfa.js and the new Settings panel let someone turn on an
-- authenticator app, and login.html asks for a code after the password
-- step - but none of that is real security by itself, since a browser's
-- JavaScript can always be skipped past. This file is what makes it
-- real: it tells Postgres itself to refuse to answer queries against
-- money tables unless the session's authenticator assurance level is
-- aal2, for any user who has a verified factor.
--
-- Pattern: Supabase's own "opted-in" template (see
-- https://supabase.com/docs/guides/auth/auth-mfa#enforce-only-for-users-that-have-opted-in).
-- A user who has never turned MFA on is completely unaffected (the
-- policy accepts both aal1 and aal2 for them). A user who has turned
-- it on is only let through at aal2 - meaning if they somehow reached
-- this table with a stolen password alone (aal1), the row simply does
-- not come back, on EVERY command (select/insert/update/delete), on
-- every path (browser query, not just the pages Boardly happens to
-- render a challenge screen on).
--
-- Safe to re-run: every create policy is preceded by a matching drop.
--
-- SCOPE OF THIS PASS: the three tables that hold real money - invoices,
-- transactions, marketplace_provider_payouts. Every other table in the
-- schema (90+ migrations' worth) was NOT inventoried table-by-table in
-- this pass. Applying the same "as restrictive ... requires_aal2()"
-- policy to a wider set of tables (boards, tasks, clients, etc.) is a
-- deliberate Step B left for later, once this is confirmed working -
-- see the QUEUE note in the handoff prompt. Do not assume this
-- protects anything beyond the three tables named above.
--
-- This does NOT affect Edge Functions using the service role key
-- (payment-webhook, invoice-payment-webhook, marketplace-*) - the
-- service role bypasses RLS entirely, exactly as it needs to.
-- ===========================================================================

create or replace function public.requires_aal2()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    array[(select auth.jwt() ->> 'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1', 'aal2']
      end
      from auth.mfa_factors
      where user_id = (select auth.uid())
        and status = 'verified'
    );
$$;

comment on function public.requires_aal2() is
  'True if the current session is aal2, OR the signed-in user has no verified MFA factor (so MFA-off users are unaffected). Used by restrictive RLS policies. F6.';

-- invoices ------------------------------------------------------------------
drop policy if exists "require_aal2_if_mfa_enrolled" on public.invoices;
create policy "require_aal2_if_mfa_enrolled"
  on public.invoices
  as restrictive
  for all
  to authenticated
  using (public.requires_aal2())
  with check (public.requires_aal2());

-- transactions ----------------------------------------------------------
drop policy if exists "require_aal2_if_mfa_enrolled" on public.transactions;
create policy "require_aal2_if_mfa_enrolled"
  on public.transactions
  as restrictive
  for all
  to authenticated
  using (public.requires_aal2())
  with check (public.requires_aal2());

-- marketplace_provider_payouts (bank account details) ------------------
drop policy if exists "require_aal2_if_mfa_enrolled" on public.marketplace_provider_payouts;
create policy "require_aal2_if_mfa_enrolled"
  on public.marketplace_provider_payouts
  as restrictive
  for all
  to authenticated
  using (public.requires_aal2())
  with check (public.requires_aal2());
