-- ==========================================================================
-- BOARDLY - schema v30 migration: Marketplace v1
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
--
-- SCOPE, HONESTLY STATED: the master plan's "Skill Marketplace / Borrow
-- My Time / Local Professional Network / Reputation Graph" is a real,
-- separate product surface - discovery, matching, reputation, and
-- (eventually) payment. Boardly has no payment processing set up, and
-- building that needs a real provider decision first (Stripe,
-- Paystack, Flutterwave, etc. - a conversation of its own). v1 here is
-- the honest, buildable core underneath all of those ideas: a public
-- directory where you publish a profile describing what you do, and
-- anyone can find you and send an inquiry. No payment, no booking, no
-- reputation score yet - just genuine discoverability, which is the
-- foundation everything else would sit on top of.
--
-- WHY NO EDGE FUNCTION IS NEEDED HERE (unlike the Client Portal):
-- the Client Portal needed a server-side function because a
-- password-protected board's data had to stay hidden until a password
-- check passed - browser-only enforcement can't do that safely.
-- Marketplace profiles have no password concept - a profile is either
-- published (is_public = true, meant to be found by anyone) or it
-- isn't (only its owner can see it). That's a plain condition RLS can
-- enforce directly, so plain RLS policies are both simpler and the
-- more honest fit here - no service-role code standing in for a check
-- that could just as well happen at the database level.
-- ==========================================================================

create table if not exists marketplace_profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade unique,
  display_name  text not null,
  headline      text,               -- e.g. "Frontend developer & social media manager"
  bio           text,
  skills        text,               -- comma-separated, kept as free text for v1 rather than a separate tags table
  rate_range    text,               -- free text, e.g. "$20-40/hr" - never parsed or processed as real money
  portfolio_url text,
  location      text,
  availability  text not null default 'available' check (availability in ('available', 'busy', 'unavailable')),
  is_public     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table marketplace_profiles enable row level security;

drop policy if exists "Owners manage their own marketplace profile" on marketplace_profiles;
create policy "Owners manage their own marketplace profile"
  on marketplace_profiles for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- The one deliberately public policy in this migration - anyone,
-- signed in or not, can read a profile ONLY once its owner has
-- switched it to published. An unpublished profile stays invisible to
-- everyone except its owner (covered by the policy above).
drop policy if exists "Anyone can view published marketplace profiles" on marketplace_profiles;
create policy "Anyone can view published marketplace profiles"
  on marketplace_profiles for select
  using (is_public = true);

create table if not exists marketplace_inquiries (
  id               uuid primary key default gen_random_uuid(),
  profile_user_id  uuid not null references auth.users(id) on delete cascade,
  from_name        text not null,
  from_email       text not null,
  message          text not null,
  created_at       timestamptz not null default now()
);

alter table marketplace_inquiries enable row level security;

drop policy if exists "Profile owners read their own inquiries" on marketplace_inquiries;
create policy "Profile owners read their own inquiries"
  on marketplace_inquiries for select
  using (profile_user_id = auth.uid());

-- Same reasoning as the profiles' public read policy: anyone can send
-- an inquiry, but ONLY to a profile that's actually published - this
-- condition is checked by the database itself on every insert, so
-- there's no way to message a private/unpublished profile's owner by
-- guessing their user id.
drop policy if exists "Anyone can send an inquiry to a published profile" on marketplace_inquiries;
create policy "Anyone can send an inquiry to a published profile"
  on marketplace_inquiries for insert
  with check (
    profile_user_id in (select user_id from marketplace_profiles where is_public = true)
  );

create index if not exists marketplace_profiles_public_idx on marketplace_profiles(is_public) where is_public = true;
create index if not exists marketplace_inquiries_profile_idx on marketplace_inquiries(profile_user_id);
