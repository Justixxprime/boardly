-- ==========================================================================
-- BOARDLY - schema v22 migration: Slack and Zapier
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Adds columns only, to the user_settings table that already exists.
-- Nothing existing is touched.
-- ==========================================================================

-- SLACK
-- slack_webhook_url: an "Incoming Webhook" URL from the person's own
--   Slack workspace - posting to it sends a message into whichever
--   channel they picked when creating it. See SLACK_SETUP.md.
-- slack_user_id: their own Slack member ID (found in their Slack
--   profile), used so the /addtask slash command knows which Boardly
--   account is asking to create a task.
alter table user_settings add column if not exists slack_webhook_url text;
alter table user_settings add column if not exists slack_user_id text;
create index if not exists user_settings_slack_user_id_idx on user_settings(slack_user_id) where slack_user_id is not null;

-- ZAPIER
-- api_key: a random token that stands in for a login when a Zap needs
--   to create a task in Boardly (an "inbound" zap, e.g. "new email ->
--   new Boardly ticket"). Generated once, shown once, can be
--   regenerated (which invalidates the old one) from Settings.
-- zapier_outbound_webhook_url: where Boardly sends a copy of every new
--   ticket, for an "outbound" zap (e.g. "new Boardly ticket -> add row
--   to Google Sheets"). Comes from Zapier's own "Catch Hook" trigger
--   step, not something Boardly generates.
alter table user_settings add column if not exists api_key text unique;
alter table user_settings add column if not exists zapier_outbound_webhook_url text;
