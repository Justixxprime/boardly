-- ===========================================================================
-- BOARDLY 2.0: schema v86, one hire per job
-- Safe to re-run. Builds on schema_v75 and schema_v80.
--
-- Before this, a poster could accept several applications on the same job and
-- pay each one, and an accepted job stayed open for new applicants. Decision
-- (20 Sep 2026): a job hires ONE person.
--   * Accepting an application closes the job and marks every application that
--     was still waiting as declined, so applicants get an answer.
--   * A second accept on the same job is refused with a plain message.
--   * A job that has an accepted application cannot be reopened.
--   * A unique index makes "one accepted application per job" true even for
--     the service role.
-- A poster who wants two people posts two jobs.
-- ===========================================================================

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
      if new.status = 'accepted' then
        -- One person per job (schema_v86). The unique index below is the hard
        -- backstop, this gives a plain message first.
        if exists (
          select 1 from public.marketplace_applications a
          where a.opportunity_id = new.opportunity_id and a.status = 'accepted' and a.id <> new.id
        ) then
          raise exception 'You have already accepted someone for this job. A job can only have one person hired.';
        end if;
        -- Accepting closes the job and answers everyone still waiting, so nobody
        -- is left on "waiting for a reply" for a job that is now filled.
        update public.marketplace_opportunities
           set status = 'closed', updated_at = now()
         where id = new.opportunity_id and status = 'open';
        update public.marketplace_applications
           set status = 'declined'
         where opportunity_id = new.opportunity_id and id <> new.id and status = 'submitted';
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

-- Hard backstop: at most one accepted application per job.
create unique index if not exists uniq_marketplace_applications_one_accepted
  on public.marketplace_applications (opportunity_id)
  where status = 'accepted';

-- A job with someone hired cannot be reopened by its poster.
create or replace function public.marketplace_opportunities_reopen_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and new.status = 'open' and old.status is distinct from 'open'
     and exists (
       select 1 from public.marketplace_applications a
       where a.opportunity_id = new.id and a.status = 'accepted'
     ) then
    raise exception 'You have already hired someone for this job, so it cannot be reopened. Post a new job to hire another person.';
  end if;
  return new;
end;
$$;

revoke all on function public.marketplace_opportunities_reopen_guard() from public, anon, authenticated;

drop trigger if exists trg_marketplace_opportunities_reopen_guard on public.marketplace_opportunities;
create trigger trg_marketplace_opportunities_reopen_guard
  before update on public.marketplace_opportunities
  for each row execute function public.marketplace_opportunities_reopen_guard();
