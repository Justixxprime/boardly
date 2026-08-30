-- ===========================================================================
-- BOARDLY - schema v41 migration: Quiet Hours
--
-- Run this in Supabase SQL Editor. Adds two new columns to the EXISTING
-- user_settings table (from schema_v5_timely_plus.sql) - no new table,
-- nothing else about it changes.
--
-- When both are set, Boardly stays quiet during that window: no OS-level
-- push notification sound or banner for a task reminder or the "due
-- today" check. A ticket marked Urgent always gets through regardless -
-- quiet hours is for not being disturbed by routine stuff, not for
-- missing something that actually matters right now. In-app toasts still
-- show up either way (they only matter if you're already looking at the
-- screen, so they were never the disruptive part).
-- ===========================================================================

alter table public.user_settings add column if not exists quiet_hours_start text; -- "22:00" (24h, local time), null = no quiet hours set
alter table public.user_settings add column if not exists quiet_hours_end text;   -- "07:00"
