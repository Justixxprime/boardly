-- ===========================================================================
-- BOARDLY - schema v8 "social" (platform tag + caption/notes)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- This only ADDS columns. It does not delete or alter existing tasks.
-- ===========================================================================

-- Which channel a ticket is for: instagram | facebook | x | linkedin |
-- tiktok | youtube | website | email | null (null = not platform-specific).
-- Shown as a colored badge on the card and drives the "best time to post"
-- hint in the Edit ticket window.
alter table public.tasks add column if not exists platform text;

-- Free-form caption/post copy or brief, kept on the ticket itself instead
-- of living in a separate doc. The Edit ticket window shows a live
-- character counter against the selected platform's typical limit.
alter table public.tasks add column if not exists notes text;

create index if not exists tasks_platform_idx on public.tasks(platform) where platform is not null;

-- ===========================================================================
-- Done. Reload Boardly. The Edit ticket window will now show a "Platform"
-- dropdown and a "Caption / notes" box right under the title field.
-- ===========================================================================
