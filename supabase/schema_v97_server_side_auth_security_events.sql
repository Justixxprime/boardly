-- ==========================================================================
-- BOARDLY - schema_v97_server_side_auth_security_events.sql
--
-- F8 continued. schema_v95/v96 moved 3 of the 9 security_events types to
-- server-side triggers (member_invited, member_removed, board_deleted).
-- This migration moves 5 more of the remaining 6 browser-reported types
-- to triggers on Supabase's own auth schema tables, checked first (not
-- guessed) with has_table_privilege() and a real trigger created and
-- rolled back in a test transaction before anything here ran for real.
--
--   mfa_enrolled          -> auth.mfa_factors, fires when status moves
--                             to 'verified' (insert already-verified, or
--                             update from unverified), not on the earlier
--                             unverified insert that happens mid-enroll
--   mfa_removed           -> auth.mfa_factors, AFTER DELETE
--   mfa_challenge_passed  -> auth.mfa_challenges, fires when verified_at
--                             moves from null to set. challenges has no
--                             user_id column, so the function looks it
--                             up from mfa_factors via factor_id
--   sign_in               -> auth.sessions, AFTER INSERT. Real behavior
--                             change worth knowing: this also fires on a
--                             brand new signup's first session (the old
--                             browser-only version only logged sign_in
--                             from the login form, never from signup) and
--                             on a password-reset session. Token refresh
--                             does NOT insert a new sessions row (it
--                             updates the existing one), so this does not
--                             fire on every request, only real new logins.
--   password_changed      -> auth.users, AFTER UPDATE when
--                             encrypted_password actually changes. Also
--                             a real behavior change: this now also
--                             catches a password reset done through the
--                             "forgot password" email link, which the old
--                             browser-only version never logged (it only
--                             fired from the Settings page form).
--
-- signed_out_others is NOT moved here. The only DB-level signal available
-- is auth.sessions rows disappearing, and a normal single sign-out also
-- deletes exactly one session row - the only way to tell "signed out
-- others" apart from an ordinary sign-out at the row level is to count
-- how many session rows a single DELETE statement removes for one user,
-- which is a heuristic, not a fact, and could misfire on things like
-- simultaneous session expiry cleanup. Left browser-reported rather than
-- guessed at. Real gap, written down, not hidden.
-- ==========================================================================

create or replace function log_mfa_factor_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.user_id is not null then
      insert into security_events (user_id, event_type, description)
      values (old.user_id, 'mfa_removed', 'Turned off two-factor authentication');
    end if;
    return old;
  end if;

  if new.status = 'verified' and (tg_op = 'INSERT' or old.status is distinct from 'verified') then
    if new.user_id is not null then
      insert into security_events (user_id, event_type, description)
      values (new.user_id, 'mfa_enrolled', 'Turned on two-factor authentication');
    end if;
  end if;
  return new;
end;
$$;

create or replace function log_mfa_challenge_passed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if new.verified_at is not null and old.verified_at is null then
    select user_id into v_user_id from auth.mfa_factors where id = new.factor_id;
    if v_user_id is not null then
      insert into security_events (user_id, event_type, description)
      values (v_user_id, 'mfa_challenge_passed', 'Verified with two-factor code');
    end if;
  end if;
  return new;
end;
$$;

create or replace function log_sign_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    insert into security_events (user_id, event_type, description)
    values (new.user_id, 'sign_in', 'Signed in to Boardly');
  end if;
  return new;
end;
$$;

create or replace function log_password_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.encrypted_password is distinct from new.encrypted_password
     and old.encrypted_password is not null then
    insert into security_events (user_id, event_type, description)
    values (new.id, 'password_changed', 'Changed account password');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_mfa_factor_change on auth.mfa_factors;
create trigger trg_log_mfa_factor_change
  after insert or update or delete on auth.mfa_factors
  for each row execute function log_mfa_factor_change();

drop trigger if exists trg_log_mfa_challenge_passed on auth.mfa_challenges;
create trigger trg_log_mfa_challenge_passed
  after update on auth.mfa_challenges
  for each row execute function log_mfa_challenge_passed();

drop trigger if exists trg_log_sign_in on auth.sessions;
create trigger trg_log_sign_in
  after insert on auth.sessions
  for each row execute function log_sign_in();

drop trigger if exists trg_log_password_changed on auth.users;
create trigger trg_log_password_changed
  after update on auth.users
  for each row execute function log_password_changed();

-- Browser can now only self-report the one type left without a table to
-- hang a trigger on.
drop policy if exists "Users can log their own security events" on security_events;
create policy "Users can log their own security events"
  on security_events for insert
  to public
  with check (
    user_id = auth.uid()
    and event_type = 'signed_out_others'
  );
