-- ===========================================================================
-- BOARDLY 2.0: schema v78, applicants can no longer read booking_access_token
-- Run once in the Supabase SQL Editor, AFTER schema_v77. Safe to re-run.
--
-- THE PROBLEM: schema_v76 stores the client's booking access token on the
-- application row (marketplace_applications.booking_access_token). The SELECT
-- policy lets the applicant read their own application, so the applicant (the
-- freelancer who would be paid) could read the CLIENT's key and use
-- marketplace-release-payment to release held money to themselves. Same hole
-- as schema_v77, second door. Confirmed on the live database before this fix:
-- an applicant could read the column.
--
-- THE FIX: column-level privileges, so signed-in users can read every
-- application column except booking_access_token. The person who is
-- supposed to have it, the poster (the paying client), gets it through a
-- small function that checks they own the opportunity.
--
-- ORDER MATTERS: deploy the updated js/marketplace-public.js FIRST (it now
-- lists columns instead of select *, which would fail once this runs).
--
-- Note: the token column type is uuid, not text.
-- ===========================================================================

revoke select on public.marketplace_applications from anon, authenticated;

grant select (id, opportunity_id, applicant_user_id, message, proposed_price, status, created_at, booking_id)
  on public.marketplace_applications to authenticated;

create or replace function public.get_application_booking_link(p_application_id uuid)
returns table (booking_id uuid, booking_access_token uuid)
language sql
security definer
set search_path = public
as $$
  select a.booking_id, a.booking_access_token
  from public.marketplace_applications a
  join public.marketplace_opportunities o on o.id = a.opportunity_id
  where a.id = p_application_id
    and o.user_id = auth.uid()
$$;

revoke all on function public.get_application_booking_link(uuid) from public, anon;
grant execute on function public.get_application_booking_link(uuid) to authenticated;

-- Poster reads their own link like this (from the frontend):
--   const { data } = await supabaseClient.rpc("get_application_booking_link", { p_application_id: appId });
--
-- Check it worked (expect false, true):
--   select has_column_privilege('authenticated', 'public.marketplace_applications', 'booking_access_token', 'select') as can_read_token,
--          has_column_privilege('authenticated', 'public.marketplace_applications', 'status', 'select') as can_read_status;
