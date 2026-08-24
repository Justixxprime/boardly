# Setting up "Good morning"

## Nothing new to run in Supabase, on its own

This screen doesn't add any new table - it's a view built entirely
from features that already exist. What it actually shows depends on
which of those you've already set up:

| Section | Needs |
|---|---|
| Today's priorities | Nothing extra - always works |
| Focus | Nothing extra - always works |
| At risk (commitments) | `COMMITMENT_GUARDIAN_SETUP.md` |
| At risk (workload) | Nothing extra - always works |
| People | `WAITING_ROOM_SETUP.md` |
| Ask AI for a full plan | `AI_SETUP_BABY_STEPS.md` |

Any section whose feature isn't set up yet just doesn't show, quietly
- nothing errors, nothing looks broken.

## Why "Money" and "Meetings" aren't here

The original idea for this screen (in the "Boardly 2.0" plan)
mentioned a money section and a meetings section. Boardly doesn't
track real invoices, or a real calendar of meetings distinct from
ordinary tasks - showing either would mean either making up numbers or
mislabeling a task as something it isn't. Only sections backed by
real data made it into this first version. If Boardly grows real
invoicing or meeting-specific tracking later, those sections have an
honest reason to exist then.

## How to use it

Click **Good morning** in the board toolbar any time - it's not tied
to the actual time of day, use it whenever you want a reset. It shows:

- What's due today (overdue things marked clearly)
- Anything at risk - a commitment close to being broken, or your
  overall workload running heavy
- Anyone you're waiting on
- One single task to focus on first, chosen automatically (whatever's
  most overdue, or the oldest thing still open if nothing's due)

**Start my day** just closes the screen - it's meant as a small,
deliberate moment of "okay, I've looked at it, now go," not a button
that does anything behind the scenes.

**Ask AI for a full plan** hands off to the same AI briefing Boardly
already has, opened in the AI panel.
