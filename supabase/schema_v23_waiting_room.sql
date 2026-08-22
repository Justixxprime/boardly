-- ==========================================================================
-- BOARDLY - schema v23 migration: Waiting Room
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Adds one new table only. Nothing existing is touched.
--
-- WHY THIS IS ITS OWN TABLE, NOT JUST A TASK:
-- A normal Boardly task is something YOU can go do right now. A
-- "waiting on" item is different in an important way: there is
-- nothing to check off, because the next move belongs to someone
-- else - a client's approval, a teacher's feedback, a delivery. Mixing
-- these into the same list as your own to-dos makes both harder to
-- read at a glance, which is the whole reason this is a separate,
-- small, simple table instead of a new task category.
-- ==========================================================================

create table if not exists waiting_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  board_id    uuid references boards(id) on delete cascade, -- optional - a waiting item can exist without being tied to a specific board
  what        text not null,
  who         text,                    -- who it's waiting on, free text (not a real person record - see Boardly's future Relationship Engine for that)
  importance  text not null default 'normal' check (importance in ('normal', 'important')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz              -- null while still waiting; set the moment it's marked resolved
);

alter table waiting_items enable row level security;

create policy "Users manage their own waiting items"
  on waiting_items for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists waiting_items_user_open_idx on waiting_items(user_id) where resolved_at is null;
