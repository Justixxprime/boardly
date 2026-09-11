-- ===========================================================================
-- BOARDLY 2.0: schema v65, Profitability Foundation
-- Run this once in the Supabase SQL Editor, after schema_v62 through v64.
-- Safe to re-run.
--
-- Section 10 of the brief wants, per project: revenue, expenses, tracked
-- time, estimated labour cost, projected profit, margin. Revenue comes
-- from invoices (schema_v62), expenses from transactions (schema_v62),
-- and tracked time already exists in time_entries (schema_v39). The one
-- thing missing to turn tracked hours into an estimated labour cost is
-- a rate, and that has to be set per project, not once for the whole
-- account, since different clients get billed at different rates. This
-- adds that one column. Nothing else changes.
--
-- Left null by default on purpose: showing "0 labour cost" before the
-- owner has ever set a rate would understate cost and overstate profit,
-- which is worse than just saying "set a rate to include labour cost."
-- ===========================================================================

alter table public.boards
  add column if not exists hourly_rate numeric(10,2);
