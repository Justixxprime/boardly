-- ===========================================================================
-- BOARDLY 2.0: schema v70, Operations Fix
-- Run this once in the Supabase SQL Editor, after schema_v69. Safe to
-- re-run.
--
-- schema_v69's workspace_type check constraint only listed the 7 values
-- from js/auth.js's SIGNUP_WORK_TYPES step, but js/dashboard.js's own
-- TERMINOLOGY object (the real source of truth for every board's
-- work_type) actually defines 9: it also has social_media ("Social
-- Media") and software ("Software / Web Dev"). Signup itself never
-- offers those two as choices, but a board can still carry either
-- work_type (set some other way, or added to signup later), and
-- workspace_type is meant to mirror whatever a board can actually be,
-- not a narrower list. This widens the constraint to match reality.
-- ===========================================================================

alter table public.user_settings drop constraint if exists user_settings_workspace_type_check;
alter table public.user_settings
  add constraint user_settings_workspace_type_check
  check (workspace_type in ('general', 'logistics', 'teaching', 'freelance', 'personal', 'field_service', 'healthcare', 'social_media', 'software'));
