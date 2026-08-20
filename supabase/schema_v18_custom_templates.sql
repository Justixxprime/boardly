-- ==========================================================================
-- BOARDLY - schema v18 migration: your own board templates
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Adds one new table only. Nothing existing is touched.
--
-- WHY THIS MIGRATION EXISTS:
-- Boardly already ships with built-in templates (Sprint planning,
-- Content calendar, Job hunt, and so on - see BOARD_TEMPLATES in
-- dashboard.js) and the vertical quick-templates in the "New board
-- from template" menu. What it can't do yet is let a user take a
-- board THEY built and save it as their own reusable starting point.
-- This migration adds exactly that, as its own table, so it never
-- touches the built-in list.
--
-- This table follows the same simple "owner only" security style as
-- every table before schema_v17 (auth.uid() = user_id) - it does not
-- need the shared-access helper functions from schema_v17, because a
-- personal template is never shared with anyone, only the boards it
-- gets used to create are (and that sharing already works).
-- ==========================================================================

create table if not exists board_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  icon        text not null default 'fa-layer-group', -- a Font Awesome icon name, matches the built-in templates' look
  tasks       jsonb not null default '[]'::jsonb,      -- array of [title, category] pairs, same shape as BOARD_TEMPLATES in dashboard.js
  created_at  timestamptz not null default now()
);

alter table board_templates enable row level security;

create policy "Users manage their own board templates"
  on board_templates for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
