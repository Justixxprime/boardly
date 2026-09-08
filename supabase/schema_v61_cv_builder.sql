-- ===========================================================================
-- BOARDLY - schema v61: CV Builder (resumes)
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- A real CV/resume builder - personal info, summary, work experience,
-- education, skills, projects, certifications, languages - with three
-- distinct print-ready templates and a PDF download. Unlike everything
-- built so far this phase, a resume isn't board content at all - it's
-- personal to the account, the same way Settings is, so this table is
-- user-scoped with no board_id column and no board-membership RLS to
-- reason about.
-- ===========================================================================

create table if not exists public.resumes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null default 'Untitled CV',
  template      text not null default 'ledger' check (template in ('ledger', 'studio', 'field')),
  accent_color  text not null default 'orange' check (accent_color in ('orange', 'teal', 'violet', 'pink')),
  -- Everything the person has typed - personal info, summary, and every
  -- repeatable section (experience/education/skills/projects/
  -- certifications/languages) - as one jsonb blob. A resume's own
  -- internal shape changes far more often during editing (add a
  -- bullet, reorder two jobs, add a language) than it needs querying
  -- from SQL, so one flexible column beats a dozen narrow ones here.
  data          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.resumes enable row level security;

create index if not exists idx_resumes_user_id on public.resumes(user_id);

-- Reuses the same generic updated_at trigger function schema_v19 and
-- schema_v60 already share - it's just `new.updated_at = now()`,
-- nothing table-specific about it.
drop trigger if exists set_resumes_updated_at on public.resumes;
create trigger set_resumes_updated_at
  before update on public.resumes
  for each row execute function public.set_task_updated_at();

drop policy if exists "Users manage their own resumes" on public.resumes;
create policy "Users manage their own resumes"
  on public.resumes for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
