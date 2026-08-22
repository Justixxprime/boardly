-- ==========================================================================
-- BOARDLY - schema v24 migration: Commitment Guardian
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Adds one new table only. Nothing existing is touched.
--
-- WHY THIS IS ITS OWN TABLE, NOT JUST A TASK WITH A DUE DATE:
-- A commitment is a promise made TO a specific person - "I told the
-- client the site would be live Friday," "I promised my student I'd
-- review their essay tomorrow." That's a different kind of thing from
-- an ordinary to-do: breaking it doesn't just mean a task is late, it
-- means someone is disappointed, or an important relationship takes a
-- small hit. Boardly can't feel that difference from a regular task
-- with a due date, so a commitment is deliberately kept separate and
-- shown with its own visible safety state - see waiting_items
-- (schema_v23) for the mirror-image idea: this table is what YOU
-- promised someone else, that one is what you're waiting on THEM for.
-- ==========================================================================

create table if not exists commitments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  board_id     uuid references boards(id) on delete cascade, -- optional - a commitment can exist without being tied to a specific board
  what         text not null,
  to_whom      text,                -- who the promise was made to, free text
  due_date     date,                -- optional - some commitments are "soon" rather than a specific date
  created_at   timestamptz not null default now(),
  completed_at timestamptz          -- null while still open; set the moment it's marked kept
);

alter table commitments enable row level security;

create policy "Users manage their own commitments"
  on commitments for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists commitments_user_open_idx on commitments(user_id) where completed_at is null;
