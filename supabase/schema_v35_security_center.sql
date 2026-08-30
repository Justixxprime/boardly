-- ===========================================================================
-- BOARDLY - schema v35 migration: Security Center (audit log)
--
-- Run this in Supabase SQL Editor. Adds a small, append-only log of
-- security-relevant events (signing in, deleting a board, inviting or
-- removing a collaborator) that a user can see about their own account
-- under Settings -> Security. Nothing here changes any existing table.
-- ===========================================================================

create table if not exists public.security_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  event_type    text not null,
  description   text not null,
  board_id      uuid references public.boards(id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.security_events enable row level security;

-- Read: only your own events.
drop policy if exists "Users can view their own security events" on public.security_events;
create policy "Users can view their own security events"
  on public.security_events for select
  using (user_id = auth.uid());

-- Insert: only as yourself. Boardly's own pages write these rows right
-- after a real action happens (see logSecurityEvent in supabase-client.js).
drop policy if exists "Users can log their own security events" on public.security_events;
create policy "Users can log their own security events"
  on public.security_events for insert
  with check (user_id = auth.uid());

-- No update or delete policy on purpose - per Boardly's own rule that
-- audit records must not be editable by ordinary users, nobody (besides
-- the service role) can change or remove a row once it's written.

create index if not exists security_events_user_created_idx
  on public.security_events (user_id, created_at desc);

-- Keep this table small automatically: anything older than 90 days is
-- deleted the next time a row is inserted for that same user, so there
-- is no separate cron job to set up for this.
create or replace function public.prune_old_security_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.security_events
  where user_id = new.user_id
    and created_at < now() - interval '90 days';
  return new;
end;
$$;

drop trigger if exists security_events_prune on public.security_events;
create trigger security_events_prune
after insert on public.security_events
for each row execute function public.prune_old_security_events();
