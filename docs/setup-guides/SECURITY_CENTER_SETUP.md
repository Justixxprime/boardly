# Setting up: Security Center

A new "Security" section on the Settings page. Shows a short log of
recent account activity (signing in, changing your password, deleting a
board, inviting a collaborator) and a "Sign out other devices" button.

No provider account or secret needed for this one - it only uses your
existing Supabase project.

## Step 1: run the database update

1. Go to your Supabase dashboard -> **SQL Editor** -> **New query**.
2. Open `supabase/schema_v35_security_center.sql` in a text editor,
   select all, copy.
3. Paste into the SQL Editor box, click **Run**.
4. You should see "Success. No rows returned."

This adds one new table, `security_events`. Nothing existing is
touched. Rows older than 90 days are cleaned up automatically - there's
no cron job to set up.

## Step 2: copy the files in, then push

Same as always:
```
git add .
git commit -m "Add Security Center"
git push
```

## Step 3: test it

1. Open Settings on Boardly.
2. Scroll to the new **Security** section.
3. If you haven't run Step 1 yet, you'll see a small note telling you
   the database update is still needed instead of a blank list - that's
   expected, not a bug.
4. After Step 1, sign out and back in once, then reopen Settings - you
   should see "Signed in to Boardly" at the top of the activity list.
5. Try **Sign out others** - it keeps this device signed in but signs
   the account out everywhere else this browser session exists.

## What counts as an "event" right now

- Signing in
- Changing your password
- Using "Sign out others"
- Deleting a board
- Inviting a collaborator to a board

More can be added the same way later (removing a collaborator, for
example, once that feature itself exists) - each one is a single
one-line call to `logSecurityEvent(...)` right after the real action
succeeds, so it's cheap to extend.
