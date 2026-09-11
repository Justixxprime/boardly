-- ===========================================================================
-- BOARDLY 2.0: schema v64, Client CRM Foundation
-- Run this once in the Supabase SQL Editor, after schema_v62 and v63.
-- Safe to re-run, same convention as every prior schema file.
--
-- Per the Phase 0 audit, Section 9 (Feature gaps): "no clients or leads
-- objects exist, board_members is authentication/collaboration, not a
-- sales record." This is that missing object, scoped narrowly like
-- Money Foundation was: a real client record and a way to link an
-- invoice to one, not the full lead pipeline (Section 14) or follow-up
-- engine (Section 15) from the brief yet. Those are real future work,
-- not built here.
-- ===========================================================================

create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  company     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.clients enable row level security;
create index if not exists idx_clients_user_id on public.clients(user_id);

drop policy if exists "Users manage their own clients" on public.clients;
create policy "Users manage their own clients"
  on public.clients for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Invoices keep client_name/client_email as free text (an invoice can
-- still be billed to someone who isn't a saved client record), and this
-- adds an OPTIONAL link to a real client for the ones that are. Nothing
-- about existing invoices changes, client_id is null on every row that
-- existed before this migration.
alter table public.invoices
  add column if not exists client_id uuid references public.clients(id) on delete set null;

create index if not exists idx_invoices_client_id on public.invoices(client_id);
