-- ==========================================================================
-- BOARDLY — database schema
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run
-- ==========================================================================

-- 1. The tasks table -----------------------------------------------------
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  category    text not null default 'general',   -- 'general' | 'work' | 'personal' | 'urgent'
  status      text not null default 'todo',       -- 'todo' | 'inprogress' | 'done'
  due_date    date,
  position    int not null default 0,             -- order within a column
  created_at  timestamptz not null default now()
);

-- 2. Turn on Row Level Security ------------------------------------------
-- Without this, ANY logged-in user could read/write EVERY row in the table.
-- RLS makes Postgres check a rule on every single query.
alter table public.tasks enable row level security;

-- 3. The rule: a user may only touch rows where user_id = their own id ---
create policy "Users can view their own tasks"
  on public.tasks for select
  using (auth.uid() = user_id);

create policy "Users can insert their own tasks"
  on public.tasks for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own tasks"
  on public.tasks for update
  using (auth.uid() = user_id);

create policy "Users can delete their own tasks"
  on public.tasks for delete
  using (auth.uid() = user_id);

-- 4. Helpful index for sorting a column quickly ---------------------------
create index if not exists tasks_user_status_position_idx
  on public.tasks (user_id, status, position);
