-- ===========================================================================
-- BOARDLY - schema v5 "Timely+": escalating alerts, critical SMS fallback
-- Run this once, same place as the others (Supabase SQL Editor). Needs
-- schema_v4_timely.sql already run. Safe to re-run.
-- ===========================================================================

-- How many times send-push has already re-sent this reminder. Lets it
-- escalate (keep re-alerting every few minutes) instead of firing once
-- and going quiet if you don't see it.
alter table tasks add column if not exists reminder_push_count integer not null default 0;

-- Marked true on a ticket you genuinely can't afford to miss. Combined
-- with a phone number in user_settings below, this is what triggers the
-- SMS fallback in send-critical-sms.
alter table tasks add column if not exists critical boolean not null default false;
alter table tasks add column if not exists critical_alert_sent_at timestamptz;

-- One row per user. Currently just the phone number for the SMS
-- fallback, but a natural home for any other per-account (not
-- per-device) Timely preference later.
create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notify_phone text,
  auto_start_on_due boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;

drop policy if exists "users manage their own settings" on user_settings;
create policy "users manage their own settings" on user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
