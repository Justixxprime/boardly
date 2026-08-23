-- ==========================================================================
-- BOARDLY - schema v25 migration: Decision Ledger
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Adds one new table only. Nothing existing is touched.
--
-- WHY THIS EXISTS:
-- Tasks capture WHAT needs doing. Nothing in Boardly captured WHY a
-- meaningful choice was made - "why did we go with this vendor,"
-- "why did we drop that feature," "what did we consider instead."
-- Six months later, that reasoning is usually gone, and the same
-- debate happens again from scratch. This is a small, deliberately
-- simple place to write it down once, at the moment it's fresh.
-- ==========================================================================

create table if not exists decisions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  board_id         uuid references boards(id) on delete cascade, -- optional - a decision can exist without being tied to a specific board
  decision         text not null,          -- what was decided
  reason           text,                   -- why
  alternatives     text,                   -- what else was considered and passed on
  expected_outcome text,
  actual_outcome   text,                   -- filled in later, once it's known how it played out
  review_date      date,                   -- optional - "revisit this by" date, for decisions that aren't meant to be permanent
  decided_at       timestamptz not null default now()
);

alter table decisions enable row level security;

create policy "Users manage their own decisions"
  on decisions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
