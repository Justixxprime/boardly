-- ===========================================================================
-- BOARDLY - schema v51: auto-complete checklist when a ticket is Published
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- A board-level setting (default OFF, opt-in) - when a ticket's pipeline
-- stage (see schema_v5_timely_plus.sql's pipeline_stage column) is
-- changed to "Published", Boardly can automatically check off every
-- remaining item on that ticket's checklist and mark the ticket itself
-- Done, since "published" is naturally the end of that workflow for
-- most social/content boards. Off by default because that's not true
-- for every board - some people track post-publish follow-ups
-- (engagement checks, a boosted-post checklist item, etc.) as checklist
-- items that shouldn't get auto-checked away.
-- ===========================================================================

alter table public.boards add column if not exists auto_complete_checklist_on_publish boolean not null default false;
