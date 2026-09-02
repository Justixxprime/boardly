-- ===========================================================================
-- BOARDLY - schema v49 "Capability System": Free / Pro / Pro+ plans
-- Run this once, same place as the others (Supabase SQL Editor). Safe to
-- re-run.
--
-- This is Phase 1 foundation work from the new master build spec: a
-- CENTRALIZED plan/entitlement system, rather than "if plan === pro"
-- scattered through the app. This migration only adds the plan itself -
-- see js/entitlements.js for the single source of truth on what each
-- plan actually unlocks, and PLAN_GATING_SETUP.md for how this is meant
-- to grow over time as more of the app gets gated.
--
-- IMPORTANT, READ BEFORE RUNNING: there is no live payment processor
-- wired up for subscriptions yet (Paystack is already connected, but
-- only for Marketplace escrow, a different, already-working feature).
-- Building a checkout button that doesn't actually charge anyone would
-- be exactly the kind of fake billing the build spec explicitly warns
-- against - so for now, moving someone onto Pro or Pro+ is a manual
-- step you do yourself in the Supabase Table Editor. See
-- PLAN_GATING_SETUP.md for exactly how.
-- ===========================================================================

-- One row per user. A user with NO row here is on Free - that's the
-- default read everywhere in the app (see get-my-plan / getMyPlan()),
-- so there's no need to backfill a row for every existing account.
create table if not exists public.user_plan (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro', 'pro_plus')),
  plan_started_at timestamptz not null default now(),
  -- Free-text note for YOU, never shown to the user - e.g. "manually
  -- upgraded after a support email, Sept 2026" or "beta tester". Purely
  -- a paper trail since there's no billing system yet to explain why
  -- someone is on a paid plan.
  plan_note text,
  updated_at timestamptz not null default now()
);

alter table public.user_plan enable row level security;

-- Users can SEE their own plan - the app needs this to show "You're on
-- Free" and to gate UI. They can NEVER write to it themselves: if they
-- could, upgrading to Pro+ would just be a console command away. Every
-- write happens through the Supabase Table Editor by you directly (see
-- the header comment above) until real billing exists - deliberately
-- NOT through any client-callable function, even a locked-down one,
-- since a self-serve "give myself Pro" endpoint is exactly the kind of
-- thing that's easy to forget about and dangerous to leave behind.
drop policy if exists "users can view their own plan" on public.user_plan;
create policy "users can view their own plan" on public.user_plan
  for select using (auth.uid() = user_id);

create index if not exists idx_user_plan_plan on public.user_plan(plan);
