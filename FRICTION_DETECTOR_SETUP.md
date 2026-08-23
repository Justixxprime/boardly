# Setting up the Friction Detector

## Step 1: run the database migration

Supabase dashboard → SQL Editor → New query → paste the whole contents
of `supabase/schema_v26_friction_detector.sql` → Run.

Adds two small counters to your tasks table (`postponement_count`,
`reopen_count`) and a trigger that keeps them updated automatically -
nothing in the app has to remember to do it, so it can't be missed.

## Step 2: that's it - no Edge Function, no secrets

## What it tracks, and why

- **Postponed** - counts every time a task's due date gets pushed to a
  LATER date than it was before. Setting a due date for the first
  time, or moving one earlier, doesn't count.
- **Reopened** - counts every time a task marked Done gets un-done
  again.

Both start at zero for every task and only start counting from the
moment this migration runs - it can't retroactively count changes that
already happened before today.

## Where it shows up

Insights → **"Tasks that keep coming back"**. A task only appears
here once it's been pushed back 3+ times, or reopened 2+ times, and
only while it's still open - the moment it's actually finished, it
drops off the list. The idea isn't to nag about every small delay,
only to notice the pattern once it's clearly a pattern.

## Why this matters

A task that keeps getting pushed back usually isn't a scheduling
problem - it's often a sign the task itself is too vague, too big, or
quietly blocked on something that was never written down. Seeing it
laid out like this is a nudge to actually break it down, delegate it,
or decide it's not really worth doing, rather than pushing the due
date one more time out of habit.
