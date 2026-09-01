-- ===========================================================================
-- BOARDLY - schema v45 migration: Public Request Portal
--
-- Run this in Supabase SQL Editor. Adds one new column to the existing
-- `boards` table. Nothing else is touched.
--
-- request_portal_token is its OWN separate secret - not the same as
-- share_token (private board/Client Portal access) and not the same as
-- roadmap_public_token (public roadmap). A request portal link is meant
-- to be handed out the most widely of all three - put on a website, a
-- business card, a social bio - so it gets its own token rather than
-- ever being able to also unlock something more private.
-- ===========================================================================

alter table public.boards add column if not exists request_portal_token uuid unique;
