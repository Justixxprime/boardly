-- ===========================================================================
-- BOARDLY - schema v56: Approval Workflow (internal)
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Phase 3 of the master build spec: "Create a proper approval workflow.
-- Example: Design → Submitted → Waiting for approval → Approved OR
-- Needs changes. Approval history must be stored."
--
-- This is deliberately SEPARATE from the Client Portal's own
-- client_status field (schema_v27) - that one is external, a CLIENT
-- approving or requesting changes from outside the team entirely. This
-- is internal: one teammate submitting work, another teammate (or the
-- board owner) reviewing it. Different people, different purpose, so
-- a different field rather than overloading one column with two
-- unrelated meanings.
-- ===========================================================================

alter table public.tasks add column if not exists approval_status text check (approval_status in ('submitted', 'approved', 'changes_requested'));

create table if not exists public.approval_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  status text not null check (status in ('submitted', 'approved', 'changes_requested')),
  note text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.approval_history enable row level security;

create index if not exists idx_approval_history_task_id on public.approval_history(task_id);

-- Read/write tiers match every other board-scoped table already fixed
-- in schema_v50 - board owners and members can see the history,
-- editor members (or the owner) can add to it. History rows are
-- never updated or deleted once written - a real audit trail, not
-- one that can be quietly edited after the fact.
drop policy if exists "Board owners and members can view approval history" on public.approval_history;
create policy "Board owners and members can view approval history"
  on public.approval_history for select
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id));

drop policy if exists "Editor board members can log approval history" on public.approval_history;
create policy "Editor board members can log approval history"
  on public.approval_history for insert
  with check (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));
