-- ==========================================================================
-- BOARDLY - schema v2 migration
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Safe to run once on top of the original schema.sql - it only adds new
-- things, it does not touch or delete any existing tasks or accounts.
-- ==========================================================================

-- ---------------------------------------------------------------------
-- 1. BOARDS - multiple boards per account ("Work", "Personal", etc).
-- Every existing task gets migrated into one default "My board" below,
-- so nothing you already have disappears.
-- ---------------------------------------------------------------------
create table if not exists boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My board',
  is_public boolean not null default false,
  share_token text unique,
  created_at timestamptz not null default now()
);

alter table boards enable row level security;

create policy "Users manage their own boards"
  on boards for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Anyone can read a board that's been made public"
  on boards for select
  using (is_public = true);

-- ---------------------------------------------------------------------
-- 2. TASKS - new columns for board membership, subtasks, recurrence,
-- and a single file attachment.
-- ---------------------------------------------------------------------
alter table tasks add column if not exists board_id uuid references boards(id) on delete cascade;
alter table tasks add column if not exists subtasks jsonb not null default '[]'::jsonb;
alter table tasks add column if not exists recurrence text; -- null | 'daily' | 'weekdays' | 'weekly'
alter table tasks add column if not exists attachment_url text;
alter table tasks add column if not exists attachment_name text;

-- Let a public board's tasks be read by anyone too (needed for the
-- read-only /share.html view - see GUIDE.md's "Public share links" section).
create policy "Anyone can read tasks on a public board"
  on tasks for select
  using (board_id in (select id from boards where is_public = true));

-- ---------------------------------------------------------------------
-- 3. ONE-TIME DATA MIGRATION - give every existing account a default
-- board, and attach all of their existing tasks to it. Safe to run
-- even if you have zero tasks yet.
-- ---------------------------------------------------------------------
insert into boards (user_id, name)
select distinct user_id, 'My board' from tasks
where user_id not in (select user_id from boards)
on conflict do nothing;

update tasks
set board_id = (select id from boards where boards.user_id = tasks.user_id order by created_at asc limit 1)
where board_id is null;

-- ---------------------------------------------------------------------
-- 4. STORAGE - a bucket for task attachments (screenshots, PDFs, etc).
-- Supabase Storage buckets can't be created with plain SQL, so create
-- this one manually: Supabase dashboard -> Storage -> New bucket ->
-- name it exactly  task-attachments  -> toggle "Public bucket" ON ->
-- Create bucket. Full walkthrough in FEATURES_V2_SETUP.md.
-- ---------------------------------------------------------------------

-- ==========================================================================
-- Done. Reload dashboard.html after running this - it now expects
-- board_id, subtasks, recurrence, and attachment_* to exist on tasks.
-- ==========================================================================
