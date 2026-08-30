-- ===========================================================================
-- BOARDLY - schema v39 migration: Timesheets (time entries ledger)
--
-- Run this in Supabase SQL Editor. Adds one new table, `time_entries`.
-- Nothing existing is touched, and nothing about the existing per-ticket
-- Start/Stop timer changes - tasks.time_tracked_seconds keeps working
-- exactly as it always has (the little clock badge on a ticket, the
-- running total shown in the edit screen).
--
-- What this adds on top: every time you stop that timer, ONE row also
-- gets written here recording exactly when that specific work session
-- happened - which is what lets Timesheets show hours broken out by day
-- of the week, not just one lifetime total per ticket. You can also log
-- time by hand here for work that was never tracked live (a phone call,
-- something done before this feature existed).
-- ===========================================================================

create table if not exists public.time_entries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  task_id           uuid references public.tasks(id) on delete set null,
  board_id          uuid references public.boards(id) on delete set null,
  started_at        timestamptz not null,
  duration_seconds  integer not null check (duration_seconds > 0),
  note              text,
  source            text not null default 'timer' check (source in ('timer', 'manual')),
  created_at        timestamptz not null default now()
);

alter table public.time_entries enable row level security;

drop policy if exists "Users can view their own time entries" on public.time_entries;
create policy "Users can view their own time entries"
  on public.time_entries for select
  using (user_id = auth.uid());

drop policy if exists "Users can create their own time entries" on public.time_entries;
create policy "Users can create their own time entries"
  on public.time_entries for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update their own time entries" on public.time_entries;
create policy "Users can update their own time entries"
  on public.time_entries for update
  using (user_id = auth.uid());

drop policy if exists "Users can delete their own time entries" on public.time_entries;
create policy "Users can delete their own time entries"
  on public.time_entries for delete
  using (user_id = auth.uid());

create index if not exists time_entries_user_started_idx on public.time_entries (user_id, started_at desc);
create index if not exists time_entries_task_idx on public.time_entries (task_id);
