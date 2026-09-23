-- ==========================================================================
-- BOARDLY - schema_v94_widen_aal2_enforcement.sql
--
-- F6 Step B. Before writing anything here, checked live state via MCP and
-- found this step was already done - more thoroughly than planned - by
-- work happening on another Boardly account at the same time (Justice
-- works across more than one Claude account, always comes back to each
-- one, per the standing working rules).
--
-- What was already live: every public table, plus storage.objects, has a
-- RESTRICTIVE policy named "require_aal2_when_enrolled" built on a
-- function called mfa_ok(). Read both mfa_ok() and this session's earlier
-- requires_aal2() side by side - they do the exact same check (if you
-- have a verified MFA factor, your session must show aal2; if you never
-- turned MFA on, nothing changes for you). No bug found in either.
--
-- That left three tables (invoices, transactions,
-- marketplace_provider_payouts) with TWO restrictive policies doing the
-- identical check - the original schema_v93 one plus the new sweep's one.
-- Not a bug (two RESTRICTIVE policies both have to pass, and they always
-- agree), just clutter. This migration is the cleanup: drop the three old
-- schema_v93 policies, keep the one already covering everything.
--
-- requires_aal2() itself is left in place, unused, rather than dropped -
-- dropping a function while a parallel session might still reference it
-- is exactly the kind of cross-account collision the handoff notes exist
-- to prevent. It costs nothing sitting there unused.
--
-- Net result of this whole step: every table in the project now requires
-- a verified second factor for someone who has turned MFA on, using one
-- single function and one single policy name. Nothing left to widen.
-- ==========================================================================

drop policy if exists "require_aal2_if_mfa_enrolled" on invoices;
drop policy if exists "require_aal2_if_mfa_enrolled" on transactions;
drop policy if exists "require_aal2_if_mfa_enrolled" on marketplace_provider_payouts;
