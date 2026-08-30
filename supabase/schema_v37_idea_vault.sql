-- ===========================================================================
-- BOARDLY - schema v37 migration: Idea Vault
--
-- Run this in Supabase SQL Editor. Adds one new table, `ideas`. Nothing
-- existing is touched.
--
-- Ideas are deliberately kept separate from tasks - jotting something
-- down here never creates a task automatically. It only becomes work
-- once you decide it's worth doing and turn it into a real task
-- yourself; until then it just sits here as a stage in its own
-- lifecycle: idea -> considering -> validated -> planned -> building ->
-- released -> archived.
-- ===========================================================================

create table if not exists public.ideas (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  board_id     uuid references public.boards(id) on delete cascade,
  title        text not null,
  description  text,
  stage        text not null default 'idea'
               check (stage in ('idea', 'considering', 'validated', 'planned', 'building', 'released', 'archived')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.ideas enable row level security;

drop policy if exists "Users can view their own ideas" on public.ideas;
create policy "Users can view their own ideas"
  on public.ideas for select
  using (user_id = auth.uid());

drop policy if exists "Users can create their own ideas" on public.ideas;
create policy "Users can create their own ideas"
  on public.ideas for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update their own ideas" on public.ideas;
create policy "Users can update their own ideas"
  on public.ideas for update
  using (user_id = auth.uid());

drop policy if exists "Users can delete their own ideas" on public.ideas;
create policy "Users can delete their own ideas"
  on public.ideas for delete
  using (user_id = auth.uid());

create index if not exists ideas_user_created_idx on public.ideas (user_id, created_at desc);

-- Keeps updated_at accurate whenever a stage (or anything else) changes,
-- same pattern used elsewhere in this project.
create or replace function public.set_ideas_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ideas_set_updated_at on public.ideas;
create trigger ideas_set_updated_at
before update on public.ideas
for each row execute function public.set_ideas_updated_at();
