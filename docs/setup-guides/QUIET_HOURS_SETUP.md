# Setting up: Quiet Hours

A new "Quiet hours" section under Settings -> Notifications. During
that window, Boardly stays quiet - no push notification sound or
banner for a task reminder or the daily "due today" check. A ticket
marked Urgent always gets through regardless.

No new provider account needed - just your existing Supabase project.

## Step 1: run the database update

1. Supabase dashboard -> SQL Editor -> New query.
2. Open `supabase/schema_v41_quiet_hours.sql`, copy all of it, paste,
   click Run.

This adds two new columns to your EXISTING `user_settings` table
(`quiet_hours_start`, `quiet_hours_end`) - no new table, nothing else
about it changes.

## Step 2: copy the files in, then push

```
git add .
git commit -m "Add Quiet Hours"
git push
```

## Step 3: test it

1. Open Settings, scroll to Notifications - there's a new "Quiet
   hours" row with two time pickers.
2. Set a window that includes right now (e.g. if it's 3pm, set
   1pm-5pm), save.
3. Set a reminder on a ticket for a minute from now, with a normal
   (not Urgent) category - it should NOT pop up as a push notification,
   though you'll still see the in-app toast if Boardly is open.
4. Try the same with the ticket's category set to Urgent - it goes
   through regardless of quiet hours.
5. Clear both time fields and save to turn quiet hours off entirely.
