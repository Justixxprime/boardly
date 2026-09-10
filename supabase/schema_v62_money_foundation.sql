-- ===========================================================================
-- BOARDLY 2.0 - schema v62: Money Foundation
-- Run this once in the Supabase SQL Editor. Safe to re-run (create table
-- if not exists / drop+recreate policies, same convention as every prior
-- schema file in this project).
--
-- Per the Boardly 2.0 brief, Section 9: "Money Center is the single
-- largest gap and the one most directly tied to the brief's core
-- positioning." Nothing in this file processes a real payment or talks
-- to a payment gateway - it is deliberately scoped to the honest, real
-- thing a solo/small-team owner needs first: create an invoice, send a
-- client a link to view it, and record money that actually moved
-- (bank transfer, cash, card-in-person, etc.) as a ledger entry against
-- it. Real gateway integration (Paystack invoice payments, webhooks,
-- idempotency keys) is a deliberate NEXT increment, not faked here - see
-- the note on `transactions.provider` below.
--
-- SCOPE DECISION: unlike Proposals/Documents (which are board_id NOT
-- NULL, scoped to one project), invoices here are OWNER-scoped with an
-- OPTIONAL board_id. Money Center is meant to be a cross-project, whole-
-- business view (Section 8's "Business Pulse"), not a per-board feature -
-- tying every invoice to exactly one board would work against that from
-- day one. A board_id link is still offered for when an invoice really
-- is for one specific project's work.
-- ===========================================================================

create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  board_id       uuid references public.boards(id) on delete set null,
  client_name    text,
  client_email   text,
  title          text not null,
  notes          text,
  -- Same shape and same reasoning as proposals.line_items: the array is
  -- the single source of truth for the total, computed fresh every time
  -- (client-side for display, again server-side before anything is shown
  -- to a client) rather than cached in a column that can drift.
  line_items     jsonb not null default '[]'::jsonb,
  currency       text not null default 'NGN',
  status         text not null default 'draft'
                   check (status in ('draft','sent','viewed','partially_paid','paid','overdue','cancelled','refunded')),
  issue_date     date not null default current_date,
  due_date       date,
  public_token   uuid unique not null default gen_random_uuid(),
  viewed_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.invoices enable row level security;
create index if not exists idx_invoices_user_id on public.invoices(user_id);
create index if not exists idx_invoices_board_id on public.invoices(board_id);
create index if not exists idx_invoices_status on public.invoices(status);

-- Owner-only, same precedent as proposals/custom_forms/automation_rules -
-- an invoice is a financial document going out under the owner's name.
drop policy if exists "Users manage their own invoices" on public.invoices;
create policy "Users manage their own invoices"
  on public.invoices for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No public policy - same reasoning as every other public-link table in
-- this project. get-invoice-info (a service-role Edge Function) is the
-- only way the public invoice page can read one, and it deliberately
-- never exposes an UPDATE path to the public - viewing an invoice can
-- never itself change money owed, only its own viewed_at/status.


-- ===========================================================================
-- Transactions: a single, append-mostly ledger table covering payments,
-- refunds, payouts, AND expenses (Sections 9 and 11 of the brief). One
-- table rather than two, because an "expense" and a "payment received"
-- are the same shape of fact (money moved, on a date, in a currency,
-- for a reason) - keeping them in one ledger is what actually lets a
-- profitability view (Section 10, not built yet) sum both sides
-- correctly later, and it's what Section 9 means by "transaction ledger."
--
-- HONESTY NOTE (do not remove this comment): every row inserted through
-- the dashboard UI this session is entered BY THE OWNER as their own
-- bookkeeping record ("I received a bank transfer for this invoice on
-- this date") - not a client or anonymous party self-reporting that
-- they paid. That is categorically different from the thing Section 9
-- warns against ("never mark a transaction paid purely because a
-- frontend button was clicked" - meaning a payer's own claim of success).
-- `provider` is 'manual' for every row created this way. A real payment
-- gateway integration (provider='paystack', provider_reference set from
-- an actual verified webhook, idempotency_key enforced) is real,
-- necessary future work - not present yet, and nothing here should be
-- read as claiming it is.
-- ===========================================================================
create table if not exists public.transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  board_id         uuid references public.boards(id) on delete set null,
  invoice_id       uuid references public.invoices(id) on delete set null,
  type             text not null check (type in ('payment','refund','expense','payout')),
  amount           numeric(14,2) not null check (amount >= 0),
  currency         text not null default 'NGN',
  -- populated for type='expense' only
  category         text,
  receipt_url      text,
  -- how the money actually moved - 'manual' for every row this session;
  -- reserved for 'paystack' etc. once a real gateway is wired in
  provider         text not null default 'manual',
  provider_reference text,
  idempotency_key  text unique,
  method           text,          -- e.g. bank_transfer, cash, card, other
  notes            text,
  occurred_at      date not null default current_date,
  created_at       timestamptz not null default now()
);

alter table public.transactions enable row level security;
create index if not exists idx_transactions_user_id on public.transactions(user_id);
create index if not exists idx_transactions_invoice_id on public.transactions(invoice_id);
create index if not exists idx_transactions_type on public.transactions(type);
create index if not exists idx_transactions_occurred_at on public.transactions(occurred_at);

drop policy if exists "Users manage their own transactions" on public.transactions;
create policy "Users manage their own transactions"
  on public.transactions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
