# Setting up Decisions

## Step 1: run the database migration

Supabase dashboard → SQL Editor → New query → paste the whole contents
of `supabase/schema_v25_decision_ledger.sql` → Run.

Adds one new table, `decisions`. Nothing existing is touched, and it's
private to you, same simple rule as your tasks.

## Step 2: that's it - no Edge Function, no secrets

## Why this exists

A ticket tells you WHAT needs doing. Nothing in Boardly captured WHY a
meaningful choice was made - why you picked one vendor over another,
why a feature got dropped, what you considered and passed on. Six
months later, that reasoning is usually gone, and the same debate
happens all over again from scratch. This is a small, deliberately
simple place to write it down once, while it's still fresh.

## How to use it

1. Click **Decisions** in the board toolbar.
2. Fill in what you decided. The reason and alternatives are optional,
   but worth the extra ten seconds while it's still clear in your head.
3. If it's the kind of decision that might need revisiting later (a
   trial arrangement, a temporary fix), set a "Revisit by" date - it
   shows up flagged once that date arrives.
4. Delete any decision once it's no longer relevant.

## What this does not do yet

- No "actual outcome" field shown in the quick-add form yet, even
  though the database has room for one (`actual_outcome`) - filling
  that in later, once you know how a decision played out, would need
  its own small edit screen, not built here yet.
- Decisions aren't currently searchable from Boardly's command palette
  (Ctrl+K) - a reasonable next step, not included in this first pass.
