-- ==========================================================================
-- BOARDLY - schema v12 migration: per-board work type (multi-vertical)
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Safe to run once on top of everything else - it only adds one new
-- column with a default, so no existing board or task is touched.
-- ==========================================================================

-- Each board can now declare what kind of work it's for. This changes
-- ONLY the labels shown for the todo/inprogress/done columns (see
-- TERMINOLOGY in js/dashboard.js) - the underlying status values on
-- tasks stay exactly 'todo' | 'inprogress' | 'done' forever, so drag and
-- drop, filtering, counts, and every existing query keep working
-- untouched. This is a display layer, not a new status system.
alter table public.boards
  add column if not exists work_type text not null default 'general';

alter table public.boards
  drop constraint if exists boards_work_type_check;

alter table public.boards
  add constraint boards_work_type_check
  check (work_type in ('general', 'logistics', 'teaching', 'freelance'));

-- ==========================================================================
-- Done. Reload dashboard.html after running this - the "Create board" and
-- board switcher UI now let you set a board's work type, and the three
-- column headers relabel themselves to match whichever board is open.
-- ==========================================================================
