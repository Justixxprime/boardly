# Setting up: Task Estimates (Estimate vs Actual)

Phase 3 of the master build spec. Boardly already tracks ACTUAL time
spent on a ticket (Start/Stop timer, schema_v5). This adds the other
half: a plain estimate to compare it against.

## Step 1: run the migration

In the Supabase SQL Editor, run `supabase/schema_v54_task_estimates.sql`.

## Step 2: copy the files in, then push

```
git add .
git commit -m "Add Task Estimates (Phase 3)"
git push
```

## Step 3: test it

1. Open a ticket with Dev Fields enabled (this sits right next to the
   existing time tracker, inside that same section).
2. Enter a number of hours in "Estimated" - decimals work (e.g. 1.5
   for an hour and a half).
3. Start the timer, let a little time pass, stop it.
4. Reopen the ticket - you should see "Actual so far: [time] (+/-
   variance)" next to the estimate, in red if running over, teal if
   still under.

## Why this lives inside Dev Fields instead of being universal

The comparison is only meaningful once both numbers are visible -
Actual time already only shows up when Dev Fields is enabled, so
putting Estimate anywhere else would mean either duplicating the whole
time-tracking display in a second place, or showing an estimate with
nothing to compare it against. The `estimated_minutes` column itself
has its own readiness check though (separate from Dev Fields'), so it
can be wired into other boards' views later without needing to touch
this migration again.
