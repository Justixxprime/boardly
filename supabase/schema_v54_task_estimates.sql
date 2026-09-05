-- ===========================================================================
-- BOARDLY - schema v54: Task Estimates
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Phase 3 of the master build spec: "Every appropriate task can have:
-- Estimated: 2h 30m" and "ESTIMATE VS ACTUAL: Display Estimated,
-- Actual, Variance." Boardly already tracks ACTUAL time
-- (time_tracked_seconds, schema_v5) - this adds the other half, a
-- Deliberately its own readiness flag rather than folded into the Dev
-- Fields one, since this column can be added independently. In the
-- actual edit-modal UI though, it sits right next to Actual time
-- (which already lives inside the Dev Fields section) rather than
-- duplicating a second time display elsewhere - Estimate vs Actual is
-- only meaningful when both are visible together.
-- ===========================================================================

alter table public.tasks add column if not exists estimated_minutes integer;
