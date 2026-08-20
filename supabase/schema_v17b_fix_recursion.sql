-- ==========================================================================
-- BOARDLY - schema v17b fix: stop the infinite recursion error
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
--
-- WHAT WENT WRONG (plain words):
-- schema_v17_collaboration.sql gave the "boards" table a rule that says
-- "let a person read this board if board_members says they're a member",
-- and gave the "board_members" table a rule that says "let a person
-- manage this row if boards says they own the board". Those two rules
-- kept asking each other the same question forever, and Postgres
-- (correctly) refused to get stuck in that loop - that's the
-- "infinite recursion detected in policy for relation board_members"
-- error you saw.
--
-- WHAT THIS FILE DOES:
-- It replaces those two rules with a small helper function each. A
-- helper function is allowed to look directly at a table without
-- triggering that table's security rules again, so the loop is gone.
-- Nothing about WHO can see WHAT changes - a board owner still sees
-- everything, an invited member still only sees boards they're on.
-- This only changes HOW the database checks that, not the outcome.
--
-- Safe to run as many times as you like.
-- ==========================================================================

-- ---------------------------------------------------------------------
-- STEP 1: two small helper functions.
-- "security definer" means: when this function runs, it's allowed to
-- look at the boards / board_members tables directly, without
-- re-triggering their own security rules. That's what breaks the loop.
-- ---------------------------------------------------------------------
create or replace function public.user_owns_board(check_board_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from boards
    where id = check_board_id and user_id = auth.uid()
  );
$$;

create or replace function public.user_is_board_member(check_board_id uuid, require_editor boolean default false)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from board_members
    where board_id = check_board_id
      and user_id = auth.uid()
      and accepted_at is not null
      and (not require_editor or role = 'editor')
  );
$$;

-- ---------------------------------------------------------------------
-- STEP 2: rebuild the board_members policies using the helper function
-- instead of a direct subquery on boards.
-- ---------------------------------------------------------------------
drop policy if exists "Owners manage members of their own boards" on board_members;
create policy "Owners manage members of their own boards"
  on board_members for all
  using (public.user_owns_board(board_id))
  with check (public.user_owns_board(board_id));

-- This one was already safe (it only ever looked at board_members'
-- own columns), kept as-is, just recreated so this file is complete
-- and self-contained.
drop policy if exists "Members can see their own membership rows" on board_members;
create policy "Members can see their own membership rows"
  on board_members for select
  using (user_id = auth.uid() or invited_email = auth.jwt() ->> 'email');

-- ---------------------------------------------------------------------
-- STEP 3: rebuild the boards policy using the helper function instead
-- of a direct subquery on board_members.
-- ---------------------------------------------------------------------
drop policy if exists "Members can read boards they've been added to" on boards;
create policy "Members can read boards they've been added to"
  on boards for select
  using (public.user_is_board_member(id));

-- ---------------------------------------------------------------------
-- STEP 4: rebuild the tasks policies the same way, so they're
-- consistent and can't develop the same problem later.
-- ---------------------------------------------------------------------
drop policy if exists "Board members can read tasks on boards they've joined" on tasks;
create policy "Board members can read tasks on boards they've joined"
  on tasks for select
  using (public.user_is_board_member(board_id));

drop policy if exists "Editor members can insert tasks on boards they've joined" on tasks;
create policy "Editor members can insert tasks on boards they've joined"
  on tasks for insert
  with check (public.user_is_board_member(board_id, true));

drop policy if exists "Editor members can update tasks on boards they've joined" on tasks;
create policy "Editor members can update tasks on boards they've joined"
  on tasks for update
  using (public.user_is_board_member(board_id, true));

-- ---------------------------------------------------------------------
-- STEP 5: rebuild the task_comments policies the same way too.
-- ---------------------------------------------------------------------
drop policy if exists "Anyone with board access can read comments" on task_comments;
create policy "Anyone with board access can read comments"
  on task_comments for select
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id));

drop policy if exists "Owners and editor members can post comments" on task_comments;
create policy "Owners and editor members can post comments"
  on task_comments for insert
  with check (
    user_id = auth.uid()
    and (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true))
  );

-- "A user can delete their own comment" did not touch boards or
-- board_members at all, so it was never part of the problem - not
-- recreated here, it's still exactly as it was.
