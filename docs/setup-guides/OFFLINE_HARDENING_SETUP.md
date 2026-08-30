# Setting up: offline read cache + conflict detection

Quick recap of what already existed before this: if you lost internet
while using Boardly, you could still add, edit, and delete tasks - the
app quietly saved them on your device and sent them to the real
database the moment you were back online. That part was already
solid.

This update fixes two things that part didn't cover:

1. **Opening the app with zero connection from the start** used to
   show an empty, broken-looking board, because there was nothing
   cached to show yet. Now it shows the last version of your board
   that successfully loaded, clearly marked as offline, instead of
   nothing.
2. **Editing the same ticket someone else also edited while you were
   both offline/online at different times** used to have no safety
   net - whichever edit reached the database last would silently
   erase the other one, with no warning to either person. Now Boardly
   notices this and tells you, instead of quietly losing someone's
   change.

---

## Step 1: run the database migration

Supabase dashboard → SQL Editor → New query → paste the whole
contents of `supabase/schema_v19_task_updated_at.sql` → Run.

This adds one column (`updated_at`) to your tasks table, and a small
trigger that keeps it stamped with "right now" automatically every
time a ticket is changed - nothing in the app has to remember to set
it, so it can't be forgotten somewhere and go stale.

## Step 2: that's it - no Edge Function, no secrets

Everything here runs directly in the browser and the database, same
as the rest of the offline queue already does.

## What to expect

- Turn off your phone's Wi-Fi and data, close and reopen Boardly - you
  should still see your tasks, with an "Offline, saving locally" badge
  near the top instead of a blank board.
- If two people (or two tabs) edit the exact same ticket while one of
  them is offline, whichever edit reaches the server first wins, and
  the person whose edit came second gets a message telling them to
  check that ticket over - their change is not silently thrown away
  without them knowing.

## What this does not do yet

- It doesn't merge two conflicting edits together field by field - if
  a conflict happens, one edit wins and the other person is told to
  manually redo theirs after checking what changed. A smarter merge is
  a reasonable future step, not built here.
- Boards you've never opened before this update won't have a cached
  copy yet - the very first time you open a board while online, it
  saves that copy for the next time you might be offline.
