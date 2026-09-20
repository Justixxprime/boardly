-- ===========================================================================
-- BOARDLY 2.0: schema v82, job posters can delete their jobs, but not while money is in flight
-- Run once in the Supabase SQL Editor, AFTER schema_v81. Safe to re-run.
--
-- The delete policy already exists (schema_v75: "Users delete their own
-- opportunities"), so the only thing missing was a safety net.
--
-- THE RISK: an application row holds the link (booking_id + booking_access_token)
-- the poster needs to release held money. Deleting a job deletes its applications
-- (on delete cascade). If money is held for that job, deleting it would leave a
-- paid booking the poster has lost the key to.
--
-- THE RULE (signed-in users only; Edge Functions and the SQL editor are trusted,
-- so account deletion still works): a job cannot be deleted while any of its
-- applications has a booking that is
--   * paid and held (paid_held), or
--   * waiting for payment and less than 24 hours old, or
--   * in an open dispute.
-- Finished (released / refunded / cancelled) and never-paid jobs delete normally.
-- The poster can always CLOSE the job instead, which hides it from the board.
-- ===========================================================================

create or replace function public.marketplace_opportunities_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return old;
  end if;

  if exists (
    select 1
    from public.marketplace_applications a
    join public.marketplace_bookings b on b.id = a.booking_id
    where a.opportunity_id = old.id
      and (
        b.status = 'paid_held'
        or (b.status = 'pending_payment' and b.created_at > now() - interval '24 hours')
        or b.dispute_status = 'opened'
      )
  ) then
    raise exception 'This job has a payment in progress, so it can''t be deleted yet. Finish the payment first, or close the job instead.';
  end if;

  return old;
end;
$$;

revoke all on function public.marketplace_opportunities_delete_guard() from public, anon, authenticated;

drop trigger if exists trg_marketplace_opportunities_delete_guard on public.marketplace_opportunities;
create trigger trg_marketplace_opportunities_delete_guard
  before delete on public.marketplace_opportunities
  for each row execute function public.marketplace_opportunities_delete_guard();
