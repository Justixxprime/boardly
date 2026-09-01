-- ===========================================================================
-- BOARDLY - schema v46 migration: Task Assignment (Delegation)
--
-- Run this in Supabase SQL Editor. Adds one new column to the existing
-- `tasks` table. Nothing else is touched.
--
-- assigned_to is nullable and optional - a board with no assignments at
-- all keeps working exactly as it always has. When it IS set, it must
-- be a real account holder (a signed-up collaborator or the board
-- owner), never a pending invite that hasn't been accepted yet - that's
-- what makes a real in-app notification to them possible.
-- ===========================================================================

alter table public.tasks add column if not exists assigned_to uuid references auth.users(id) on delete set null;
create index if not exists tasks_assigned_to_idx on public.tasks (assigned_to);
