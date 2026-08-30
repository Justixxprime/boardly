# Setting up: Notification Center

A bell icon in the dashboard header. Unlike Boardly's toasts (which
disappear the moment you look away), these stick around until you read
them - starting with "you were added to a board."

No new provider account needed - just your existing Supabase project.

## Step 1: run the database update

1. Supabase dashboard -> SQL Editor -> New query.
2. Open `supabase/schema_v36_notifications.sql`, copy all of it, paste
   into the SQL Editor, click Run.
3. You should see "Success. No rows returned."

This adds one new table, `notifications`. Nothing existing is touched.

## Step 2: redeploy invite-member

The board-invite notification is sent from inside the existing
`invite-member` function, which was updated to also write a
notification row when the invited person already has a Boardly account.
```
supabase functions deploy invite-member
```

## Step 3: copy the rest of the files in, then push

```
git add .
git commit -m "Add Notification Center"
git push
```

## Step 4: test it

1. Open the dashboard - you'll see a bell icon in the header.
2. If you haven't run Step 1 yet, opening it shows a small note about
   the database update still being needed instead of a blank list -
   that's expected.
3. After Steps 1-2: invite someone who already has a Boardly account to
   one of your boards. Sign in as that person (or have them check) - the
   bell should show a red badge, and opening it shows "You were added to
   [board name]."
4. Clicking a notification marks it read and takes you to the linked
   page. "Mark all read" clears the badge without navigating anywhere.

## Adding more notification types later

- Something that happens to the person who is currently signed in (a
  personal reminder, for example): insert a row directly from the
  browser - a user is always allowed to notify themselves.
- Something that happens **to someone else** (like the board-invite
  one): has to go through an Edge Function using the service role
  client, the same way `invite-member/index.ts` does it. An ordinary
  user's browser session can never create a notification for another
  user - that's blocked by Row Level Security on purpose, so nobody can
  spam fake notifications into someone else's bell.
