-- ===========================================================================
-- BOARDLY - schema v48 migration: Activity / Event Log
--
-- Run this in Supabase SQL Editor. Adds one new table, `activity_events`.
-- Nothing existing is touched.
--
-- This is the foundation piece described in the "seven features" doc:
-- "Every important action creates an event... this becomes the raw
-- material for intelligence." Silent Sentinel and Reality Mode compute
-- their signals live from current task state and don't need history -
-- but Autopilot (what changed, to trigger a rule), Opportunity Radar
-- (patterns over time), and a real audit trail all need an actual
-- timeline of what happened, not just what's true right now. This table
-- is that timeline, built once so all three can be built on top of it
-- later instead of each inventing their own.
-- ===========================================================================

create table if not exists public.activity_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  board_id    uuid references public.boards(id) on delete cascade,
  task_id     uuid references public.tasks(id) on delete set null,
  event_type  text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

alter table public.activity_events enable row level security;

drop policy if exists "Users can view their own activity" on public.activity_events;
create policy "Users can view their own activity"
  on public.activity_events for select
  using (user_id = auth.uid());

drop policy if exists "Users can log their own activity" on public.activity_events;
create policy "Users can log their own activity"
  on public.activity_events for insert
  with check (user_id = auth.uid());

-- No update/delete policy on purpose - same reasoning as security_events
-- (schema_v35): a timeline that can be quietly edited after the fact
-- isn't a real timeline.

create index if not exists activity_events_board_created_idx on public.activity_events (board_id, created_at desc);
create index if not exists activity_events_user_created_idx on public.activity_events (user_id, created_at desc);

-- Keeps this table from growing forever automatically, same pattern as
-- schema_v35_security_center.sql - anything older than 180 days is
-- pruned the next time a row is inserted for that user. Six months is
-- deliberately longer than security_events' 90 days: Opportunity Radar
-- (built later, on top of this table) needs enough history to actually
-- notice a pattern, not just last week.
create or replace function public.prune_old_activity_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.activity_events
  where user_id = new.user_id
    and created_at < now() - interval '180 days';
  return new;
end;
$$;

drop trigger if exists activity_events_prune on public.activity_events;
create trigger activity_events_prune
after insert on public.activity_events
for each row execute function public.prune_old_activity_events();
