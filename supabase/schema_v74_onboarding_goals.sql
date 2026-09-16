-- ===========================================================================
-- BOARDLY 2.0: schema v74, Onboarding goals (brief Section 62's second
-- question, "what do you want Boardly to help with")
-- Run this once in the Supabase SQL Editor, after schema_v69_workspace_
-- persona.sql (user_settings.workspace_type must already exist). Safe to
-- re-run.
--
-- schema_v69's own comment already named this as real future work:
-- "This does not touch Section 63's fuller vision (enabled_modules,
-- default_workflows, default_dashboard) yet." This is the first piece
-- of that: a second, optional, multi-select signup question, stored
-- as a plain array of goal keys (e.g. ["get_paid","manage_work"]).
--
-- HONESTY NOTE: this column being populated does not hide, remove, or
-- gate any existing navigation item or feature. Boardly 2.0's own
-- Section 89 is explicit about never destroying existing functionality
-- without a clear replacement, so this is used only to add something
-- (Home's greeting line, and which of Home's sections sort first),
-- never to take something away. A person who picks nothing, or skips
-- this question entirely, sees Home exactly as it always looked.
-- ===========================================================================

alter table public.user_settings
  add column if not exists goals jsonb not null default '[]'::jsonb;
