-- ===========================================================================
-- BOARDLY - schema v57: Proofing
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Last piece of Phase 4 of the master build spec: "Proofing - place a
-- comment pin at an exact x/y coordinate on an image." Different from
-- File-Level Approval Status (also Phase 4, no schema change) - that
-- one gives a whole FILE one verdict. This lets someone say "this
-- specific spot on this specific image needs a look" - the logo is
-- too big right HERE, this button's color is wrong right HERE - which
-- a single file-wide verdict can never capture.
--
-- This is internal, team-facing (same audience as the internal
-- Approval Workflow, schema_v56) - not the Client Portal's own,
-- separate client-facing commenting (client_comments, schema_v27).
-- Different people, different table, same reasoning schema_v56 used
-- to justify a separate column instead of overloading one.
-- ===========================================================================

create table if not exists public.proof_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  -- Attachments live inside the tasks.attachments jsonb array with no
  -- stable id of their own - every other attachment feature (versions,
  -- fileStatus) addresses a specific file by its array INDEX instead.
  -- An index breaks the moment attachments are reordered or one is
  -- removed, so pins here are tied to the attachment's url instead,
  -- which is unique per uploaded file and doesn't shift. The one
  -- tradeoff: replacing a file (File Versioning's "upload new version")
  -- gives it a brand new url, so that file's old pins simply stop
  -- being shown against the new version - not deleted, just no longer
  -- surfaced, since a genuinely new version could look nothing like
  -- the one the pins were placed on.
  attachment_url text not null,
  x numeric(5,2) not null check (x >= 0 and x <= 100),
  y numeric(5,2) not null check (y >= 0 and y <= 100),
  body text not null,
  resolved boolean not null default false,
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.proof_comments enable row level security;

create index if not exists idx_proof_comments_task_id on public.proof_comments(task_id);
create index if not exists idx_proof_comments_attachment_url on public.proof_comments(attachment_url);

-- Same tiering schema_v50 fixed everywhere else: owners and BOTH kinds
-- of accepted board member can see pins (a viewer should still be able
-- to read feedback), but only the owner or an editor member can leave
-- one, resolve one, or delete one - a read-only viewer shouldn't be
-- able to quietly dismiss someone else's feedback as resolved.
drop policy if exists "Board owners and members can view proof comments" on public.proof_comments;
create policy "Board owners and members can view proof comments"
  on public.proof_comments for select
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id));

drop policy if exists "Editor board members can add proof comments" on public.proof_comments;
create policy "Editor board members can add proof comments"
  on public.proof_comments for insert
  with check (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));

drop policy if exists "Editor board members can resolve proof comments" on public.proof_comments;
create policy "Editor board members can resolve proof comments"
  on public.proof_comments for update
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true))
  with check (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));

drop policy if exists "Editor board members can delete proof comments" on public.proof_comments;
create policy "Editor board members can delete proof comments"
  on public.proof_comments for delete
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));
