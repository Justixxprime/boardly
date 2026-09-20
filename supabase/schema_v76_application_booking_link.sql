-- ===========================================================================
-- BOARDLY 2.0: schema v76, link an accepted application to an escrow booking
-- This file was missing from GitHub. It was applied live on 17 Sep 2026 under
-- the name schema_v76_application_booking_link, and is copied here from the
-- live migration history so the repo matches the database. Safe to re-run.
--
-- Adds two columns to marketplace_applications: the booking made for it, and
-- the paying client's access token for that booking. schema_v78 later hid the
-- token column from signed-in users, and schema_v80 stopped browsers writing
-- either column. Only the marketplace-pay-application Edge Function sets them.
-- ===========================================================================

alter table public.marketplace_applications
  add column if not exists booking_id uuid references public.marketplace_bookings(id) on delete set null,
  add column if not exists booking_access_token uuid;
