-- ===========================================================================
-- BOARDLY 2.0: schema v80, marketplace applications: safe re-apply + tamper guard
-- Run once in the Supabase SQL Editor, AFTER schema_v78. Safe to re-run.
--
-- TWO PROBLEMS THIS FIXES
--
-- 1) Applicants could not re-apply. The frontend "upsert" (insert, or update the
--    row if you already applied) was blocked because schema_v75 only lets the
--    POSTER update an application. So a second "Send application" failed.
--
-- 2) A worse one found while fixing it: the INSERT policy only checked that
--    applicant_user_id was you. It did not check status. So an applicant could
--    insert their own application already marked 'accepted', and could also
--    write booking_id / booking_access_token onto it. The job poster would see
--    an application "accepted" that they never accepted.
--
-- THE FIX (three layers, same idea as schema_v77 and v78)
--   a) A new UPDATE policy: an applicant may edit their OWN application, but only
--      while it is still 'submitted'.
--   b) Column privileges: signed-in users may only write the four columns the
--      app really sends. Nobody signed in can write booking_id or
--      booking_access_token (only Edge Functions using the service role can).
--   c) A trigger that enforces the rules row by row:
--        * on INSERT: status is forced to 'submitted', booking fields are
--          cleared, you cannot apply to your own job, the job must be open.
--        * on UPDATE by the applicant: only message and proposed_price can
--          change, and only while the status is 'submitted'.
--        * on UPDATE by the poster: only status can change, only from
--          'submitted' to 'accepted' or 'declined', and 'accepted' needs a
--          price on the application (so the payment step has a real amount).
--      Server-side callers (Edge Functions, SQL editor) have no auth.uid() and
--      are trusted, so the payment flow can still write booking_id later.
--
-- NOTE ON opportunity_id / applicant_user_id: they stay updatable at the column
-- level ONLY so the existing frontend upsert keeps working without a redeploy
-- (an upsert lists every column it sends). The trigger rejects any real change
-- to them, so this is safe.
-- ===========================================================================

-- (b) column privileges ------------------------------------------------------
revoke insert, update on public.marketplace_applications from anon, authenticated;

grant insert (opportunity_id, applicant_user_id, message, proposed_price)
  on public.marketplace_applications to authenticated;

grant update (opportunity_id, applicant_user_id, message, proposed_price, status)
  on public.marketplace_applications to authenticated;

-- (a) applicants may edit their own pending application ---------------------
drop policy if exists "Applicants can edit their own pending application" on public.marketplace_applications;
create policy "Applicants can edit their own pending application"
  on public.marketplace_applications for update
  using (applicant_user_id = auth.uid() and status = 'submitted')
  with check (applicant_user_id = auth.uid());

-- (c) the row-by-row guard ---------------------------------------------------
create or replace function public.marketplace_applications_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poster uuid;
  v_job_status text;
begin
  -- Server-side callers (service role, SQL editor) have no signed-in user and
  -- are trusted. Browsers always have one.
  if auth.uid() is null then
    return new;
  end if;

  select o.user_id, o.status into v_poster, v_job_status
  from public.marketplace_opportunities o
  where o.id = new.opportunity_id;

  if tg_op = 'INSERT' then
    if v_poster is null then
      raise exception 'This job could not be found.';
    end if;
    if v_poster = auth.uid() then
      raise exception 'You cannot apply to your own job.';
    end if;
    if v_job_status <> 'open' then
      raise exception 'This job is closed, so it is no longer taking applications.';
    end if;
    if length(btrim(coalesce(new.message, ''))) = 0 then
      raise exception 'Write a short message with your application.';
    end if;
    if length(new.message) > 5000 then
      raise exception 'Your message is too long (5000 characters at most).';
    end if;
    if new.proposed_price is not null and new.proposed_price <= 0 then
      raise exception 'Your proposed price must be more than zero.';
    end if;
    new.status := 'submitted';
    new.booking_id := null;
    new.booking_access_token := null;
    return new;
  end if;

  -- UPDATE: fields nobody signed in may ever change
  if new.id is distinct from old.id
     or new.opportunity_id is distinct from old.opportunity_id
     or new.applicant_user_id is distinct from old.applicant_user_id
     or new.created_at is distinct from old.created_at
     or new.booking_id is distinct from old.booking_id
     or new.booking_access_token is distinct from old.booking_access_token then
    raise exception 'That part of an application cannot be changed.';
  end if;

  if auth.uid() = old.applicant_user_id then
    -- the applicant: message and price only, and only while still pending
    if new.status is distinct from old.status then
      raise exception 'Only the person who posted the job can accept or decline an application.';
    end if;
    if old.status <> 'submitted' then
      raise exception 'This application has already been answered, so it can no longer be edited.';
    end if;
    if length(btrim(coalesce(new.message, ''))) = 0 then
      raise exception 'Write a short message with your application.';
    end if;
    if length(new.message) > 5000 then
      raise exception 'Your message is too long (5000 characters at most).';
    end if;
    if new.proposed_price is not null and new.proposed_price <= 0 then
      raise exception 'Your proposed price must be more than zero.';
    end if;
    return new;
  elsif auth.uid() = v_poster then
    -- the poster: status only, one step, from submitted
    if new.message is distinct from old.message
       or new.proposed_price is distinct from old.proposed_price then
      raise exception 'Only the applicant can edit their message or price.';
    end if;
    if new.status is distinct from old.status then
      if old.status <> 'submitted' or new.status not in ('accepted', 'declined') then
        raise exception 'An application can only be accepted or declined once, while it is still submitted.';
      end if;
      if new.status = 'accepted' and (new.proposed_price is null or new.proposed_price <= 0) then
        raise exception 'This application has no price yet, so it cannot be accepted. Decline it or ask the applicant to add a price.';
      end if;
    end if;
    return new;
  end if;

  raise exception 'You are not allowed to change this application.';
end;
$$;

revoke all on function public.marketplace_applications_guard() from public, anon, authenticated;

drop trigger if exists trg_marketplace_applications_guard on public.marketplace_applications;
create trigger trg_marketplace_applications_guard
  before insert or update on public.marketplace_applications
  for each row execute function public.marketplace_applications_guard();

-- Check it worked (expect: can_write_token = false, can_write_status = true):
--   select has_column_privilege('authenticated', 'public.marketplace_applications', 'booking_access_token', 'update') as can_write_token,
--          has_column_privilege('authenticated', 'public.marketplace_applications', 'status', 'update') as can_write_status;
