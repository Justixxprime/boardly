-- ============================================================================
-- BOARDLY - schema_v79_leader_role_and_chat.sql
-- --------------------------------------------------------------------------
-- Part of Team Features (open item 1): a real "leader" role, a per-board
-- setting that requires a leader to make approval decisions, and a basic
-- member-only team chat per board.
--
-- Named v79, not v77, on purpose: schema_v77_hide_booking_token_from_provider
-- and schema_v78_hide_application_booking_token already exist in this repo
-- and are live. Always check the existing file list before naming a new
-- migration, this project has hit that exact collision once before.
--
-- Already applied live on cafhqxzjujvxmarvkbxd. This file exists so the
-- change has a real record in the repo, matching every other schema_v*
-- migration here.
-- ============================================================================

-- 1. A leader is treated as an editor everywhere editing already checked.
CREATE OR REPLACE FUNCTION public.user_is_board_member(check_board_id uuid, require_editor boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from board_members
    where board_id = check_board_id
      and user_id = auth.uid()
      and accepted_at is not null
      and (not require_editor or role in ('editor','leader'))
  );
$function$;

-- 2. A separate, stricter check: is this person the board owner, or a
-- member whose role is specifically 'leader'? Editors are NOT leaders.
CREATE OR REPLACE FUNCTION public.user_is_board_leader(check_board_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select
    exists (select 1 from boards where id = check_board_id and user_id = auth.uid())
    or exists (
      select 1 from board_members
      where board_id = check_board_id
        and user_id = auth.uid()
        and accepted_at is not null
        and role = 'leader'
    );
$function$;

-- 3. Per-board setting. Defaults to false so nobody's existing approval
-- flow changes until the board owner turns this on.
ALTER TABLE boards ADD COLUMN IF NOT EXISTS approval_requires_leader boolean NOT NULL DEFAULT false;

-- 4. Server-side enforcement on the tasks table. This is the REAL
-- boundary, not the UI hiding the button - matches the project's
-- "never trust the frontend alone" rule.
CREATE OR REPLACE FUNCTION public.enforce_leader_approval_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  requires_leader boolean;
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
     AND NEW.approval_status IN ('approved', 'changes_requested') THEN
    SELECT approval_requires_leader INTO requires_leader FROM boards WHERE id = NEW.board_id;
    IF requires_leader AND NOT (user_owns_board(NEW.board_id) OR user_is_board_leader(NEW.board_id)) THEN
      RAISE EXCEPTION 'Only a board leader can approve or request changes on this board.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_leader_approval_decision ON tasks;
CREATE TRIGGER trg_enforce_leader_approval_decision
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_leader_approval_decision();

-- 5. Same rule, applied to the approval_history log itself, so someone
-- can't route around the trigger by only writing the history row.
DROP POLICY IF EXISTS "Editor board members can log approval history" ON approval_history;
CREATE POLICY "Editor board members can log approval history" ON approval_history
  FOR INSERT
  WITH CHECK (
    (user_owns_board(board_id) OR user_is_board_member(board_id, true))
    AND (
      status NOT IN ('approved','changes_requested')
      OR NOT (SELECT approval_requires_leader FROM boards WHERE id = board_id)
      OR user_owns_board(board_id)
      OR user_is_board_leader(board_id)
    )
  );

-- 6. Team chat: one thread per board, member-only, realtime.
CREATE TABLE IF NOT EXISTS board_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_messages_board_id_created_at ON board_messages(board_id, created_at);

ALTER TABLE board_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Board owners and members can read board chat" ON board_messages
  FOR SELECT
  USING (user_owns_board(board_id) OR user_is_board_member(board_id));

CREATE POLICY "Board owners and members can post to board chat" ON board_messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (user_owns_board(board_id) OR user_is_board_member(board_id))
  );

CREATE POLICY "People can delete their own board chat messages" ON board_messages
  FOR DELETE
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE board_messages;
