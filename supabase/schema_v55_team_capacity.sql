-- ===========================================================================
-- BOARDLY - schema v55: Team Capacity
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Phase 3 of the master build spec: "Each person can have: working
-- hours... capacity. Compare: AVAILABLE vs ASSIGNED. Create a
-- beautiful workload visualization. Make overload obvious."
--
-- Kept deliberately simple: one number per board member (their own
-- weekly capacity in hours), compared against the sum of
-- estimated_minutes (schema_v54) across their active assigned tickets
-- on that board. No separate "days off" or "vacation" calendar - that
-- would need its own whole feature to input and maintain, and without
-- it this can already answer the actual question the spec cares about
-- ("who's overloaded, who has room") using data that already exists.
--
-- The board OWNER's own capacity is stored on boards itself, not as a
-- board_members row - the owner was never a row in that table to begin
-- with (see schema_v17_collaboration.sql), and adding one just for
-- this would risk changing what every OTHER feature that reads
-- board_members assumes it contains (member avatars, the assignment
-- dropdown, and so on). Two separate, narrow columns is a smaller,
-- safer change than reshaping a table other features already depend on.
-- ===========================================================================

alter table public.board_members add column if not exists weekly_capacity_hours numeric;
alter table public.boards add column if not exists owner_weekly_capacity_hours numeric;
