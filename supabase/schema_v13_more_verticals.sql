-- ==========================================================================
-- BOARDLY - schema v13 migration: three more work types
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Requires schema_v12_work_type.sql to have been run first (it needs the
-- work_type column to already exist). Safe to run once - it only widens
-- the allowed list of values, it does not touch any existing board.
-- ==========================================================================

alter table public.boards
  drop constraint if exists boards_work_type_check;

alter table public.boards
  add constraint boards_work_type_check
  check (work_type in (
    'general', 'logistics', 'teaching', 'freelance',
    'personal', 'field_service', 'healthcare'
  ));

-- ==========================================================================
-- Done. Reload dashboard.html - the Board type menu now offers Personal,
-- Field Service, and Healthcare / Caregiving alongside the original four.
-- ==========================================================================
