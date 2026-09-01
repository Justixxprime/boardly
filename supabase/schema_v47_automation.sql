-- ===========================================================================
-- BOARDLY - schema v47 migration: Boardly Autopilot
--
-- Run this in Supabase SQL Editor. Adds two new tables. Nothing existing
-- is touched.
--
-- Scoped deliberately tight for v1, matching Boardly's real data model
-- rather than a generic automation builder: ONE trigger shape (a ticket
-- moved TO a given status), ONE optional condition (category), and
-- THREE actions (move it again, assign it, or notify someone). This
-- covers real, common cases - "when something's marked Done, notify
-- me" - without pretending to support conditions Boardly doesn't
-- actually have data for yet (there's no priority field, no custom
-- labels).
-- ===========================================================================

create table if not exists public.automation_rules (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  board_id           uuid not null references public.boards(id) on delete cascade,
  name               text not null,
  enabled            boolean not null default true,
  trigger_to_status  text not null check (trigger_to_status in ('todo', 'inprogress', 'done')),
  condition_category text, -- null = fires for any category
  action_type        text not null check (action_type in ('move_to_status', 'assign_to', 'notify')),
  action_value       text, -- target status for move_to_status; a user id for assign_to/notify
  created_at         timestamptz not null default now()
);

alter table public.automation_rules enable row level security;

drop policy if exists "Users can view their own automation rules" on public.automation_rules;
create policy "Users can view their own automation rules"
  on public.automation_rules for select using (user_id = auth.uid());
drop policy if exists "Users can create their own automation rules" on public.automation_rules;
create policy "Users can create their own automation rules"
  on public.automation_rules for insert with check (user_id = auth.uid());
drop policy if exists "Users can update their own automation rules" on public.automation_rules;
create policy "Users can update their own automation rules"
  on public.automation_rules for update using (user_id = auth.uid());
drop policy if exists "Users can delete their own automation rules" on public.automation_rules;
create policy "Users can delete their own automation rules"
  on public.automation_rules for delete using (user_id = auth.uid());

create index if not exists automation_rules_board_idx on public.automation_rules (board_id, enabled);

-- Every run gets logged here - success or failure - matching the master
-- spec's own rule: "Never silently fail." This is what a rule's history
-- panel reads from, and it's also the loop-prevention paper trail: a
-- run stopped for looking like a loop still gets a row, marked as such,
-- rather than just vanishing.
create table if not exists public.automation_runs (
  id             uuid primary key default gen_random_uuid(),
  rule_id        uuid references public.automation_rules(id) on delete cascade,
  task_id        uuid references public.tasks(id) on delete set null,
  ran_at         timestamptz not null default now(),
  success        boolean not null,
  summary        text not null
);

alter table public.automation_runs enable row level security;

drop policy if exists "Users can view runs of their own rules" on public.automation_runs;
create policy "Users can view runs of their own rules"
  on public.automation_runs for select
  using (exists (select 1 from public.automation_rules r where r.id = rule_id and r.user_id = auth.uid()));

drop policy if exists "Users can log runs of their own rules" on public.automation_runs;
create policy "Users can log runs of their own rules"
  on public.automation_runs for insert
  with check (exists (select 1 from public.automation_rules r where r.id = rule_id and r.user_id = auth.uid()));

create index if not exists automation_runs_rule_idx on public.automation_runs (rule_id, ran_at desc);
