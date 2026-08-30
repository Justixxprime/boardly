-- ===========================================================================
-- BOARDLY - schema v38 migration: Task Templates
--
-- Run this in Supabase SQL Editor. Adds one new table, `task_templates`.
-- Nothing existing is touched.
--
-- A template is a saved snapshot of one ticket's title, notes, checklist,
-- category, and platform - for work that comes back around (weekly
-- content batches, a recurring client onboarding checklist, a lesson you
-- teach every term). Using one always creates a brand new, independent
-- ticket - editing that new ticket never changes the template, and
-- editing the template never touches tickets already created from it.
-- ===========================================================================

create table if not exists public.task_templates (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  board_id     uuid references public.boards(id) on delete cascade,
  name         text not null,
  title        text not null,
  notes        text,
  category     text default 'general',
  platform     text,
  task_type    text,
  subtasks     jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);

alter table public.task_templates enable row level security;

drop policy if exists "Users can view their own task templates" on public.task_templates;
create policy "Users can view their own task templates"
  on public.task_templates for select
  using (user_id = auth.uid());

drop policy if exists "Users can create their own task templates" on public.task_templates;
create policy "Users can create their own task templates"
  on public.task_templates for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update their own task templates" on public.task_templates;
create policy "Users can update their own task templates"
  on public.task_templates for update
  using (user_id = auth.uid());

drop policy if exists "Users can delete their own task templates" on public.task_templates;
create policy "Users can delete their own task templates"
  on public.task_templates for delete
  using (user_id = auth.uid());

create index if not exists task_templates_user_created_idx on public.task_templates (user_id, created_at desc);
