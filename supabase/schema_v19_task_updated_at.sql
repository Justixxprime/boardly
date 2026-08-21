-- ==========================================================================
-- BOARDLY - schema v19 migration: know when a ticket last changed
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Adds one column and one trigger. Nothing existing is touched.
--
-- WHY THIS MIGRATION EXISTS:
-- Boardly's offline queue (see js/dashboard.js, "OFFLINE QUEUE") already
-- lets you edit tasks with no connection, and replays those edits the
-- moment you're back online. Now that real collaboration exists
-- (schema_v17_collaboration.sql), there's a new question that column
-- didn't exist to answer: what if someone ELSE also edited that same
-- ticket while you were offline? Without knowing when a row last
-- changed, there was no way to tell - your offline edit would just
-- silently overwrite theirs the moment it replayed. This column is
-- what makes it possible to notice that instead of doing it silently.
-- ==========================================================================

alter table tasks add column if not exists updated_at timestamptz not null default now();

-- Every update to a task automatically stamps this to right now -
-- nothing in the app has to remember to set it manually, which means
-- it can't be forgotten in some code path and quietly go stale.
create or replace function public.set_task_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_task_updated_set_timestamp on tasks;
create trigger on_task_updated_set_timestamp
  before update on tasks
  for each row execute function public.set_task_updated_at();
