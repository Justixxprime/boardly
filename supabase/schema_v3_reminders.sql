-- ===========================================================================
-- BOARDLY - reminder migration
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- This only ADDS columns. It does not delete or alter existing tasks.
-- ===========================================================================

alter table public.tasks add column if not exists reminder_at timestamptz;
alter table public.tasks add column if not exists reminder_email_sent_at timestamptz;

create index if not exists tasks_pending_reminders_idx
  on public.tasks (reminder_at)
  where reminder_at is not null and reminder_email_sent_at is null and status <> 'done';

-- ===========================================================================
-- Done. Reload Boardly. The Edit ticket window will now show “Remind me at”.
-- ===========================================================================
