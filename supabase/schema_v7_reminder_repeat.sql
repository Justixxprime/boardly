-- ===========================================================================
-- BOARDLY - schema v7 "repeating reminders"
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- This only ADDS a column. It does not delete or alter existing tasks.
-- Needs schema_v3_reminders.sql and schema_v4_timely.sql to already be run
-- (this depends on reminder_at and timezone existing).
-- ===========================================================================

-- "daily" | "weekdays" | "weekly" | null (null/"" = one-off, current behaviour).
-- When set, the moment a reminder fires the app rolls reminder_at forward
-- to its next occurrence automatically (same time, next day/weekday/week,
-- evaluated in the task's own timezone) instead of clearing it - so you
-- set the time once and it keeps reminding you without being re-edited.
alter table public.tasks add column if not exists reminder_repeat text;

-- ===========================================================================
-- Done. Reload Boardly. The Edit ticket window's "Remind me at" section
-- will now show a "Repeats" dropdown under the date/time field.
-- ===========================================================================
