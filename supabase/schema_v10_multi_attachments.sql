-- ===========================================================================
-- BOARDLY - schema v10 "multi-attachments"
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- This only ADDS a column. It does not delete or alter existing tasks.
-- Needs the "task-attachments" storage bucket from schema_v2/FEATURES_V2_SETUP.md.
-- ===========================================================================

-- A list of {url, name} objects instead of a single attachment_url/name
-- pair, so a ticket can hold several photos/files/links at once. The old
-- attachment_url/attachment_name columns are left in place and kept in
-- sync with the most recently added item, so anything still reading
-- those two columns (the post preview's cover image, older exports)
-- keeps working exactly as before.
alter table public.tasks add column if not exists attachments jsonb default '[]'::jsonb;

-- ===========================================================================
-- Done. Reload Boardly. The Edit ticket window now lets you add several
-- photos/files/links to one ticket, and you can paste a copied image
-- straight in instead of always picking a file.
-- ===========================================================================
