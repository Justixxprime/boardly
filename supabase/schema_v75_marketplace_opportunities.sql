-- ===========================================================================
-- BOARDLY 2.0: schema v75, Marketplace Opportunities (brief Sections 4/16,
-- the "Discover > Find work" half of Marketplace)
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- THE DECISION THIS RESOLVES: Section 94's own success-criteria walkthrough
-- (docs/BOARDLY_94_SUCCESS_CRITERIA_WALKTHROUGH.md) flagged that Boardly's
-- Marketplace was architecturally a searchable directory of professional
-- profiles plus client-initiated inquiries and bookings, not the job-board
-- model (a client posts a job, professionals browse it and apply) the
-- brief's own Section 16 describes. Charles asked for the best option to
-- be picked and built. The directory (schema_v30) already works, is real,
-- and moves real escrow money, brief Section 89 says never destroy working
-- functionality without a clear replacement, so this ADDS a job board
-- alongside it rather than replacing it. This matches the brief's own
-- Section 4 information architecture exactly: Discover already lists
-- "Find work" and "Find professionals" as two separate things, not one.
--
-- Scope of this first pass, stated plainly: posting a job and applying to
-- one are both real here. Accepting an application is a real status
-- change the poster makes, but it does NOT itself create an escrow
-- booking or move money, that's a genuine follow-up (wiring an accepted
-- application into the existing marketplace-create-booking flow), not
-- built in this pass. Never claim more than what's actually wired.
-- ===========================================================================

create table if not exists public.marketplace_opportunities (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade, -- who posted the job
  title        text not null,
  description  text not null,
  category     text,
  budget_min   numeric,
  budget_max   numeric,
  currency     text not null default 'NGN',
  status       text not null default 'open' check (status in ('open', 'closed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.marketplace_opportunities enable row level security;
create index if not exists idx_marketplace_opportunities_user_id on public.marketplace_opportunities(user_id);
create index if not exists idx_marketplace_opportunities_status on public.marketplace_opportunities(status);

-- Same public-discovery reasoning as schema_v30's "Anyone can view
-- published marketplace profiles": an open job posting needs to be
-- readable by a signed-out visitor too, that's the whole point of a
-- job board. A closed one stays visible only to the person who posted
-- it, so their own "My postings" list still works after closing one.
drop policy if exists "Anyone can view open opportunities" on public.marketplace_opportunities;
create policy "Anyone can view open opportunities"
  on public.marketplace_opportunities for select
  using (status = 'open' or user_id = auth.uid());

drop policy if exists "Users create their own opportunities" on public.marketplace_opportunities;
create policy "Users create their own opportunities"
  on public.marketplace_opportunities for insert
  with check (user_id = auth.uid());

drop policy if exists "Users update their own opportunities" on public.marketplace_opportunities;
create policy "Users update their own opportunities"
  on public.marketplace_opportunities for update
  using (user_id = auth.uid());

drop policy if exists "Users delete their own opportunities" on public.marketplace_opportunities;
create policy "Users delete their own opportunities"
  on public.marketplace_opportunities for delete
  using (user_id = auth.uid());

create table if not exists public.marketplace_applications (
  id                 uuid primary key default gen_random_uuid(),
  opportunity_id     uuid not null references public.marketplace_opportunities(id) on delete cascade,
  applicant_user_id  uuid not null references auth.users(id) on delete cascade,
  message            text not null,
  proposed_price     numeric,
  status             text not null default 'submitted' check (status in ('submitted', 'accepted', 'declined')),
  created_at         timestamptz not null default now(),
  -- One application per person per job, applying twice should edit the
  -- existing one, not create a second row a poster has to sort through.
  unique (opportunity_id, applicant_user_id)
);

alter table public.marketplace_applications enable row level security;
create index if not exists idx_marketplace_applications_opportunity_id on public.marketplace_applications(opportunity_id);
create index if not exists idx_marketplace_applications_applicant_user_id on public.marketplace_applications(applicant_user_id);

-- An application is visible to the person who sent it AND to whoever
-- posted the job it's on, nobody else, the same two-sided-but-private
-- visibility a real job application has.
drop policy if exists "Applicants and posters can view applications" on public.marketplace_applications;
create policy "Applicants and posters can view applications"
  on public.marketplace_applications for select
  using (
    applicant_user_id = auth.uid()
    or opportunity_id in (select id from public.marketplace_opportunities where user_id = auth.uid())
  );

drop policy if exists "Users can apply to opportunities" on public.marketplace_applications;
create policy "Users can apply to opportunities"
  on public.marketplace_applications for insert
  with check (applicant_user_id = auth.uid());

-- Only the job's poster can change an application's status (accept or
-- decline), never the applicant themselves.
drop policy if exists "Posters can update applications on their own opportunities" on public.marketplace_applications;
create policy "Posters can update applications on their own opportunities"
  on public.marketplace_applications for update
  using (opportunity_id in (select id from public.marketplace_opportunities where user_id = auth.uid()));
