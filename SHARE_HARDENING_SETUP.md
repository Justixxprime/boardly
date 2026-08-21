# Setting up: share link expiry + password protection

## Why this matters, in plain words

Before this, "Make public" meant anyone who ever got the link could
see that board forever, with no way to lock it down further. This adds
two optional limits: a date the link stops working, and a password.

The password is built the careful way, not the easy way: it's checked
on your Supabase server, not in the browser. That matters because a
password check only written in browser code can be skipped by anyone
who's a little technical - they can just ask your database directly
and bypass the password box entirely. This version makes that
impossible: a password-protected board's real data simply isn't
available at all through the normal direct route once a password is
set, only through a secure Edge Function that checks the password
first.

---

## Step 1: run the database migration

Supabase dashboard → SQL Editor → New query → paste the whole
contents of `supabase/schema_v20_share_hardening.sql` → Run.

Adds two new columns to your boards table, and updates the two rules
that already control who can see a public board, so they also check
expiry, and refuse direct access once a password is set.

## Step 2: deploy the get-shared-board Edge Function

```
supabase functions deploy get-shared-board
```

This is the only way a password-protected board's data can be read
from here on. No new secrets needed.

## Step 3: try it

1. Open a board → the board name menu → **Share link settings**
   (only shows once the board is already public).
2. Set an expiry date, a password, both, or neither.
3. Open the share link in a private/incognito window to see what a
   visitor sees - a password prompt if you set one, and "this link has
   expired" automatically once the date passes.

## What to know

- Leaving the password box blank when saving does **not** remove an
  existing password - it means "leave it as it is." To actually remove
  a password, use the "Remove the current password" link that appears
  once one is set.
- The password itself is never stored anywhere, only a scrambled
  version of it (a "hash") that can be checked but not reversed back
  into the original password - even you can't look it up again later,
  same as every properly built login system works.
- Turning a board private, then public again, always makes a brand new
  link - the old one stops working the moment you do that, which is
  already how sharing worked before this update.
