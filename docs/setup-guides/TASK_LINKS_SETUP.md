# Setting up: Task Links (richer dependencies)

Phase 2 of the master build spec: the ability to record more than just
"blocked by" between two tickets. Boardly already had a single
`blocked_by_id` field per ticket (from Dev Fields) - that's untouched
and still works exactly as it always has. This adds a separate table
for everything that couldn't do: more than one link per ticket, and
four relationship types that had no home in Boardly at all before now
(relates to, duplicates, precedes, parent/child).

## Step 1: run the migration

In the Supabase SQL Editor, run `supabase/schema_v52_task_links.sql`.

## Step 2: redeploy the board assistant

The AI's system prompt now explains this new data too, so it can use
real link information (not just blocked_by_id) when answering
questions like "why is this delayed":

```
supabase functions deploy board-assistant
```

## Step 3: copy the files in, then push

```
git add .
git commit -m "Add Task Links (Phase 2: richer dependencies)"
git push
```

## Step 4: test it

1. Open any ticket, scroll to "Linked tickets."
2. Pick a relationship type (Blocks, Relates to, Duplicates, Precedes,
   Is parent of), pick another ticket from the dropdown, click the +
   button.
3. Open the OTHER ticket in that link - you should see it listed too,
   but worded from its own point of view (e.g. if Ticket A "Blocks"
   Ticket B, opening Ticket B shows "Blocked by: Ticket A" - same
   underlying link, read from each side).
4. Remove a link with the X button, confirm it disappears from both
   tickets.
5. Ask the AI something like "what's blocking [ticket title]" or
   "what duplicates [ticket title]" - it should now be able to use
   these links, not just the older single blocked_by_id field.

## Why only 5 stored types, not all 8 the spec mentions

"Blocked by," "follows," and "child of" aren't stored as their own
rows - they're literally the same row as "blocks," "precedes," and
"parent of," just read from the other ticket's side. Storing both
directions would mean every link takes two rows that always have to
stay in sync with each other - reading the same row two different ways
depending on which ticket you're looking at removes that whole problem
instead of solving it twice.
