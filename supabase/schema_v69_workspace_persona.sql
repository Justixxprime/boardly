-- ===========================================================================
-- BOARDLY 2.0: schema v69, Workspace Persona (Section 62/63)
-- Run this once in the Supabase SQL Editor, after schema_v5_timely_plus.sql
-- (user_settings must already exist). Safe to re-run.
--
-- Per the Phase 0 audit's own finding: "no persona-selection flow
-- exists; new signups land straight on an empty general board today."
-- That was half true. Signup already asks "what are you organizing?"
-- (js/auth.js's SIGNUP_WORK_TYPES step), but the answer only ever
-- lived in localStorage long enough to tag the very first board, then
-- got deleted (js/dashboard.js's ensureBoardsLoaded). It could never
-- inform anything else, including the Operations hub this schema
-- change makes possible.
--
-- This adds one durable column so that same answer survives past board
-- creation. It does not touch Section 63's fuller vision
-- (enabled_modules, default_workflows, default_dashboard) yet, that is
-- real future work, this is the one piece needed to give Operations a
-- real home first.
-- ===========================================================================

alter table public.user_settings
  add column if not exists workspace_type text
    check (workspace_type in ('general', 'logistics', 'teaching', 'freelance', 'personal', 'field_service', 'healthcare'));
