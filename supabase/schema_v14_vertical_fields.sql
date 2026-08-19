-- ==========================================================================
-- BOARDLY - schema v14 migration: per-vertical task fields
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Safe to run once - one new nullable column, nothing existing changes.
-- ==========================================================================

-- Why one flexible jsonb column instead of a named column per field
-- (like delivery_address, patient_name, student_name...): seven verticals
-- times three to five fields each would mean 25-35 mostly-empty columns
-- on every single task, most of them null for any given row. A jsonb
-- column holds only the fields that are actually relevant to whichever
-- vertical the task's board is set to, and adding an eighth vertical
-- later never requires another migration - only a change to
-- VERTICAL_FIELDS in js/dashboard.js.
alter table public.tasks
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- ==========================================================================
-- Done. Reload dashboard.html - opening a task on a logistics/teaching/
-- freelance/personal/field service/healthcare board now shows a "Details"
-- section with that vertical's own fields (delivery address, patient
-- name, student, client, etc.), stored in this column. General boards
-- show no extra section, since 'general' has no vertical fields defined.
-- ==========================================================================
