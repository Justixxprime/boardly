-- ===========================================================================
-- BOARDLY 2.0: schema v77, providers can no longer read a booking's access_token
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- THE PROBLEM: marketplace_bookings.access_token is the CLIENT's key. Anyone
-- holding it can confirm the work as done and make marketplace-release-payment
-- send the held money to the provider (it checks the id and token and nothing
-- else). schema_v33 lets a provider read their own bookings with a plain
-- select, which includes access_token. So a provider could read the token off
-- their own booking and release the payment to themselves without the client
-- ever approving.
--
-- THE FIX: column-level privileges. Signed-in users can still read every
-- booking column the Bookings tab and Home actually use, but access_token is
-- no longer one of them. Edge Functions use the service role, which is not
-- affected, so booking-status, release, dispute and review all keep working.
--
-- ORDER MATTERS: deploy the updated js/marketplace.js FIRST (it now lists
-- columns explicitly instead of select *). A select * would fail with
-- "permission denied for column access_token" once this file has run.
--
-- To undo: grant select on public.marketplace_bookings to authenticated;
-- (only do that if you accept that providers can read the token again).
-- ===========================================================================

revoke select on public.marketplace_bookings from anon, authenticated;

grant select (
  id, profile_user_id, client_name, client_email, description, amount, currency,
  status, paystack_reference, paid_at, released_at, created_at,
  dispute_status, dispute_reason, disputed_by, disputed_at, dispute_resolution, resolved_at
) on public.marketplace_bookings to authenticated;

-- Check it worked (both should say false for access_token, true for status):
--   select has_column_privilege('authenticated', 'public.marketplace_bookings', 'access_token', 'select') as can_read_token,
--          has_column_privilege('authenticated', 'public.marketplace_bookings', 'status', 'select')       as can_read_status;
