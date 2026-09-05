-- ===========================================================================
-- BOARDLY - schema v53: Project Baselines
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Phase 2 of the master build spec: "Allow a project manager to save:
-- Original Plan. Then compare: Current Plan. Show: original deadline,
-- current deadline, variance, original task count, current task count,
-- milestone changes."
--
-- A baseline is a point-in-time SNAPSHOT of a board - every active
-- ticket's title/due date/status/milestone, plus every milestone's own
-- target date, at the moment you saved it. Stored as one JSONB blob per
-- baseline rather than a set of normalized tables, since a baseline is
-- meant to be frozen and never change again once saved - there's
-- nothing to join against or update later, just something to compare
-- the board's CURRENT live state against.
--
-- More than one baseline can exist per board (e.g. "Kickoff plan," then
-- "After the scope change in March") - Boardly doesn't force a single
-- original plan, it just needs at least one to compare against.
-- ===========================================================================

create table if not exists public.project_baselines (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  label text not null default 'Baseline',
  snapshot jsonb not null
);

alter table public.project_baselines enable row level security;

create index if not exists idx_project_baselines_board_id on public.project_baselines(board_id);

drop policy if exists "Board owners and members can view baselines" on public.project_baselines;
create policy "Board owners and members can view baselines"
  on public.project_baselines for select
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id));

drop policy if exists "Editor board members can save baselines" on public.project_baselines;
create policy "Editor board members can save baselines"
  on public.project_baselines for insert
  with check (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));

drop policy if exists "Editor board members can delete baselines" on public.project_baselines;
create policy "Editor board members can delete baselines"
  on public.project_baselines for delete
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));
