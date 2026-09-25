-- ============================================================================
-- BOARDLY - schema_v98_marketplace_deliverables.sql
-- --------------------------------------------------------------------------
-- Section 94 open item: a formal "submit deliverable" action tied to a
-- booking. Before this, a provider had no way inside Boardly to hand over
-- proof of finished work, they just told the client out of band (WhatsApp,
-- email) and the client released payment on trust alone.
--
-- WHAT THIS DOES: lets a provider attach a note and, optionally, a link
-- (Google Drive, GitHub, a live URL, whatever) to a booking once it's
-- paid_held. The client sees it on booking-status.html, right above the
-- "release payment" button, so the release decision is based on something
-- real rather than a message sent somewhere else Boardly can't see.
--
-- This does NOT gate release. A client can still release without a
-- deliverable ever being submitted, and submitting one does not move any
-- money by itself. It is proof, not a workflow lock, same honesty as the
-- Dispute Center's own "resolving a dispute does NOT move money" rule.
--
-- Multiple rows per booking are allowed on purpose (a provider can submit
-- again after a revision request), the client always sees the most recent
-- one first but earlier ones stay visible underneath as history.
--
-- Named v98, not v93 or v97, because those two numbers are already taken
-- by schema_v93_mfa_enforcement.sql and schema_v97_server_side_auth_...
-- (checked with `ls supabase/*.sql | sort -V` first, per the project's own
-- standing rule).
-- ============================================================================

create table if not exists marketplace_deliverables (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references marketplace_bookings(id) on delete cascade,
  note         text not null,
  link_url     text,
  submitted_at timestamptz not null default now()
);

create index if not exists marketplace_deliverables_booking_idx
  on marketplace_deliverables (booking_id, submitted_at desc);

alter table marketplace_deliverables enable row level security;

-- The provider is a real signed-in Boardly user (the client paying has no
-- account at all, same as every other table in this feature). A provider
-- can insert and read deliverables only for bookings that are actually
-- theirs, matching the exact pattern schema_v33 already uses for
-- "Providers can read their own bookings" on marketplace_bookings itself.
drop policy if exists "Providers can add deliverables to their own bookings" on marketplace_deliverables;
create policy "Providers can add deliverables to their own bookings"
  on marketplace_deliverables for insert
  with check (
    exists (
      select 1 from marketplace_bookings
      where id = booking_id and profile_user_id = auth.uid()
    )
  );

drop policy if exists "Providers can read deliverables on their own bookings" on marketplace_deliverables;
create policy "Providers can read deliverables on their own bookings"
  on marketplace_deliverables for select
  using (
    exists (
      select 1 from marketplace_bookings
      where id = booking_id and profile_user_id = auth.uid()
    )
  );

-- No update or delete policy, on purpose. A submitted deliverable is a
-- record of what was handed over and when, same reasoning as the audit
-- tables elsewhere in this project (security_events, activity_events): if
-- a provider needs to correct something, they submit a new one, they don't
-- edit history.

-- No policy at all for the paying client, same as marketplace_bookings
-- itself. The client has no Boardly login, so their view goes through the
-- marketplace-booking-status Edge Function (using the service role key),
-- which now also returns the deliverables for a booking once the token
-- check passes. See that function's own updated header comment.

-- ============================================================================
-- After running this file:
--   1. Redeploy marketplace-booking-status (updated to also return
--      deliverables): supabase functions deploy marketplace-booking-status --no-verify-jwt
--   2. No new secret, no new provider account, nothing else to configure.
--   3. Copy in the updated js/marketplace.js, js/booking-status.js and
--      booking-status.html.
-- Full walkthrough in docs/setup-guides/MARKETPLACE_DELIVERABLES_SETUP.md.
-- ============================================================================
