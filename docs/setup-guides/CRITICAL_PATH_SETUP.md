# Setting up: Critical Path

Phase 2 of the master build spec. No new database changes - this reads
the dependency data that already exists (Dev Fields' "Blocked by," and
the new Task Links from schema_v52) and calculates something real from
it, rather than adding another thing to set up.

## An honest note on what this actually calculates

The spec describes "critical path" the way real project-management
tools do it: using task DURATIONS (a start date and an estimated
length for every task) to compute the exact earliest/latest possible
finish date. Boardly's tickets don't carry that kind of data - just
due dates and dependency links, not durations.

Rather than fake that calculation on data that doesn't exist, this
computes the honest version Boardly's actual data supports: the
**longest chain of tickets that have to happen one after another**
before the last one can finish. That chain is still the real thing
that determines how soon the work can wrap up - just measured in
"how many tickets deep" rather than "how many days," since Boardly
doesn't reliably know how many days any given ticket will take.

If a board has no dependency data recorded at all (no "Blocked by,"
no Task Links), this says so plainly instead of pretending every
ticket is equally critical.

## Step 1: nothing to run

This is pure client-side logic reading data from schema_v11 (Dev
Fields) and schema_v52 (Task Links). If you haven't run
`schema_v52_task_links.sql` yet, do that first if you want links
(not just "Blocked by") to count toward this.

## Step 2: copy the files in, then push

```
git add .
git commit -m "Add Critical Path (Phase 2)"
git push
```

## Step 3: test it

1. Set up a real dependency chain: Ticket A blocked by nothing, Ticket
   B blocked by A, Ticket C blocked by B (or use Task Links' "Blocks"/
   "Precedes" instead - both count).
2. Open the board menu (next to the board name) → **Critical path**.
3. You should see A → B → C listed in order, each with its due date if
   one is set.
4. Give Ticket A a due date LATER than Ticket B's - you should see a
   scheduling conflict flagged ("B is due before A, which it depends
   on").
5. On a board with no dependency data at all, Critical Path should say
   so plainly rather than showing something misleading.

## What "downstream impact" means

The ticket at the very start of the longest chain is usually the one
quietly holding up the most other work - this shows exactly how many
other active tickets are waiting behind it, directly or through other
tickets in between, so it's obvious which single ticket is actually
worth prioritizing first.
