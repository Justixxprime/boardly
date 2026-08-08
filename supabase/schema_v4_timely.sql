-- ===========================================================================
-- BOARDLY - schema v4 "Timely": real alarms, timezones, auto-advance
-- Run this once in the Supabase SQL editor (same place you ran the other
-- schema_*.sql files). Safe to re-run - every statement is "if not exists".
-- See TIMELY_SETUP.md for the full setup, including edge functions + cron.
-- ===========================================================================

-- Which IANA timezone a reminder/auto-move time was set in, e.g.
-- "America/New_York". Reminders are still stored in reminder_at as an
-- absolute UTC instant - this column is what lets the app do that
-- conversion correctly (DST included) instead of guessing from the browser.
alter table tasks add column if not exists timezone text;

-- When set, a background job (auto-advance edge function) flips this
-- ticket from "todo" to "inprogress" automatically once auto_start_at
-- passes, and the client does the same instantly while the tab is open.
alter table tasks add column if not exists auto_start_at timestamptz;

-- Same idea for "inprogress" -> "done".
alter table tasks add column if not exists auto_done_at timestamptz;

-- Optional: instead of (or in addition to) a fixed auto_done_at, you can
-- set a duration. The moment a ticket starts (manually or via
-- auto_start_at), auto_done_at is computed as start + this many minutes.
alter table tasks add column if not exists auto_duration_minutes integer;

-- Which alarm tone to play when this reminder fires in-app.
alter table tasks add column if not exists alarm_sound text default 'siren';

-- Marks that the real push notification has already gone out for the
-- current reminder_at, so the cron job doesn't double-send.
alter table tasks add column if not exists reminder_push_sent_at timestamptz;

-- Snooze support: when set and in the future, both the push cron and the
-- in-app timer treat the reminder as "not due yet".
alter table tasks add column if not exists reminder_snoozed_until timestamptz;

-- Set by the client the next time the app opens, if a reminder's fire time
-- has already passed and it was never acknowledged (phone was off, DND
-- blocked it, etc). Powers the "you missed this" catch-up banner.
alter table tasks add column if not exists reminder_missed boolean default false;
alter table tasks add column if not exists reminder_acked_at timestamptz;

-- One row per browser/device that has granted push permission. A user can
-- have several (phone + laptop) - every one gets the alert.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

drop policy if exists "push subs are private to their owner" on push_subscriptions;
create policy "push subs are private to their owner" on push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists push_subscriptions_user_id_idx on push_subscriptions(user_id);
create index if not exists tasks_auto_start_at_idx on tasks(auto_start_at) where auto_start_at is not null;
create index if not exists tasks_auto_done_at_idx on tasks(auto_done_at) where auto_done_at is not null;

-- ---------------------------------------------------------------------------
-- FIX: "Couldn't upload attachment: new row violates row-level security
-- policy". Creating the task-attachments bucket as Public (FEATURES_V2_
-- SETUP.md step 2) only makes files readable by anyone with the link - it
-- does NOT grant permission to upload. Storage has its own RLS, separate
-- from the tasks table's, and nothing ever created it. These four
-- policies let a signed-in user upload/update/delete/read files inside
-- their own "<user_id>/..." folder of the bucket (which is exactly the
-- path uploadAttachment() already uses), and nobody else's.
-- ---------------------------------------------------------------------------

drop policy if exists "users upload their own attachments" on storage.objects;
create policy "users upload their own attachments" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'task-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users update their own attachments" on storage.objects;
create policy "users update their own attachments" on storage.objects
  for update to authenticated
  using (bucket_id = 'task-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users delete their own attachments" on storage.objects;
create policy "users delete their own attachments" on storage.objects
  for delete to authenticated
  using (bucket_id = 'task-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "anyone can read attachments" on storage.objects;
create policy "anyone can read attachments" on storage.objects
  for select to public
  using (bucket_id = 'task-attachments');
