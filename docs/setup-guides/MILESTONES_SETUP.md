# Setting up: Milestones

A new "Milestones" button in the toolbar, plus a "Milestone" field
inside every ticket's edit screen. Real project phases - Discovery,
Launch, whatever fits your board - with progress that's always computed
live from however many linked tickets are actually Done, never a
manually-typed percentage.

No new provider account needed - just your existing Supabase project.

## Step 1: run the database update

1. Supabase dashboard -> SQL Editor -> New query.
2. Open `supabase/schema_v40_milestones.sql`, copy all of it, paste,
   click Run.
3. You should see "Success. No rows returned."

This adds one new table, `milestones`, and one new column on the
existing `tasks` table (`milestone_id`, nullable). Nothing else about
tasks is touched, and a board with no milestones keeps working exactly
as it always has.

## Step 2: copy the files in, then push

```
git add .
git commit -m "Add Milestones"
git push
```

## Step 3: test it

1. Click "Milestones" in the toolbar, add one with a name and
   (optionally) a target date.
2. Open any ticket, and near the top of its edit screen you'll see a
   new "Milestone" dropdown - assign it to the one you just made.
3. Reopen Milestones - the progress bar and "X of Y linked tickets
   done" line should update to reflect that ticket.
4. Mark the ticket Done, then check the milestone again - progress
   moves on its own, nothing to update by hand.
5. Click the checkbox next to a milestone's name to mark the whole
   milestone complete, or the trash icon to delete it (deleting one
   only unlinks its tickets - it never touches or deletes the tickets
   themselves).
