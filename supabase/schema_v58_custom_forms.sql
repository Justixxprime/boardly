-- ===========================================================================
-- BOARDLY - schema v58: Custom Form Builder
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Phase 5 of the master build spec: Forms + Automation. Boardly already
-- has the Public Request Portal (schema_v45, one fixed shape: name,
-- email, title, details) and Boardly Autopilot (schema_v47, WHEN/IF/THEN
-- on ticket status). What's genuinely still missing is a general-purpose
-- form builder - one where YOU define the fields, not Boardly. A
-- freelancer's "New client intake" form needs completely different
-- questions than a "Bug report" form; the fixed Request Portal shape
-- can't be either of those well.
--
-- Two tables:
--   custom_forms             - the form definition itself (name, the
--                               field list as jsonb, its own publish
--                               token, which status new tickets land in)
--   custom_form_submissions  - one row per person who filled it out,
--                               linked to the ticket it created
--
-- One board can have SEVERAL forms (unlike the Request Portal, which is
-- one link per board) - a "Bug report" form and a "New client intake"
-- form living side by side, each with its own separate link.
-- ===========================================================================

create table if not exists public.custom_forms (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references public.boards(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  description   text,
  -- Array of { id, label, type, required, options, useAsTitle }.
  -- type is one of: text, textarea, number, date, select, checkbox.
  -- options is only present (and only meaningful) for type "select".
  -- Exactly one field is expected to carry useAsTitle: true - the
  -- Edge Function falls back to a generic title if none do, rather
  -- than rejecting the submission over it.
  fields        jsonb not null default '[]'::jsonb,
  -- Its OWN separate token, per the same rule every other public link
  -- in this project follows (share_token, roadmap_public_token,
  -- request_portal_token): never reused across link types, so one
  -- link being handed out widely can never also unlock something more
  -- private.
  public_token  uuid unique not null default gen_random_uuid(),
  published     boolean not null default false,
  target_status text not null default 'todo' check (target_status in ('todo', 'inprogress', 'done')),
  created_at    timestamptz not null default now()
);

alter table public.custom_forms enable row level security;

create index if not exists idx_custom_forms_board_id on public.custom_forms(board_id);

-- Owner-only for v1, matching Boardly Autopilot's own rules table
-- (schema_v47's automation_rules is user_id = auth.uid() only, not
-- board-member-inclusive either) - a real "let an editor collaborator
-- also build forms" pass can extend this later the same way schema_v50
-- extended several owner-only tables to include editor members, but
-- that's a deliberate, separate decision, not assumed here.
drop policy if exists "Users manage their own custom forms" on public.custom_forms;
create policy "Users manage their own custom forms"
  on public.custom_forms for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.custom_form_submissions (
  id         uuid primary key default gen_random_uuid(),
  form_id    uuid not null references public.custom_forms(id) on delete cascade,
  board_id   uuid not null references public.boards(id) on delete cascade,
  task_id    uuid references public.tasks(id) on delete set null,
  answers    jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.custom_form_submissions enable row level security;

create index if not exists idx_custom_form_submissions_form_id on public.custom_form_submissions(form_id);

-- WHY THIS TABLE HAS NO PUBLIC INSERT POLICY AT ALL:
-- Same reasoning schema_v27 already wrote down for client_comments -
-- whoever fills out a public form has no Boardly account and no
-- auth.uid() to write a safe policy around. The only thing allowed to
-- decide "is this a genuine, published form's token" is server-side
-- code holding the service role key - the submit-custom-form Edge
-- Function - never a policy a browser could talk to directly. The
-- form's owner is a real authenticated user, so they read their own
-- submissions normally from their dashboard.
drop policy if exists "Board owners read their own form submissions" on public.custom_form_submissions;
create policy "Board owners read their own form submissions"
  on public.custom_form_submissions for select
  using (board_id in (select id from public.boards where user_id = auth.uid()));
