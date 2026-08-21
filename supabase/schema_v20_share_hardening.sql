-- ==========================================================================
-- BOARDLY - schema v20 migration: share link expiry + password
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Adds two columns and updates two existing policies. Nothing existing
-- is deleted - every public board that doesn't use an expiry or a
-- password keeps working exactly as it does today.
--
-- A NOTE ON WHY THIS IS BUILT THE WAY IT IS:
-- A password box that only lives in the browser (JavaScript) is not
-- real protection - anyone who knows a board's share link can still
-- read the real data straight from the database through Boardly's API,
-- completely skipping any password box drawn on the screen, because
-- the browser isn't what actually decides who gets the data - Supabase's
-- Row Level Security is. So this migration makes password-protected
-- boards genuinely invisible to that direct API path, full stop. The
-- only way to see a password-protected board's data becomes the new
-- get-shared-board Edge Function (see that file), which checks the
-- password on the server, where a visitor can't skip it.
--
-- Expiry works differently and can be enforced right here in the
-- database policy itself, no Edge Function needed for that part - "is
-- the current time past the expiry time" is something Postgres can
-- just check directly and safely.
-- ==========================================================================

alter table boards add column if not exists share_expires_at timestamptz;
alter table boards add column if not exists share_password_hash text; -- salted SHA-256 hex digest, never the plain password
alter table boards add column if not exists share_password_salt text;

-- ---------------------------------------------------------------------
-- Replace the two public-read policies with versions that also check
-- expiry, and that refuse direct access entirely once a password is
-- set (password-protected boards can only be read through the
-- get-shared-board Edge Function from here on).
-- ---------------------------------------------------------------------

drop policy if exists "Anyone can read a board that's been made public" on boards;
create policy "Anyone can read a public board with no password, not expired"
  on boards for select
  using (
    is_public = true
    and share_password_hash is null
    and (share_expires_at is null or share_expires_at > now())
  );

drop policy if exists "Anyone can read tasks on a public board" on tasks;
create policy "Anyone can read tasks on a public board with no password, not expired"
  on tasks for select
  using (
    board_id in (
      select id from boards
      where is_public = true
        and share_password_hash is null
        and (share_expires_at is null or share_expires_at > now())
    )
  );
