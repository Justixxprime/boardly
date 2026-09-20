-- ===========================================================================
-- BOARDLY 2.0: schema v87, applicants can still open a job they applied to
-- Safe to re-run. Builds on schema_v75 and schema_v86.
--
-- schema_v75 only lets the public read OPEN jobs (plus the poster's own).
-- Since schema_v86, accepting an application closes the job, so the person who
-- was just accepted would lose the job page, and with it the banner that tells
-- them "accepted", "payment started" or "money held". This lets an applicant
-- read the job rows they applied to, open or closed, and nothing else.
--
-- The policy is "to authenticated" on purpose: without that, signed-out visitors
-- would also evaluate it, hit a function they may not run, and the public job
-- board would fail with "permission denied".
--
-- The check runs inside a SECURITY DEFINER function so the two tables'
-- policies do not call each other (that would be an infinite recursion error).
-- The public board list still filters status = 'open' in the page code, so
-- closed jobs never appear there.
-- ===========================================================================

create or replace function public.user_applied_to_job(p_job uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.marketplace_applications a
    where a.opportunity_id = p_job and a.applicant_user_id = auth.uid()
  );
$$;

revoke all on function public.user_applied_to_job(uuid) from public, anon;
grant execute on function public.user_applied_to_job(uuid) to authenticated;

drop policy if exists "Applicants can view jobs they applied to" on public.marketplace_opportunities;
create policy "Applicants can view jobs they applied to"
  on public.marketplace_opportunities for select
  to authenticated
  using (public.user_applied_to_job(id));
