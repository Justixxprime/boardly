-- ===========================================================================
-- BOARDLY 2.0: schema v81, remember the Paystack checkout link on a booking
-- Run once in the Supabase SQL Editor, AFTER schema_v80. Safe to re-run.
--
-- WHY: the new marketplace-pay-application Edge Function lets the person who
-- posted a job pay right after accepting an application. If they close the
-- Paystack tab by accident, the function should hand back the SAME payment
-- page instead of making a second booking. That needs the link stored.
--
-- PRIVACY: schema_v77 revoked table-wide SELECT on marketplace_bookings and
-- granted only a list of columns. This new column is not on that list, so
-- signed-in users cannot read it (only Edge Functions, using the service role,
-- can). Nothing to grant.
-- ===========================================================================

alter table public.marketplace_bookings
  add column if not exists checkout_url text;

-- Check it worked (expect false):
--   select has_column_privilege('authenticated', 'public.marketplace_bookings', 'checkout_url', 'select');
