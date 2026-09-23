-- ==========================================================================
-- BOARDLY - schema_v96_fix_member_invited_trigger_service_role.sql
--
-- Fixes a real bug in schema_v95's own log_board_member_invited()
-- trigger, caught by testing before shipping instead of assuming it
-- worked.
--
-- The actual invite-member edge function inserts into board_members
-- using the SERVICE ROLE key (needed to look up whether the invited
-- email already has an account), not the caller's own session. That
-- means auth.uid() is NULL at the moment that insert happens - the
-- trigger function schema_v95 shipped was checking "if auth.uid() is
-- not null" and would silently skip logging every real invite, which
-- is the exact failure mode F8 was trying to fix in the first place.
--
-- Proved this with a rolled-back test transaction that inserted a row
-- the same way the edge function does (no JWT) and confirmed zero rows
-- landed in security_events. The fix: board_members already has an
-- invited_by column that the edge function always sets to the real
-- caller's user id (verified by reading invite-member/index.ts), so
-- the trigger uses that instead of auth.uid(). Re-tested the same way
-- after the fix and got one logged row.
--
-- member_removed and board_deleted did NOT have this bug - both of
-- those are triggered off direct authenticated-session actions
-- (an RPC call or a plain client-side delete, both carry the caller's
-- own JWT), never a service-role path. Checked, not assumed.
-- ==========================================================================

create or replace function log_board_member_invited()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.invited_by is not null then
    insert into security_events (user_id, event_type, description, board_id)
    values (new.invited_by, 'member_invited', 'Invited ' || new.invited_email || ' (' || new.role || ') to a board', new.board_id);
  end if;
  return new;
end;
$$;
