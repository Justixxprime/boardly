-- ===========================================================================
-- BOARDLY - schema v89 migration: rate limits for public endpoints (F9)
--
-- Public forms (request portal, custom forms, roadmap votes, proposal and
-- client portal replies, "find my booking") can be hit by anyone with no
-- login. This adds a small counter table and one function the edge functions
-- call to ask "has this person done this too many times lately?".
--
-- How it works: every call counts one hit in a fixed time window (for example
-- 10 minutes). When the hits in the current window go over the limit, the
-- function returns false and the edge function answers "too many requests".
-- People are counted by a one-way hash of their IP address, so no raw IP
-- addresses are stored.
--
-- Only the service role (the edge functions) can call it. Browsers cannot.
-- Old windows are deleted automatically now and then. Safe to run twice.
-- ===========================================================================

create table if not exists public.rate_limits (
  bucket       text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket, window_start)
);

alter table public.rate_limits enable row level security;
-- no policies on purpose: nobody but the service role can read or write this

create or replace function public.rate_limit_hit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits   integer;
begin
  if p_bucket is null or p_limit < 1 or p_window_seconds < 1 then
    return true; -- bad settings never block real people
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as r (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  -- tidy up now and then so the table stays small
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;

  return v_hits <= p_limit;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public;
revoke all on function public.rate_limit_hit(text, integer, integer) from anon;
revoke all on function public.rate_limit_hit(text, integer, integer) from authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
