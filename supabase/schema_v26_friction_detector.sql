-- ==========================================================================
-- BOARDLY - schema v26 migration: Friction Detector
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Adds two columns and one trigger. Nothing existing is touched.
--
-- WHY THIS IS BUILT AS TWO SIMPLE COUNTERS, NOT A FULL HISTORY LOG:
-- A complete audit trail of every single change to every task would
-- work too, but it's a much heavier thing to build and store for a
-- question that really only needs a count: "how many times has this
-- been pushed back," and "how many times has this been reopened after
-- being marked done." Those two numbers are what Friction Detector
-- actually needs, so that's what this adds - in keeping with Boardly's
-- own rule about not introducing more infrastructure than a feature
-- actually requires.
-- ==========================================================================

alter table tasks add column if not exists postponement_count integer not null default 0;
alter table tasks add column if not exists reopen_count integer not null default 0;

create or replace function public.track_task_friction()
returns trigger
language plpgsql
as $$
begin
  -- Postponed: due_date moved to a LATER date than it was before (not
  -- just any edit - moving a date EARLIER, or setting one for the
  -- first time, isn't a postponement).
  if old.due_date is not null and new.due_date is not null and new.due_date > old.due_date then
    new.postponement_count = old.postponement_count + 1;
  end if;

  -- Reopened: was done, isn't anymore.
  if old.status = 'done' and new.status is distinct from 'done' then
    new.reopen_count = old.reopen_count + 1;
  end if;

  return new;
end;
$$;

drop trigger if exists on_task_updated_track_friction on tasks;
create trigger on_task_updated_track_friction
  before update on tasks
  for each row execute function public.track_task_friction();
