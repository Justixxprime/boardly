-- ==========================================================================
-- BOARDLY - schema v33 migration: Marketplace payments, booking & escrow
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Safe to run once - one new column on marketplace_profiles, two brand
-- new tables. Nothing existing is touched or removed.
--
-- PROVIDER CHOSEN: Paystack. Reasoning, stated plainly: Boardly's own
-- continuation notes always flagged this as "needs Charles to pick a
-- provider - Stripe, Paystack, or Flutterwave - a conversation of its
-- own." Picking on Charles's behalf: Paystack is the one built for
-- exactly this situation - a Lagos-based operator, Nigerian bank
-- accounts on the payout side, naira transactions, and a genuinely
-- simple REST API with no PCI burden on Boardly at all (the actual
-- card entry happens on Paystack's own hosted checkout page, never
-- inside Boardly).
--
-- WHAT "ESCROW" MEANS HERE, HONESTLY: a client pays the FULL amount
-- into Charles's own Paystack balance (not split at checkout time).
-- The money sits there - not touchable by the provider - until the
-- client themselves confirms the work is done, at which point Boardly
-- calls Paystack's Transfer API to send the provider their cut. That
-- is real escrow (the client controls release, not the provider), not
-- marketing language for "we take a payment." What v1 does NOT cover:
-- automatic release after a timeout, and disputes/refunds - if a
-- client vanishes after paying, the money stays parked until someone
-- (Charles, from the Supabase dashboard) sorts it out by hand. Real
-- limitation, stated plainly rather than glossed over.
-- ==========================================================================

-- ---------------------------------------------------------------------
-- 1. One new column on the existing marketplace_profiles table - a
-- PUBLIC-safe flag saying "this provider has finished payout setup and
-- can accept a paid booking." It's the only thing about payout status
-- the public directory is ever allowed to see - the actual bank details
-- live in a separate, owner-only table below and are never exposed
-- through this flag.
-- ---------------------------------------------------------------------
alter table public.marketplace_profiles
  add column if not exists accepts_bookings boolean not null default false;

-- ---------------------------------------------------------------------
-- 2. MARKETPLACE_PROVIDER_PAYOUTS - one row per provider, their payout
-- destination. Written only through the marketplace-setup-payout Edge
-- Function (it's the only place that holds the Paystack secret key
-- needed to verify the account number and create the transfer
-- recipient) - but RLS below is scoped to the owner regardless, so even
-- if this table were ever queried directly, nobody else could read or
-- write another provider's bank details.
-- ---------------------------------------------------------------------
create table if not exists marketplace_provider_payouts (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade unique,
  bank_code                text not null,
  account_number           text not null,
  account_name             text not null,       -- resolved FROM Paystack, never typed by the provider - confirms they entered their own real account
  paystack_recipient_code  text not null,        -- Paystack's own id for this payout destination, used at release time
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table marketplace_provider_payouts enable row level security;

drop policy if exists "Owners manage their own payout details" on marketplace_provider_payouts;
create policy "Owners manage their own payout details"
  on marketplace_provider_payouts for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 3. MARKETPLACE_BOOKINGS - the actual escrow ledger. access_token is
-- how the paying client (who has no Boardly account and no login at
-- all) proves, later, that they're the one who paid - it's handed to
-- them once, inside their own Paystack checkout's callback URL, and
-- every status check or release call has to present it. No public RLS
-- policy is defined for this table AT ALL - every public-facing read or
-- write goes through an Edge Function (marketplace-create-booking,
-- marketplace-booking-status, marketplace-release-payment), each of
-- which checks the token itself using the service role key, because an
-- RLS policy has no way to compare "the token in this request" against
-- "the token on this row" - that comparison has to happen in code.
-- ---------------------------------------------------------------------
create table if not exists marketplace_bookings (
  id                 uuid primary key default gen_random_uuid(),
  profile_user_id    uuid not null references auth.users(id) on delete cascade,  -- the provider
  client_name        text not null,
  client_email       text not null,
  description        text not null,
  amount             numeric not null check (amount > 0),
  currency           text not null default 'NGN',
  status             text not null default 'pending_payment'
                       check (status in ('pending_payment', 'paid_held', 'released', 'refunded', 'cancelled')),
  paystack_reference text,
  access_token       uuid not null default gen_random_uuid(),
  paid_at            timestamptz,
  released_at        timestamptz,
  created_at         timestamptz not null default now()
);

alter table marketplace_bookings enable row level security;

-- The one and only client-facing policy: a provider can read their own
-- bookings straight from the Boardly dashboard (the Bookings tab), same
-- as everything else in this project a signed-in owner can just query
-- directly. Nothing else touches this table without going through an
-- Edge Function.
drop policy if exists "Providers can read their own bookings" on marketplace_bookings;
create policy "Providers can read their own bookings"
  on marketplace_bookings for select
  using (profile_user_id = auth.uid());

create index if not exists marketplace_bookings_provider_idx on marketplace_bookings (profile_user_id, created_at desc);

-- ==========================================================================
-- Done. Now:
--   1. Get a Paystack account (free) and set two secrets:
--        supabase secrets set PAYSTACK_SECRET_KEY=sk_live_or_test_...
--   2. Deploy the five new Edge Functions (see
--      MARKETPLACE_PAYMENTS_SETUP.md for the exact commands - one of
--      them needs a webhook URL pasted into your Paystack dashboard).
--   3. Copy in the updated dashboard.html, marketplace.html, and their
--      JS files, plus the brand new booking-status.html.
-- Full walkthrough, start to finish, in MARKETPLACE_PAYMENTS_SETUP.md.
-- ==========================================================================
