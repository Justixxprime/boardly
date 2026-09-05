# Setting up: Project Baseline

Phase 2 of the master build spec, the last piece of the "core work
engine" phase: saving an original plan, and comparing it against what
actually happened later.

## Step 1: run the migration

In the Supabase SQL Editor, run `supabase/schema_v53_project_baselines.sql`.

## Step 2: copy the files in, then push

```
git add .
git commit -m "Add Project Baseline (Phase 2)"
git push
```

## Step 3: test it

1. Open the board menu (next to the board name) → **Project baseline**.
2. Click "Save current plan" - give it a name like "Kickoff plan."
3. Go make some real changes: add a ticket, delete another, push a due
   date back a few days, move a milestone's target date.
4. Reopen Project Baseline - you should see: the ticket count then vs
   now, which tickets were added, which no longer exist, which due
   dates changed (with the before/after date), and any milestone date
   that moved.
5. If you have more than one saved baseline, the dropdown lets you
   compare against any of them, not just the most recent.

## What this can and can't tell you

A baseline is a frozen snapshot - title, due date, status, and
milestone for every ticket, plus every milestone's own target date, at
the exact moment you saved it. It can tell you precisely what changed
in scope (added/removed tickets) and schedule (due dates, milestone
dates) since that moment. It can't tell you WHY something changed, or
whether a change was good or bad - that part is still a judgment call
for you to make, the same way the rest of Boardly's analysis features
(Board Health, Critical Path) hand you real facts rather than an
opinion dressed up as one.
