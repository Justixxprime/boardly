-- ==========================================================================
-- BOARDLY - schema v32 migration: Classroom v2 (real rosters, per-student
-- gradebook, grading rubrics)
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Safe to run once - four new tables only, nothing existing changes.
--
-- WHY THIS EXISTS:
-- Classroom v1 (schema_v14's metadata.student_name + js/classroom.js) was
-- explicitly scoped as a first honest step - a lesson's "student" was
-- just a text field, and grading a lesson wrote one grade string onto
-- the whole ticket. That's fine for a one-on-one tutor, but it can't
-- represent "this lesson is for my whole Grade 9 Biology class, and I
-- need a separate grade for each of the 24 kids in it." This migration
-- adds the three things v1's own doc said were missing: a real student
-- roster per class, one grade per student per assignment (not one grade
-- per ticket), and reusable grading rubrics that add up points for you.
--
-- BACKWARDS COMPATIBLE ON PURPOSE: a class with no roster rows keeps
-- working exactly like v1 always has (one free-text grade on the
-- ticket) - js/classroom.js only switches to the new per-student view
-- once you've actually added students to that class's roster. Nothing
-- about existing lessons, grades, or boards changes just from running
-- this file.
-- ==========================================================================

-- ---------------------------------------------------------------------
-- 1. CLASS_ROSTERS - real, named students belonging to a class on a
-- given board. "Class" here is just whatever text you've been typing
-- into a lesson's "Class" field (metadata.class_name) - this doesn't
-- rename or restructure that, it just gives it a real list of people.
-- ---------------------------------------------------------------------
create table if not exists class_rosters (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references boards(id) on delete cascade,
  class_name    text not null,
  student_name  text not null,
  student_email text,
  notes         text,
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table class_rosters enable row level security;

create index if not exists class_rosters_board_class_idx
  on class_rosters (board_id, class_name) where archived = false;

-- ---------------------------------------------------------------------
-- 2. GRADING_RUBRICS + RUBRIC_CRITERIA - a reusable scoring template
-- per board (e.g. "Essay rubric: Thesis /10, Evidence /10, Grammar /5").
-- board_id is denormalized onto rubric_criteria too, same reasoning
-- schema_v17's task_comments already uses ("denormalized for a simple
-- RLS check") - it avoids the policy having to join back to
-- grading_rubrics just to find out which board a criterion belongs to.
-- ---------------------------------------------------------------------
create table if not exists grading_rubrics (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references boards(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

alter table grading_rubrics enable row level security;

create table if not exists rubric_criteria (
  id          uuid primary key default gen_random_uuid(),
  rubric_id   uuid not null references grading_rubrics(id) on delete cascade,
  board_id    uuid not null references boards(id) on delete cascade,
  label       text not null,
  max_points  numeric not null default 10,
  sort_order  int not null default 0
);

alter table rubric_criteria enable row level security;

create index if not exists rubric_criteria_rubric_idx on rubric_criteria (rubric_id, sort_order);

-- ---------------------------------------------------------------------
-- 3. ASSIGNMENT_GRADES - the actual gradebook. One row per student per
-- lesson/assignment (task). class_name is denormalized from the task's
-- own metadata at the moment of grading, purely so the class-average
-- chip and the CSV export can read it directly without joining back to
-- tasks.metadata on every page load.
-- ---------------------------------------------------------------------
create table if not exists assignment_grades (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid not null references tasks(id) on delete cascade,
  board_id         uuid not null references boards(id) on delete cascade,
  class_name       text,
  student_name     text not null,
  roster_id        uuid references class_rosters(id) on delete set null,
  grade_label      text,       -- free-text grade when no rubric is used, e.g. "18/20", "A", "Pass" - same idea v1's metadata.grade always was
  score            numeric,    -- only set when a rubric computed a numeric total
  max_score        numeric,    -- only set when a rubric computed a numeric total
  criteria_scores  jsonb not null default '{}'::jsonb,  -- {criterion_id: {points, note}}, only set when a rubric was used
  feedback         text,
  graded_at        timestamptz not null default now(),
  unique (task_id, student_name)
);

alter table assignment_grades enable row level security;

create index if not exists assignment_grades_board_class_idx on assignment_grades (board_id, class_name);
create index if not exists assignment_grades_task_idx on assignment_grades (task_id);

-- ---------------------------------------------------------------------
-- 4. RLS - same shape as schema_v17's task_comments: the board owner or
-- an accepted board member can read; the owner or an accepted EDITOR
-- member can write. Reuses the two helper functions schema_v17 already
-- created (public.user_owns_board / public.user_is_board_member) rather
-- than redefining them.
-- ---------------------------------------------------------------------
create policy "Board access can read rosters"
  on class_rosters for select
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id));
create policy "Board editors can write rosters"
  on class_rosters for insert
  with check (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));
create policy "Board editors can update rosters"
  on class_rosters for update
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));
create policy "Board editors can delete rosters"
  on class_rosters for delete
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));

create policy "Board access can read rubrics"
  on grading_rubrics for select
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id));
create policy "Board editors can write rubrics"
  on grading_rubrics for insert
  with check (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));
create policy "Board editors can update rubrics"
  on grading_rubrics for update
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));
create policy "Board editors can delete rubrics"
  on grading_rubrics for delete
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));

create policy "Board access can read rubric criteria"
  on rubric_criteria for select
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id));
create policy "Board editors can write rubric criteria"
  on rubric_criteria for insert
  with check (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));
create policy "Board editors can update rubric criteria"
  on rubric_criteria for update
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));
create policy "Board editors can delete rubric criteria"
  on rubric_criteria for delete
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));

create policy "Board access can read grades"
  on assignment_grades for select
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id));
create policy "Board editors can write grades"
  on assignment_grades for insert
  with check (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));
create policy "Board editors can update grades"
  on assignment_grades for update
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));
create policy "Board editors can delete grades"
  on assignment_grades for delete
  using (public.user_owns_board(board_id) or public.user_is_board_member(board_id, true));

-- ---------------------------------------------------------------------
-- 5. Realtime - so a co-teacher (schema_v17 board member) sees new
-- roster entries, rubrics, and grades appear live, same as tasks and
-- comments already do.
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table class_rosters;
alter publication supabase_realtime add table grading_rubrics;
alter publication supabase_realtime add table rubric_criteria;
alter publication supabase_realtime add table assignment_grades;

-- ==========================================================================
-- Done. Reload dashboard.html, open a Teaching board, and tap Classroom.
-- You'll see two new buttons - Roster and Rubrics - next to the search
-- box. Add students to a class's roster, and the next time you grade a
-- lesson for that class, you'll get one row per student instead of one
-- note for the whole lesson. Attaching a rubric while grading (roster or
-- no roster) adds up its criteria into a score automatically.
-- ==========================================================================
