-- ===========================================================================
-- BOARDLY - schema v11 "dev features" (priority, environment, time
-- tracking, git links, dependencies)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- This only ADDS columns. It does not delete or alter existing tasks.
-- ===========================================================================

-- "critical" | "high" | "medium" | "low" | null
alter table public.tasks add column if not exists priority text;

-- "dev" | "staging" | "production" | null
alter table public.tasks add column if not exists environment text;

-- Time tracking: total seconds banked so far, plus the timestamp the
-- current run started (null when the timer isn't running). Elapsed time
-- for a running timer is computed as
-- time_tracked_seconds + (now - time_tracking_started_at) rather than
-- updated every second, so it costs one row write per start/stop, not
-- one per second.
alter table public.tasks add column if not exists time_tracked_seconds integer default 0;
alter table public.tasks add column if not exists time_tracking_started_at timestamptz;

-- A branch name and/or a PR/MR link.
alter table public.tasks add column if not exists git_branch text;
alter table public.tasks add column if not exists git_pr_url text;

-- A single "blocked by" dependency on another ticket in the same
-- account. Deliberately one-directional and singular (not a list) to
-- keep this genuinely simple to reason about - if a ticket has more
-- than one blocker, list them in the caption/notes instead.
alter table public.tasks add column if not exists blocked_by_id uuid references public.tasks(id) on delete set null;

create index if not exists tasks_blocked_by_idx on public.tasks(blocked_by_id) where blocked_by_id is not null;

-- ===========================================================================
-- Done. Reload Boardly. The Edit ticket window now has Priority,
-- Environment, a time-tracking start/stop button, Git branch/PR fields,
-- and a "Blocked by" picker.
-- ===========================================================================
