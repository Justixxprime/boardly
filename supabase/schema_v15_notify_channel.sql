-- ==========================================================================
-- BOARDLY - schema v15 migration: notification channel preference
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Safe to run once - one new column with a default, nothing existing
-- changes. Needs schema_v5_timely_plus.sql already run (user_settings
-- table must exist).
-- ==========================================================================

-- 'email'  - daily digest email only (send-critical-sms stays silent)
-- 'sms'    - critical-ticket text alerts only (daily-digest skips this user)
-- 'both'   - both, the default so nobody silently stops getting reminders
-- 'off'    - neither, for someone who only wants in-app/push alerts
alter table public.user_settings
  add column if not exists notify_channel text not null default 'both';

alter table public.user_settings
  drop constraint if exists user_settings_notify_channel_check;

alter table public.user_settings
  add constraint user_settings_notify_channel_check
  check (notify_channel in ('email', 'sms', 'both', 'off'));

-- ==========================================================================
-- Done. Reload settings.html - there's now a real Notifications section
-- instead of the old browser prompt() for a phone number. Both
-- send-critical-sms and daily-digest already check this column (source
-- already updated in those two files) - after running this migration,
-- redeploy them with:
--   supabase functions deploy send-critical-sms
--   supabase functions deploy daily-digest
-- ==========================================================================
