-- ===========================================================================
-- BOARDLY 2.0: schema v66, Lead Pipeline
-- Run this once in the Supabase SQL Editor, after schema_v64_clients.sql.
-- Safe to re-run.
--
-- Per Section 14 of the brief: New, Contacted, Qualified, Proposal,
-- Negotiation, Won, Onboarding, Active Client. Rather than a separate
-- `leads` table that later needs converting into a `clients` row (the
-- exact awkward hand-off Section 14 itself is trying to avoid), a lead
-- and a client are modeled as the same row moving through a stage,
-- using the `clients` table schema_v64 already created. A "lead" is
-- just a client whose stage is not yet 'active_client'.
--
-- Existing rows default to 'active_client': every client already in the
-- table before this migration was, by definition, already a real
-- working relationship, not a fresh lead, defaulting them into 'new'
-- would be factually wrong and would flood the Leads view with people
-- who are already clients.
-- ===========================================================================

alter table public.clients
  add column if not exists pipeline_stage text not null default 'active_client'
    check (pipeline_stage in ('new','contacted','qualified','proposal','negotiation','won','onboarding','active_client'));

create index if not exists idx_clients_pipeline_stage on public.clients(pipeline_stage);
