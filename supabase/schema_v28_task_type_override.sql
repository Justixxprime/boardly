-- ==========================================================================
-- BOARDLY - schema v28 migration: per-task type override
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Adds ONE column to tasks. Nothing existing is touched or removed.
--
-- WHY THIS EXISTS: every vertical view so far (Control Tower, Classroom,
-- Dispatch, Care Rounds) decided what to show based on the BOARD's
-- type - so a board was either "a logistics board" or "a teaching
-- board," entirely. That's wrong for anyone who runs one board that
-- mixes things - a few delivery jobs next to a few unrelated personal
-- tasks, say. task_type lets a single TASK say "I'm actually a
-- logistics task" (or any other type) regardless of what the board
-- itself is set to. When it's left blank (the default for every task
-- that exists already), the task just inherits the board's own type,
-- exactly like it always has - nothing changes for anyone who doesn't
-- touch this.
-- ==========================================================================

alter table tasks add column if not exists task_type text;
