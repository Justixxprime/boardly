-- ===========================================================================
-- BOARDLY schema v72: proposal richness (feature groups, pricing
-- rationale, timeline, payment stages)
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Charles asked for proposals to look like a real formatted quotation
-- document (cover, feature breakdown by category, a "why this price"
-- paragraph, an estimated timeline, and a payment-stage schedule), not
-- just a title plus a line-item table. Every new column here is
-- nullable or defaulted, so every proposal saved before this migration
-- still renders exactly as it did before, just without these extra
-- sections. Nothing about schema_v59's original columns changes.
-- ===========================================================================

alter table public.proposals
  add column if not exists prepared_by_role text,
  -- Array of { category, items: [string, ...] }, e.g.
  -- [{"category":"Membership System","items":["Registration","Login"]}].
  add column if not exists feature_groups jsonb not null default '[]'::jsonb,
  add column if not exists why_price_text text,
  add column if not exists timeline_text text,
  -- Array of { id, label, percent }. The amount for each stage is
  -- always computed from percent x the line-item total at render time
  -- (both in the builder and in the PDF/public page), the same
  -- reasoning line_items already uses for its own total: a stored
  -- dollar amount would drift the moment a line item changes.
  add column if not exists payment_stages jsonb not null default '[]'::jsonb,
  add column if not exists notes_text text,
  add column if not exists closing_text text;
