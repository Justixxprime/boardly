-- ==========================================================================
-- BOARDLY - schema v27 migration: Client Portal v1
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Adds three columns to tasks + one new table. Nothing existing is
-- touched or removed - every board that never uses this keeps working
-- exactly as it does today.
--
-- WHY THIS REUSES THE EXISTING PUBLIC SHARE LINK, NOT A SEPARATE ONE:
-- A board already has one public share_token (schema_v2 / v20) that
-- controls who can see it and whether a password or expiry is
-- required. The Client Portal is a different, curated FRONT DOOR onto
-- that same board - it only shows tasks you've explicitly marked
-- client_visible, and it adds a couple of client-only actions
-- (comment, approve, request changes) - but it deliberately doesn't
-- introduce a second, separate access-control system to keep track
-- of. If a board isn't public, its Client Portal isn't reachable
-- either, same as share.html today.
--
-- WHY client_comments HAS NO PUBLIC RLS POLICY AT ALL:
-- Clients using the portal have no Boardly account and no auth.uid() -
-- there's no real identity to write a safe RLS policy around for them.
-- Exactly like schema_v20's password check, the only place that's
-- allowed to decide "is this request genuinely coming through a valid,
-- unexpired, correctly-password-checked share link" is server-side
-- code with the service role key - the client-portal-action Edge
-- Function - never a policy a browser could try to talk to directly.
-- The board's OWNER, however, is a real authenticated user, so they
-- read client_comments normally, straight from their dashboard, via
-- the policy below.
-- ==========================================================================

alter table tasks add column if not exists client_visible boolean not null default false;
alter table tasks add column if not exists client_status text not null default 'pending'
  check (client_status in ('pending', 'approved', 'changes_requested'));
alter table tasks add column if not exists client_feedback text;

create index if not exists tasks_client_visible_idx on tasks(board_id) where client_visible = true;

create table if not exists client_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  board_id    uuid not null references boards(id) on delete cascade,
  author_name text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);

alter table client_comments enable row level security;

create index if not exists client_comments_task_idx on client_comments(task_id);

-- Only the board's real, authenticated owner can read client comments
-- directly. Everyone else (including the clients who wrote them) only
-- ever reaches this table through client-portal-action, which uses the
-- service role key and does its own password/expiry check first.
drop policy if exists "Board owners read client comments on their own boards" on client_comments;
create policy "Board owners read client comments on their own boards"
  on client_comments for select
  using (
    board_id in (select id from boards where user_id = auth.uid())
  );

-- The owner can also reply, right from their own dashboard - this
-- makes the portal a real back-and-forth instead of a one-way inbox.
-- Clients themselves still can't insert directly (no policy grants
-- that) - their comments only ever arrive through the Edge Function.
drop policy if exists "Board owners reply to client comments on their own boards" on client_comments;
create policy "Board owners reply to client comments on their own boards"
  on client_comments for insert
  with check (
    board_id in (select id from boards where user_id = auth.uid())
  );
