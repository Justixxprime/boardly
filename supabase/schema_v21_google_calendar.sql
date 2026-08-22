-- ==========================================================================
-- BOARDLY - schema v21 migration: Google Calendar integration
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Adds one new table and one new column. Nothing existing is touched.
--
-- WHAT THIS IS FOR:
-- When a ticket has a due date, Boardly can create (and keep updated)
-- a matching event on the person's own Google Calendar. This migration
-- adds the storage needed for that - the actual connecting-to-Google
-- part happens in the google-oauth-callback Edge Function, and the
-- create/update-the-event part happens in sync-task-to-google-calendar.
-- See GOOGLE_CALENDAR_SETUP.md for the one manual step only the site
-- owner can do (registering the app with Google).
-- ==========================================================================

create table if not exists calendar_connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  provider      text not null default 'google',
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  calendar_id   text not null default 'primary', -- which of the person's Google calendars to write to
  connected_at  timestamptz not null default now(),
  unique (user_id, provider)
);

alter table calendar_connections enable row level security;

create policy "Users manage their own calendar connection"
  on calendar_connections for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Links a task to the Google Calendar event created for it, so the
-- event can be found again and updated (or removed) instead of a new
-- duplicate one being created every time the due date changes.
alter table tasks add column if not exists google_event_id text;
