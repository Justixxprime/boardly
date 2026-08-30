-- ===========================================================================
-- BOARDLY - schema v36 migration: Notification Center
--
-- Run this in Supabase SQL Editor. Adds one new table, `notifications`,
-- for the bell icon in the dashboard header. Nothing existing is touched.
--
-- Unlike Boardly's existing toasts (which vanish the moment you look
-- away), rows here stick around until read, so things like "you were
-- added to a board" don't get missed just because you weren't looking
-- at the screen at that exact second.
-- ===========================================================================

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  link_url    text,
  board_id    uuid references public.boards(id) on delete cascade,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.notifications enable row level security;

-- Read: only your own notifications.
drop policy if exists "Users can view their own notifications" on public.notifications;
create policy "Users can view their own notifications"
  on public.notifications for select
  using (user_id = auth.uid());

-- Update: only your own, and only to mark read/unread - there is nothing
-- meaningful to gain by a user editing their own notification's text, so
-- this isn't restricted further, but they can never touch anyone else's.
drop policy if exists "Users can update their own notifications" on public.notifications;
create policy "Users can update their own notifications"
  on public.notifications for update
  using (user_id = auth.uid());

-- Insert: a user may create their own notifications directly (e.g. a
-- personal reminder). Notifying someone ELSE (like "you were added to
-- this board") always goes through an Edge Function using the service
-- role, which bypasses RLS entirely - see invite-member/index.ts.
drop policy if exists "Users can create their own notifications" on public.notifications;
create policy "Users can create their own notifications"
  on public.notifications for insert
  with check (user_id = auth.uid());

-- Delete: only your own.
drop policy if exists "Users can delete their own notifications" on public.notifications;
create policy "Users can delete their own notifications"
  on public.notifications for delete
  using (user_id = auth.uid());

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where read_at is null;
