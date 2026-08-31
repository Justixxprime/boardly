-- ===========================================================================
-- BOARDLY - schema v42 migration: Playbooks
--
-- Run this in Supabase SQL Editor. Adds one new table, `playbooks`.
-- Nothing existing is touched.
--
-- A playbook is a written-down procedure - "How we onboard a new
-- logistics client," "Publishing a social media post," a lesson plan
-- you teach every term. Different from a Task Template (which creates a
-- new ticket) and different from an Idea (which isn't committed to yet)
-- - a playbook is just knowledge: the steps, written once, referenced
-- as many times as you need them.
-- ===========================================================================

create table if not exists public.playbooks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  board_id     uuid references public.boards(id) on delete cascade,
  title        text not null,
  content      text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.playbooks enable row level security;

drop policy if exists "Users can view their own playbooks" on public.playbooks;
create policy "Users can view their own playbooks"
  on public.playbooks for select
  using (user_id = auth.uid());

drop policy if exists "Users can create their own playbooks" on public.playbooks;
create policy "Users can create their own playbooks"
  on public.playbooks for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update their own playbooks" on public.playbooks;
create policy "Users can update their own playbooks"
  on public.playbooks for update
  using (user_id = auth.uid());

drop policy if exists "Users can delete their own playbooks" on public.playbooks;
create policy "Users can delete their own playbooks"
  on public.playbooks for delete
  using (user_id = auth.uid());

create index if not exists playbooks_user_created_idx on public.playbooks (user_id, created_at desc);

create or replace function public.set_playbooks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists playbooks_set_updated_at on public.playbooks;
create trigger playbooks_set_updated_at
before update on public.playbooks
for each row execute function public.set_playbooks_updated_at();
