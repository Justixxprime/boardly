-- ===========================================================================
-- BOARDLY - schema v88 migration: remove someone you invited to a board
--
-- Until now the invite menu could only ADD people. This adds one safe
-- server-side function the owner can call to remove a person (a pending
-- invite or an accepted teammate) from a board.
--
-- What it does, in one atomic step:
--   1. checks the caller really owns the board (never trusts the browser)
--   2. un-assigns any task on that board that was assigned to that person,
--      so nothing is left assigned to someone who can no longer see it
--   3. deletes the board_members row
--
-- It never touches tasks, comments or chat messages the person wrote. Those
-- stay on the board. Safe to run more than once.
-- ===========================================================================

create or replace function public.remove_board_member(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member   public.board_members%rowtype;
  v_unassigned integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into v_member from public.board_members where id = p_member_id;
  if not found then
    raise exception 'That person is not on this board any more' using errcode = 'P0002';
  end if;

  if not public.user_owns_board(v_member.board_id) then
    raise exception 'Only the board owner can remove people' using errcode = '42501';
  end if;

  -- assigned_to came in with schema_v46; skip quietly if it is not there yet
  if v_member.user_id is not null and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'assigned_to'
  ) then
    execute 'update public.tasks set assigned_to = null where board_id = $1 and assigned_to = $2'
      using v_member.board_id, v_member.user_id;
    get diagnostics v_unassigned = row_count;
  end if;

  delete from public.board_members where id = p_member_id;

  return jsonb_build_object('ok', true, 'unassigned_tasks', v_unassigned);
end;
$$;

revoke all on function public.remove_board_member(uuid) from public;
revoke all on function public.remove_board_member(uuid) from anon;
grant execute on function public.remove_board_member(uuid) to authenticated;
