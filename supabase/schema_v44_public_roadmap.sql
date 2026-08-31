-- ===========================================================================
-- BOARDLY - schema v44 migration: Public Roadmap + Voting
--
-- Run this in Supabase SQL Editor. Adds:
--   - boards.roadmap_public_token: a SEPARATE secret from the existing
--     Client Portal share_token. Deliberately never the same value - a
--     roadmap link is meant to be handed out widely (posted publicly,
--     shared with anyone), while the Client Portal link is meant to stay
--     private to one client. Reusing one token for both would mean
--     anyone with the (more widely shared) roadmap link could also see
--     private client data through the portal - this keeps them
--     completely separate on purpose.
--   - ideas.votes: a running total, kept accurate by a trigger rather
--     than trusted from the client on every vote.
--   - idea_votes: one row per (idea, voter) - the unique constraint is
--     what actually stops the same visitor voting twice, not just a
--     client-side check, which anyone could bypass by clearing
--     localStorage. voter_id is a random id generated in the visitor's
--     browser and remembered there - there's no login for a public
--     roadmap, so this is the same kind of "good enough, not perfect"
--     anti-abuse measure the rest of the internet uses for this exact
--     kind of anonymous voting.
-- ===========================================================================

alter table public.boards add column if not exists roadmap_public_token uuid unique;
alter table public.ideas add column if not exists votes integer not null default 0;

create table if not exists public.idea_votes (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null references public.ideas(id) on delete cascade,
  voter_id   text not null,
  created_at timestamptz not null default now(),
  unique (idea_id, voter_id)
);

-- No RLS policies granting public access here on purpose - the public
-- roadmap page never talks to Supabase directly (it has no anon-key
-- read path to someone else's ideas). It only ever goes through the
-- get-public-roadmap and roadmap-vote Edge Functions below, which use
-- the service role and do their own token/stage checks before
-- returning or changing anything - same security shape as Client
-- Portal's get-shared-board and client-portal-action.
alter table public.idea_votes enable row level security;

create or replace function public.increment_idea_votes()
returns trigger
language plpgsql
as $$
begin
  update public.ideas set votes = votes + 1 where id = new.idea_id;
  return new;
end;
$$;

drop trigger if exists idea_votes_increment on public.idea_votes;
create trigger idea_votes_increment
after insert on public.idea_votes
for each row execute function public.increment_idea_votes();
