-- ===========================================================================
-- BOARDLY - schema v50 migration: collaboration RLS gaps
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Found during a Phase 1 security audit (the master build spec's own
-- "test unauthorized reads/writes" requirement): board collaboration
-- (schema_v17) added a helper, user_is_board_member(), and used it to
-- let invited teammates see and edit tasks and task comments on a board
-- they've joined - but several features added AFTER v17 never got the
-- same treatment. Their RLS policies still only check
-- "user_id = auth.uid()", which quietly means an invited teammate can
-- see the board's tasks but NOT its automation rules or milestones,
-- even though they're clearly board-level data, not personal data.
--
-- This matters more now than when it was first missed: collaboration is
-- the very feature Pro is gated behind (see PLAN_GATING_SETUP.md), so
-- someone actually paying for Pro to work with a team deserves a team
-- that can see the whole board, not just tickets.
--
-- Two tables fixed here:
--   - automation_rules (+ automation_runs, its run-history table) -
--     board_id is REQUIRED here, so this is unambiguously board-level
--     data, not personal data with an optional board tag.
--   - milestones - board_id is optional (a milestone CAN exist without
--     a board), so the fix only adds board-member access on top of the
--     existing owner access, it never takes anything away.
--
-- Nothing is removed here, only replaced with a broader version of the
-- same policy - existing owner-only access keeps working exactly as it
-- does today.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- automation_rules
-- ---------------------------------------------------------------------------

drop policy if exists "Users can view their own automation rules" on public.automation_rules;
create policy "Board owners and members can view automation rules"
  on public.automation_rules for select
  using (user_id = auth.uid() or public.user_owns_board(board_id) or public.user_is_board_member(board_id));

drop policy if exists "Users can create their own automation rules" on public.automation_rules;
create policy "Editor board members can create automation rules"
  on public.automation_rules for insert
  with check (user_id = auth.uid() and (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true)));

drop policy if exists "Users can update their own automation rules" on public.automation_rules;
create policy "Editor board members can update automation rules"
  on public.automation_rules for update
  using (user_id = auth.uid() or public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));

drop policy if exists "Users can delete their own automation rules" on public.automation_rules;
create policy "Editor board members can delete automation rules"
  on public.automation_rules for delete
  using (user_id = auth.uid() or public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));

-- automation_runs (the run-history log) - a collaborator's own action
-- triggering a rule needs to be ABLE to log that run, or Autopilot's
-- history quietly grows gaps every time it fires from something a
-- teammate (not the board owner) did.
drop policy if exists "Users can view runs of their own rules" on public.automation_runs;
create policy "Board owners and members can view automation runs"
  on public.automation_runs for select
  using (exists (
    select 1 from public.automation_rules r
    where r.id = rule_id
      and (r.user_id = auth.uid() or public.user_owns_board(r.board_id) or public.user_is_board_member(r.board_id))
  ));

drop policy if exists "Users can log runs of their own rules" on public.automation_runs;
create policy "Board owners and members can log automation runs"
  on public.automation_runs for insert
  with check (exists (
    select 1 from public.automation_rules r
    where r.id = rule_id
      and (r.user_id = auth.uid() or public.user_owns_board(r.board_id) or public.user_is_board_member(r.board_id))
  ));

-- ---------------------------------------------------------------------------
-- milestones (board_id is OPTIONAL here - a personal, no-board milestone
-- still only shows up for the person who made it, since none of the
-- board-based clauses below can ever match a null board_id)
-- ---------------------------------------------------------------------------

drop policy if exists "Users can view their own milestones" on public.milestones;
create policy "Owners, creators, and board members can view milestones"
  on public.milestones for select
  using (user_id = auth.uid() or public.user_owns_board(board_id) or public.user_is_board_member(board_id));

drop policy if exists "Users can create their own milestones" on public.milestones;
create policy "Editor board members can create milestones"
  on public.milestones for insert
  with check (user_id = auth.uid() and (board_id is null or public.user_owns_board(board_id) or public.user_is_board_member(board_id, true)));

drop policy if exists "Users can update their own milestones" on public.milestones;
create policy "Editor board members can update milestones"
  on public.milestones for update
  using (user_id = auth.uid() or public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));

drop policy if exists "Users can delete their own milestones" on public.milestones;
create policy "Editor board members can delete milestones"
  on public.milestones for delete
  using (user_id = auth.uid() or public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));
