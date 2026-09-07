-- ===========================================================================
-- BOARDLY - schema v60: Documents
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- A real rich-text document editor per board - briefs, notes, meeting
-- minutes, anything longer-form than a ticket's own notes field - that
-- can be downloaded as a real PDF. Unlike Custom Forms and Proposals
-- (owner-only, matching automation_rules' precedent), this is
-- MEMBER-INCLUSIVE from the start: a document is closer in spirit to
-- the tasks and milestones collaborators already work on together than
-- to a sales/intake tool one person sends out, so it follows the same
-- owner-OR-editor-member pattern schema_v50 already established for
-- that kind of shared board content.
-- ===========================================================================

create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references public.boards(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null default 'Untitled document',
  -- Rendered HTML from the Quill editor (js/documents.js). Quill's own
  -- clipboard module both reads AND writes this same HTML shape, so
  -- it round-trips cleanly - no separate "Delta" JSON column needed
  -- for a first version of this feature.
  content_html text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.documents enable row level security;

create index if not exists idx_documents_board_id on public.documents(board_id);

-- Reuses the same generic updated_at trigger function schema_v19
-- already created for tasks - it just sets NEW.updated_at = now(),
-- nothing task-specific about it, so no reason to define a second
-- copy of the same three lines for this table.
drop trigger if exists set_documents_updated_at on public.documents;
create trigger set_documents_updated_at
  before update on public.documents
  for each row execute function public.set_task_updated_at();

drop policy if exists "Board owners and editors view documents" on public.documents;
create policy "Board owners and editors view documents"
  on public.documents for select
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id));

drop policy if exists "Board owners and editors write documents" on public.documents;
create policy "Board owners and editors write documents"
  on public.documents for insert
  with check (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));

drop policy if exists "Board owners and editors update documents" on public.documents;
create policy "Board owners and editors update documents"
  on public.documents for update
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true))
  with check (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));

drop policy if exists "Board owners and editors delete documents" on public.documents;
create policy "Board owners and editors delete documents"
  on public.documents for delete
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));
