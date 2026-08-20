-- ==========================================================================
-- BOARDLY - schema v17 migration: real collaboration
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Safe to run once on top of everything through schema_v16 - it only adds
-- new things, it does not touch or delete any existing tasks, boards, or
-- accounts.
--
-- WHY THIS MIGRATION EXISTS:
-- Every board and task RLS policy up to this point checks
--   auth.uid() = user_id
-- which means, today, a board can only ever be read or written by the
-- single account that owns it. The existing realtime sync
-- (initRealtimeSync in dashboard.js) and live cursors already work great
-- across that one account's own tabs and devices, but there is no way
-- for a second real person to be let onto a board at all. This migration
-- adds that, without changing what "owner" means or touching a single
-- existing row.
-- ==========================================================================

-- ---------------------------------------------------------------------
-- 1. BOARD_MEMBERS - who besides the owner can see/edit a board.
-- ---------------------------------------------------------------------
create table if not exists board_members (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references boards(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete cascade, -- null until the invite is accepted
  invited_email text not null,
  role          text not null default 'editor',   -- 'editor' | 'viewer'
  invited_by    uuid not null references auth.users(id) on delete cascade,
  invited_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  unique (board_id, invited_email)
);

alter table board_members enable row level security;

-- The board owner can see and manage everyone invited to their board.
create policy "Owners manage members of their own boards"
  on board_members for all
  using (board_id in (select id from boards where user_id = auth.uid()))
  with check (board_id in (select id from boards where user_id = auth.uid()));

-- A member can see their own membership rows (so the app can show them
-- which boards they've been invited into).
create policy "Members can see their own membership rows"
  on board_members for select
  using (user_id = auth.uid() or invited_email = auth.jwt() ->> 'email');

-- ---------------------------------------------------------------------
-- 2. BOARDS - let members in, not just the owner.
-- The existing "Users manage their own boards" and "Anyone can read a
-- public board" policies from schema_v2.sql are untouched. This adds a
-- third path in, for accepted members only.
-- ---------------------------------------------------------------------
create policy "Members can read boards they've been added to"
  on boards for select
  using (
    id in (
      select board_id from board_members
      where user_id = auth.uid() and accepted_at is not null
    )
  );

-- ---------------------------------------------------------------------
-- 3. TASKS - editors can read/write, viewers can only read.
-- The existing owner policies from schema.sql and the public-board read
-- policy from schema_v2.sql are untouched.
-- ---------------------------------------------------------------------
create policy "Board members can read tasks on boards they've joined"
  on tasks for select
  using (
    board_id in (
      select board_id from board_members
      where user_id = auth.uid() and accepted_at is not null
    )
  );

create policy "Editor members can insert tasks on boards they've joined"
  on tasks for insert
  with check (
    board_id in (
      select board_id from board_members
      where user_id = auth.uid() and accepted_at is not null and role = 'editor'
    )
  );

create policy "Editor members can update tasks on boards they've joined"
  on tasks for update
  using (
    board_id in (
      select board_id from board_members
      where user_id = auth.uid() and accepted_at is not null and role = 'editor'
    )
  );

-- Deletion is intentionally left to the owner only (no delete policy for
-- members here) - editors can create and edit, only the owner can remove
-- a task outright. Loosen this later if that turns out to be too strict.

-- ---------------------------------------------------------------------
-- 4. TASK_COMMENTS - discussion on a task, with @mentions.
-- ---------------------------------------------------------------------
create table if not exists task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  board_id    uuid not null references boards(id) on delete cascade, -- denormalized for a simple RLS check
  user_id     uuid not null references auth.users(id) on delete cascade,
  body        text not null,
  mentions    text[] not null default '{}',  -- email addresses mentioned, resolved client-side from board_members
  created_at  timestamptz not null default now()
);

alter table task_comments enable row level security;

create index if not exists task_comments_task_idx on task_comments (task_id, created_at);

create policy "Anyone with board access can read comments"
  on task_comments for select
  using (
    board_id in (select id from boards where user_id = auth.uid())
    or board_id in (
      select board_id from board_members
      where user_id = auth.uid() and accepted_at is not null
    )
  );

create policy "Owners and editor members can post comments"
  on task_comments for insert
  with check (
    user_id = auth.uid()
    and (
      board_id in (select id from boards where user_id = auth.uid())
      or board_id in (
        select board_id from board_members
        where user_id = auth.uid() and accepted_at is not null and role = 'editor'
      )
    )
  );

create policy "A user can delete their own comment"
  on task_comments for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 5. Auto-attach pending invites when the invited person signs up.
-- invite-member/index.ts sets user_id straight away if the invited
-- email already has an account; if it doesn't yet, this trigger closes
-- the loop the moment they create one.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user_board_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update board_members
  set user_id = new.id, accepted_at = now()
  where invited_email = new.email and user_id is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_attach_invites on auth.users;
create trigger on_auth_user_created_attach_invites
  after insert on auth.users
  for each row execute function public.handle_new_user_board_invites();

-- ---------------------------------------------------------------------
-- 6. Realtime - task_comments needs to be added to the same publication
-- boards/tasks already use, so initRealtimeSync's postgres_changes
-- subscription can pick up new comments live. Boardly's existing tables
-- were added to supabase_realtime when the project was set up; this
-- line is safe to re-run even if it's already included.
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table task_comments;
alter publication supabase_realtime add table board_members;
