-- ===========================================================================
-- BOARDLY 2.0: schema v67, Marketplace Dispute Center (Section 20)
-- Run this once in the Supabase SQL Editor, after schema_v33_marketplace_payments.sql.
-- Safe to re-run. One column set added to the existing marketplace_bookings
-- table, nothing removed.
--
-- schema_v33's own comment already states the real limitation plainly:
-- "if a client vanishes after paying, the money stays parked until
-- someone (Charles, from the Supabase dashboard) sorts it out by hand."
-- This does not remove that limitation (a real dispute can still end in
-- Charles manually issuing a refund or nudging a release through
-- Paystack's own dashboard), it gives both sides a structured way to
-- flag that something needs attention and see the same facts, rather
-- than the only path being an email nobody official-looking answers.
--
-- Per Section 20: "Show both parties... timestamps, payment records...
-- create a factual timeline. No invented evidence." No new events table
-- is added for this, because the existing timestamp columns already ARE
-- that factual timeline (created_at, paid_at, disputed_at, resolved_at,
-- released_at) alongside the booking's own description and amount.
-- Building a parallel "events log" table would just be restating those
-- same columns a second time.
-- ===========================================================================

alter table public.marketplace_bookings
  add column if not exists dispute_status text not null default 'none'
    check (dispute_status in ('none', 'opened', 'resolved')),
  add column if not exists dispute_reason text,
  add column if not exists disputed_by text check (disputed_by in ('client', 'provider')),
  add column if not exists disputed_at timestamptz,
  add column if not exists dispute_resolution text,
  add column if not exists resolved_at timestamptz;

create index if not exists idx_marketplace_bookings_dispute_status on public.marketplace_bookings(dispute_status) where dispute_status != 'none';
