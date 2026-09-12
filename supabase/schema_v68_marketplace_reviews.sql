-- ===========================================================================
-- BOARDLY 2.0: schema v68, Marketplace Reviews (Section 17)
-- Run this once in the Supabase SQL Editor, after schema_v33_marketplace_payments.sql.
-- Safe to re-run.
--
-- A review can only ever be tied to a real booking that actually
-- reached 'released' (the client themselves confirmed the work was
-- done and released payment), never a booking that's merely
-- paid_held, disputed, refunded, or cancelled. That's what keeps this
-- from being a fake-review system: nobody can leave a review for work
-- that never happened, or work the client never actually signed off on.
-- One review per booking, enforced with a unique constraint, not just
-- application logic.
-- ===========================================================================

create table if not exists public.marketplace_reviews (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null unique references public.marketplace_bookings(id) on delete cascade,
  profile_user_id uuid not null references auth.users(id) on delete cascade,
  rating          int not null check (rating between 1 and 5),
  comment         text,
  client_name     text,
  created_at      timestamptz not null default now()
);

alter table public.marketplace_reviews enable row level security;
create index if not exists idx_marketplace_reviews_profile_user_id on public.marketplace_reviews(profile_user_id);

-- Reviews are meant to be public trust signals, the same reasoning
-- schema_v30 already used for "anyone can view published marketplace
-- profiles." No public INSERT policy is defined, on purpose, same as
-- every money-adjacent table in this project: writing a review only
-- ever happens through marketplace-submit-review, which checks the
-- booking is really 'released' and that the caller really holds that
-- booking's own access_token before anything is written.
drop policy if exists "Anyone can view marketplace reviews" on public.marketplace_reviews;
create policy "Anyone can view marketplace reviews"
  on public.marketplace_reviews for select
  using (true);
