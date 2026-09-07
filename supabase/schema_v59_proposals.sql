-- ===========================================================================
-- BOARDLY - schema v59: Proposals / Quotes
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Phase 6 of the master build spec: Client/Business. Client Portal and
-- Marketplace already substantially cover ongoing client work and
-- paid bookings - what's genuinely still missing is the step BEFORE
-- any of that: sending a prospective client a proposal with line
-- items and a total, and getting a clean yes/no back. This is
-- deliberately NOT an invoice and does not process any payment - same
-- boundary Client Work's own notes already draw ("deliberately NOT an
-- invoice or a payment record - Boardly doesn't [process payments]").
-- Marketplace already has real payment handling (Paystack escrow) for
-- when a booking is actually paid for; this is purely a documentation
-- and yes/no-response tool for the quoting conversation before that.
-- ===========================================================================

create table if not exists public.proposals (
  id             uuid primary key default gen_random_uuid(),
  board_id       uuid not null references public.boards(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  client_name    text,
  client_email   text,
  title          text not null,
  intro_text     text,
  -- Array of { id, description, quantity, unit_price }. The grand
  -- total is always computed from this array (client-side for display,
  -- and again server-side before anything is shown to the client) -
  -- never stored as its own column, so it can never drift out of sync
  -- with the line items themselves.
  line_items     jsonb not null default '[]'::jsonb,
  currency       text not null default 'NGN',
  status         text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined')),
  public_token   uuid unique not null default gen_random_uuid(),
  responded_at   timestamptz,
  created_at     timestamptz not null default now()
);

alter table public.proposals enable row level security;

create index if not exists idx_proposals_board_id on public.proposals(board_id);

-- Owner-only, same precedent as automation_rules and custom_forms - a
-- proposal is a sales document going out under the owner's name, not
-- something an invited board editor should be able to send on their
-- behalf without that being a deliberate, separate decision later.
drop policy if exists "Users manage their own proposals" on public.proposals;
create policy "Users manage their own proposals"
  on public.proposals for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No public policy here either, same reasoning written into every
-- other public-link table in this project (idea_votes, request_portal,
-- custom_form_submissions): a prospective client has no Boardly login
-- to write a safe RLS policy around. get-proposal-info and
-- respond-to-proposal (both service-role Edge Functions) are the only
-- way the public proposal page can read or respond to one.
