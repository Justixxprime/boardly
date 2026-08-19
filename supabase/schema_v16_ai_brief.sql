-- ==========================================================================
-- BOARDLY - schema v16 migration: per-board AI brief
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Safe to run once - one new nullable column, nothing existing changes.
-- ==========================================================================

-- Free-form custom instructions for the AI assistant, specific to ONE
-- board - e.g. a client's full content brief (company name, contact
-- info, tone, posting schedule, caption rules, checklist template).
-- When set, board-assistant/index.ts includes it in the system prompt
-- for every request made while that board is open, so "write me a post
-- about customs clearance" on that board already knows to produce both
-- a LinkedIn and an X caption, include the company's contact details,
-- and follow whatever else the brief says, without repeating any of it
-- in the chat every time.
alter table public.boards
  add column if not exists ai_brief text;

-- ==========================================================================
-- Done. Reload dashboard.html - the board switcher menu now has an
-- "AI brief for this board" option where you can paste a client's full
-- content brief once, and every "Ask AI" message on that board follows
-- it from then on.
-- ==========================================================================
