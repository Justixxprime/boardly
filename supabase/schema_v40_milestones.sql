-- ===========================================================================
-- BOARDLY - schema v40 migration: Milestones
--
-- Run this in Supabase SQL Editor. Adds one new table, `milestones`, and
-- one new column on the existing `tasks` table, `milestone_id`. Nothing
-- else about tasks is touched.
--
-- Progress on a milestone is never a guess or a manual percentage - it's
-- always computed live from however many linked tickets are actually
-- marked Done out of however many are linked, the same "explain the
-- number, don't just show a score" principle Board Health already
-- follows in this project.
-- ===========================================================================

create table if not exists public.milestones (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  board_id     uuid references public.boards(id) on delete cascade,
  name         text not null,
  target_date  date,
  completed_at timestamptz,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);

alter table public.milestones enable row level security;

drop policy if exists "Users can view their own milestones" on public.milestones;
create policy "Users can view their own milestones"
  on public.milestones for select
  using (user_id = auth.uid());

drop policy if exists "Users can create their own milestones" on public.milestones;
create policy "Users can create their own milestones"
  on public.milestones for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update their own milestones" on public.milestones;
create policy "Users can update their own milestones"
  on public.milestones for update
  using (user_id = auth.uid());

drop policy if exists "Users can delete their own milestones" on public.milestones;
create policy "Users can delete their own milestones"
  on public.milestones for delete
  using (user_id = auth.uid());

create index if not exists milestones_board_idx on public.milestones (board_id, position);

-- Linking a ticket to a milestone is optional (nullable) and never
-- required - a board with no milestones at all keeps working exactly
-- as it always has. Deleting a milestone unlinks its tickets rather
-- than touching them in any other way (on delete set null).
alter table public.tasks add column if not exists milestone_id uuid references public.milestones(id) on delete set null;
create index if not exists tasks_milestone_idx on public.tasks (milestone_id);
