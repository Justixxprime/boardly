-- ==========================================================================
-- BOARDLY 2.0: schema_v92_squad_payouts.sql
-- Already run live against the Boardly Supabase project via MCP on
-- 22 Sep 2026, kept here only as a record and for setting up a second
-- Boardly project from scratch. Run in order after schema_v91.
--
-- What this does: Marketplace payout used to be Paystack-only, one
-- required column, paystack_recipient_code. Squad's own Transfer API
-- doesn't use recipient codes at all, it just needs the bank code,
-- account number and looked-up account name again at transfer time
-- (which the table already stores). So this:
--   1. Adds "provider" ('squad' by default) so a payout row remembers
--      which payment company it was actually set up with.
--   2. Makes paystack_recipient_code nullable, since a Squad payout row
--      will never have one.
-- Existing rows (set up before this change) are marked provider =
-- 'paystack' and keep working exactly as before, marketplace-release-
-- payment checks this column and still sends their money out through
-- Paystack. Only NEW payout setups go through Squad.
-- ==========================================================================

alter table public.marketplace_provider_payouts
  add column if not exists provider text not null default 'squad';

alter table public.marketplace_provider_payouts
  alter column paystack_recipient_code drop not null;

update public.marketplace_provider_payouts
  set provider = 'paystack'
  where paystack_recipient_code is not null;
