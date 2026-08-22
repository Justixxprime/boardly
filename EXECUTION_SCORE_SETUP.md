# Setting up the Execution Score

## Step 1: nothing extra, if you already have Commitments set up

The score reads from your tasks (always available) and your
commitments (needs `supabase/schema_v24_commitment_guardian.sql` -
see `COMMITMENT_GUARDIAN_SETUP.md` if you haven't run that yet). If
you haven't, the score still works, it just leaves out the
"Commitments kept" part and averages the rest.

No Edge Function, no secrets - this is computed entirely in your
browser from data you already have.

---

## Why this exists, and why it looks different from your level/streak

Boardly already has a level, XP, and streak system, and that one's
meant to feel fun - a little game layered on top of getting things
done. This is deliberately the opposite: a plain, honest number meant
to answer "am I actually reliable at finishing what I say I will,"
without cheering you on or making it feel like a toy. It shows up on
your Insights page, not mixed in with the playful stuff.

## Exactly how it's calculated - nothing hidden

The overall number is a plain average of four parts, and any part
that doesn't have enough data yet (say, you've never set a due date)
is simply left out of the average rather than counted as a zero:

**1. Completion** - tasks marked done, divided by all your tasks.
Nothing fancier than that.

**2. Deadlines kept** - out of tasks that BOTH had a due date AND are
now done, what share were actually finished on or before that date.
A task with no due date doesn't affect this number at all, in either
direction.

**3. Commitments kept** - out of your commitments that have already
been decided one way or the other (either you marked it kept, or its
due date has already passed), what share were kept on time. A
commitment still open and not yet due isn't counted yet - it hasn't
been decided.

**4. Consistency** - out of the last 14 days, how many had at least
one task completed on them. This is what tells apart "worked
steadily most days" from "did nothing for two weeks then finished ten
things in one afternoon" - both of those could show the same
completion rate above, this part is what actually tells them apart.

## What this does not do yet

- Doesn't factor in focus/timer sessions yet, even though Boardly
  tracks those (Focus Reactor) - a reasonable future addition, not
  built here.
- Doesn't weight recent behavior more heavily than older behavior -
  every task ever created counts equally toward "Completion," for
  example, rather than recent weeks mattering more.
