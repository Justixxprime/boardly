-- ==========================================================================
-- BOARDLY - schema_v95_server_side_security_audit_trail.sql
--
-- F8. Before this, every row in security_events was written by the
-- browser calling logSecurityEvent() straight after doing something
-- (js/supabase-client.js). That means the log was only ever as honest
-- as the browser chose to be - a compromised or tampered client could
-- remove a board member or delete a whole board and simply skip the
-- insert call, and the Security page in Settings would show nothing
-- happened.
--
-- Three of the nine event types this app logs have a real table change
-- sitting right behind them, so those three move to database triggers
-- that fire no matter how the change happened, not just when the normal
-- app code runs:
--   member_removed  -> AFTER DELETE on board_members
--   member_invited  -> AFTER INSERT on board_members
--   board_deleted   -> BEFORE DELETE on boards (has to run before, the
--                       row's name is still readable that way)
--
-- Each trigger function is SECURITY DEFINER, owned by postgres (same as
-- the security_events table itself, force RLS is off on that table), so
-- the insert goes through even though the new INSERT policy below no
-- longer allows the browser to write these three event types itself.
--
-- The other six event types (password_changed, signed_out_others,
-- sign_in, mfa_challenge_passed, mfa_enrolled, mfa_removed) don't have a
-- Boardly-owned table sitting behind them to hang a trigger on - they
-- live inside Supabase's own auth schema - so they stay browser-reported
-- for now. Real gap, written down plainly, not hidden: a truly
-- compromised client could still stay silent about one of those six.
-- Fixing that fully would mean either a Postgres trigger on
-- auth.mfa_factors and auth.audit_log_entries (not attempted here, needs
-- checking what trigger access Supabase actually allows on its own auth
-- tables before touching it) or moving those six through an edge
-- function. Left for a later pass, not guessed at here.
-- ==========================================================================

create or replace function log_board_member_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    insert into security_events (user_id, event_type, description, board_id)
    values (auth.uid(), 'member_removed', 'Removed ' || coalesce(old.invited_email, 'a member') || ' from a board', old.board_id);
  end if;
  return old;
end;
$$;

create or replace function log_board_member_invited()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    insert into security_events (user_id, event_type, description, board_id)
    values (auth.uid(), 'member_invited', 'Invited ' || new.invited_email || ' (' || new.role || ') to a board', new.board_id);
  end if;
  return new;
end;
$$;

create or replace function log_board_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    insert into security_events (user_id, event_type, description)
    values (auth.uid(), 'board_deleted', 'Deleted board "' || old.name || '"');
  end if;
  return old;
end;
$$;

drop trigger if exists trg_log_member_removed on board_members;
create trigger trg_log_member_removed
  after delete on board_members
  for each row execute function log_board_member_removed();

drop trigger if exists trg_log_member_invited on board_members;
create trigger trg_log_member_invited
  after insert on board_members
  for each row execute function log_board_member_invited();

drop trigger if exists trg_log_board_deleted on boards;
create trigger trg_log_board_deleted
  before delete on boards
  for each row execute function log_board_deleted();

drop policy if exists "Users can log their own security events" on security_events;
create policy "Users can log their own security events"
  on security_events for insert
  to public
  with check (
    user_id = auth.uid()
    and event_type in ('password_changed','signed_out_others','sign_in','mfa_challenge_passed','mfa_enrolled','mfa_removed')
  );
