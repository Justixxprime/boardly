# Setting up Commitments

## Step 1: run the database migration

Supabase dashboard → SQL Editor → New query → paste the whole contents
of `supabase/schema_v24_commitment_guardian.sql` → Run.

Adds one new table, `commitments`. Nothing existing is touched, and
it's private to you, same simple rule as your tasks.

## Step 2: that's it - no Edge Function, no secrets

## Why this is separate from your tasks and from "Waiting on"

- A regular ticket is work you're doing.
- **Waiting on** (a related feature - see `WAITING_ROOM_SETUP.md`) is
  something you need from someone ELSE.
- **Commitments** is the mirror image: something you promised TO
  someone else. "I told the client the site would be live Friday." "I
  promised my student I'd review their essay tomorrow."

Breaking a commitment isn't just "a task is late" - it's someone being
let down. Boardly can't tell the difference from an ordinary due date,
so this keeps commitments visibly separate with their own safety
status, instead of blending in with everything else on the board.

## How the status works

Computed live every time you open the list, from today's date and the
due date you gave it - nothing is stored as "at risk," it's figured
out fresh each time, so it's always accurate:

- **Safe** - due date is more than a day away, or there's no date set.
- **At risk** - due today or tomorrow.
- **Missed** - the due date has passed and it's still open.

## What this does not do yet

- No automatic reminders or notifications when something slips into
  "At risk" or "Missed" - you have to open the Commitments list to
  see it. Wiring this into Boardly's existing push notifications is a
  reasonable next step, not built here.
- "To whom" is just a name you type, not a linked contact record.
