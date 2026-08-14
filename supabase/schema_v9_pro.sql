-- ===========================================================================
-- BOARDLY - schema v9 "pro" (approval pipeline, published tracker, geofence
-- reminders)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- This only ADDS columns. It does not delete or alter existing tasks.
-- ===========================================================================

-- "draft" | "review" | "approved" | "scheduled" | "published" | null.
-- A finer-grained content pipeline shown as a badge on the card, layered
-- on top of (not replacing) the existing To do/In progress/Done status -
-- your board columns stay exactly as they are.
alter table public.tasks add column if not exists pipeline_stage text;

-- Once a ticket is Done, paste the live URL here plus a quick performance
-- note (views/engagement/whatever you track) so finished work stays
-- traceable instead of just disappearing into the Done column.
alter table public.tasks add column if not exists published_url text;
alter table public.tasks add column if not exists performance_note text;

-- Optional geofence alongside (or instead of) a time-based reminder:
-- reminder_lat/lng + a radius in meters, and whether it should fire on
-- "arrive" or "leave". Only checked while Boardly is open in a tab that
-- has granted location permission - same "browser must be open" caveat
-- as the existing time-based browser reminders.
alter table public.tasks add column if not exists reminder_lat double precision;
alter table public.tasks add column if not exists reminder_lng double precision;
alter table public.tasks add column if not exists reminder_radius_m integer;
alter table public.tasks add column if not exists reminder_geo_trigger text; -- 'arrive' | 'leave'
alter table public.tasks add column if not exists reminder_geo_label text;   -- e.g. "Warehouse", shown in the notification

-- ===========================================================================
-- Done. Reload Boardly.
-- ===========================================================================
