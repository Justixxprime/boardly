# Setting up "Waiting on"

## Step 1: run the database migration

Supabase dashboard → SQL Editor → New query → paste the whole contents
of `supabase/schema_v23_waiting_room.sql` → Run.

Adds one new table, `waiting_items`. Nothing existing is touched, and
it's completely private to you, same simple rule as your tasks.

## Step 2: that's it - no Edge Function, no secrets

Everything runs directly between the browser and the database.

## Why this is separate from your tasks

A normal ticket is something you can go do right now. A "waiting on"
item is different - the next move belongs to someone else: a client's
approval, a teacher's feedback, a delivery on its way. There's nothing
to check off, only something to mark resolved once they actually get
back to you. Mixing the two into one list makes both harder to read at
a glance, so this keeps them apart on purpose.

## How to use it

1. Click **Waiting on** in the board toolbar.
2. Type what you're waiting for, optionally who it's from, and whether
   it's important.
3. Each item quietly shows how many days it's been sitting - the
   color shifts from neutral, to orange after 3 days, to red after a
   week, so the ones worth a nudge stand out without anything shouting
   at you.
4. Once you hear back, tap the checkmark to mark it resolved.

## What this does not do yet

- No automatic reminders yet to actually follow up (e.g. "it's been a
  week, maybe ping them") - that's the kind of thing a future
  Commitment Guardian / Deadline Firewall feature would naturally
  build on top of this, not included here.
- "Who" is just a name you type, not a real linked contact - Boardly
  doesn't have a people/contacts system yet.
