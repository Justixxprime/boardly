-- ===========================================================================
-- BOARDLY - schema v34 migration: Daily Video Workrooms
--
-- Run this in Supabase SQL Editor. Each row is an expiring, private
-- Daily room connected to one Boardly task. The Daily API key is never
-- stored here or sent to a browser.
-- ===========================================================================

create table if not exists public.video_workrooms (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references public.tasks(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  daily_room_name   text not null unique,
  daily_room_url    text not null,
  access_token      uuid not null default gen_random_uuid() unique,
  status            text not null default 'active' check (status in ('active', 'expired', 'closed')),
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.video_workrooms enable row level security;

drop policy if exists "Owners can view their own video workrooms" on public.video_workrooms;
create policy "Owners can view their own video workrooms"
  on public.video_workrooms for select
  using (user_id = auth.uid());

create index if not exists video_workrooms_task_active_idx
  on public.video_workrooms (task_id, expires_at desc)
  where status = 'active';

create or replace function public.set_video_workroom_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists video_workrooms_updated_at on public.video_workrooms;
create trigger video_workrooms_updated_at
before update on public.video_workrooms
for each row execute function public.set_video_workroom_updated_at();
