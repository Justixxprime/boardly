-- ===========================================================================
-- BOARDLY - schema v6 "Visual": time-in-column, streaks, activity chart
-- Run once, same place as the others. Safe to re-run.
-- ===========================================================================

-- Set whenever a ticket's status changes (todo/inprogress/done) - what the
-- "time in column" badge on each card is measured from.
alter table tasks add column if not exists status_changed_at timestamptz;

-- Set the moment a ticket is marked Done specifically - what the streak
-- tracker and the activity chart/heatmap are built from.
alter table tasks add column if not exists done_at timestamptz;

-- Backfill so existing tickets don't show a blank/huge "time in column"
-- the first time you load this - not exact (we don't know their real
-- history), but a reasonable starting point going forward.
update tasks set status_changed_at = coalesce(status_changed_at, created_at) where status_changed_at is null;
update tasks set done_at = coalesce(done_at, created_at) where status = 'done' and done_at is null;

create index if not exists tasks_done_at_idx on tasks(done_at) where done_at is not null;
