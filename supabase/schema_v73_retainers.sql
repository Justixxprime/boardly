-- ===========================================================================
-- BOARDLY 2.0: schema v73, Retainers (brief Section 12)
-- Run this once in the Supabase SQL Editor, after schema_v62 through v64.
-- Safe to re-run, same convention as every prior schema file.
--
-- Section 94's own success-criteria walkthrough (docs/BOARDLY_94_SUCCESS_
-- CRITERIA_WALKTHROUGH.md) found this was a complete gap, repeated in both
-- the freelancer and agency personas ("offer retainer" / "retain client").
-- Nothing here existed before this file.
--
-- HONESTY NOTE, same as Money Foundation's own note: there is no
-- background job runner in this codebase, so a retainer's invoice is
-- NOT created silently on a schedule. Instead, Money's Retainers tab
-- shows which retainers are due for the current period, and a person
-- clicks "Generate this month's invoice" themselves. The invoice that
-- comes out of it is a completely normal invoice (same table, same
-- statuses, same PDF, same Paystack payment link), just pre-filled and
-- linked back to the retainer that produced it. "Automatically creates
-- a recurring invoice" (the brief's own phrase) would need a scheduled
-- Edge Function or pg_cron job, a real next increment, not built here,
-- not faked here either.
-- ===========================================================================

create table if not exists public.retainers (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  client_id           uuid references public.clients(id) on delete set null,
  name                text not null,
  description         text,
  amount              numeric not null default 0 check (amount >= 0),
  currency            text not null default 'NGN',
  -- Support hours included per period. Purely informational and
  -- manually edited, there is no time-tracking integration behind
  -- this number, see hours_used_this_period below.
  hours_included      numeric,
  hours_used_this_period numeric not null default 0,
  -- Day of the month a new invoice becomes due, kept to 1 to 28 so
  -- every month actually has that day, no February 30th problem.
  billing_day         int not null default 1 check (billing_day between 1 and 28),
  status              text not null default 'active' check (status in ('active','paused','cancelled')),
  started_on          date not null default current_date,
  -- 'YYYY-MM' of the last period this retainer was actually invoiced
  -- for, the single fact that decides whether "due this period" shows
  -- true. Null until the first invoice is generated.
  last_invoiced_period text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.retainers enable row level security;
create index if not exists idx_retainers_user_id on public.retainers(user_id);
create index if not exists idx_retainers_client_id on public.retainers(client_id);

drop policy if exists "Users manage their own retainers" on public.retainers;
create policy "Users manage their own retainers"
  on public.retainers for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Links a generated invoice back to the retainer that produced it, so
-- Money can show "this one came from a retainer" and so the app can
-- check last_invoiced_period before generating a duplicate for the
-- same month, rather than relying on a database constraint (a
-- "period" is a business concept computed in application code, not
-- something Postgres can derive from a date column alone).
alter table public.invoices
  add column if not exists retainer_id uuid references public.retainers(id) on delete set null;

create index if not exists idx_invoices_retainer_id on public.invoices(retainer_id);
