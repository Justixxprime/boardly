-- ===========================================================================
-- BOARDLY 2.0: schema v63, Invoice Payments (Paystack)
-- Run this once in the Supabase SQL Editor, after schema_v62. Safe to
-- re-run, same convention as every prior schema file in this project.
--
-- schema_v62's transactions table was built for manual bookkeeping only
-- (the owner logging money that already moved), so every row was
-- implicitly already confirmed. A real payment gateway needs a middle
-- state: a payment gets initiated, then confirmed later by a verified
-- webhook, and it might also fail or never complete. This adds that
-- state machine without touching anything already in schema_v62.
--
-- Existing rows (all manual entries) default to 'confirmed', so nothing
-- already recorded changes meaning or disappears from the ledger.
-- ===========================================================================

alter table public.transactions
  add column if not exists status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'failed'));

create index if not exists idx_transactions_status on public.transactions(status);

-- A pending row that Paystack never confirms (abandoned checkout, expired
-- session) should not sit in "pending" forever confusing the owner's
-- ledger. This does not run automatically, it is here for a future
-- scheduled cleanup job to call, same spirit as the project's existing
-- prune_old_activity_events()/prune_old_security_events() functions.
create or replace function public.expire_stale_pending_transactions()
returns void
language sql
security invoker
set search_path = public
as $$
  update public.transactions
  set status = 'failed'
  where status = 'pending'
    and created_at < now() - interval '24 hours';
$$;
