-- ===========================================================================
-- BOARDLY - schema v52: Task Links (richer dependency types)
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Phase 2 of the master build spec: "Support: blocks, blocked by,
-- relates to, duplicates, follows, precedes, parent, child." Boardly
-- already has ONE of these - a single blocked_by_id column per task
-- (schema_v11_dev_fields.sql), used by Board Health, the Intelligence
-- Graph, and Autopilot. That column is untouched by this migration -
-- it still works exactly as it does today, for the simple "this one
-- ticket blocks this other one" case.
--
-- This adds a SEPARATE table, task_links, for everything blocked_by_id
-- can't do: more than one link per ticket, and the other relationship
-- types (relates to, duplicates, precedes, parent/child) that had no
-- representation in Boardly at all before this. A ticket can use
-- blocked_by_id, task_links, both, or neither - nothing about the
-- existing field's behavior changes.
--
-- Only FOUR stored types, not eight - the other four are just the
-- same relationship read backwards, computed at display time instead
-- of stored twice: "A blocks B" IS "B is blocked by A", no separate row
-- needed for the reverse; same for precedes/follows and parent/child.
-- "relates to" and "duplicates" are already symmetric (true both ways
-- automatically), so they don't need a reverse label at all.
-- ===========================================================================

create table if not exists public.task_links (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  related_task_id uuid not null references public.tasks(id) on delete cascade,
  link_type text not null check (link_type in ('blocks', 'relates_to', 'duplicates', 'precedes', 'parent_of')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint task_links_not_self check (task_id <> related_task_id),
  -- One link of a given type between the same pair, same direction -
  -- doesn't stop "A blocks B" and "B blocks A" both existing (that
  -- would be a real, if unusual, circular-blocking situation someone
  -- might genuinely want to record), just stops the exact same row
  -- being added twice by an accidental double-click.
  constraint task_links_unique unique (task_id, related_task_id, link_type)
);

alter table public.task_links enable row level security;

create index if not exists idx_task_links_task_id on public.task_links(task_id);
create index if not exists idx_task_links_related_task_id on public.task_links(related_task_id);
create index if not exists idx_task_links_board_id on public.task_links(board_id);

-- Same viewer/editor tiers as every other board-scoped table fixed in
-- schema_v50 - board owners and members can see links, only editor
-- members (or the owner) can create/remove them.
drop policy if exists "Board owners and members can view task links" on public.task_links;
create policy "Board owners and members can view task links"
  on public.task_links for select
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id));

drop policy if exists "Editor board members can create task links" on public.task_links;
create policy "Editor board members can create task links"
  on public.task_links for insert
  with check (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));

drop policy if exists "Editor board members can delete task links" on public.task_links;
create policy "Editor board members can delete task links"
  on public.task_links for delete
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));
