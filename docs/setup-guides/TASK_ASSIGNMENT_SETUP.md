# Setting up: Task Assignment (Delegation)

A new "Assign to" dropdown inside every ticket's edit screen. Hand a
ticket to a collaborator on the board - they get a real notification
in their bell (see Notification Center) the moment you do.

## Step 1: run the database update

1. Supabase dashboard -> SQL Editor -> New query.
2. Open `supabase/schema_v46_task_assignment.sql`, copy all of it,
   paste, click Run.

This adds one column (`assigned_to`) to your existing `tasks` table.
Nothing else is touched - collaborators already had permission to
update tasks on a shared board, so no new access rules were needed for
the assignment itself.

## Step 2: deploy the new Edge Function

```
supabase functions deploy notify-assignment
```

No `--no-verify-jwt` on this one - unlike the public-facing functions
from earlier, this only ever runs for someone already signed in, so
Boardly's normal login check is exactly right for it. This function
exists only because a normal signed-in user still can't write a
notification into someone ELSE's bell directly (blocked on purpose,
see schema_v36_notifications.sql) - it checks both people actually
belong to the same board first, then creates it on your behalf.

## Step 3: copy the files in, then push

```
git add .
git commit -m "Add Task Assignment"
git push
```

## Step 4: test it

1. You'll need at least one collaborator already added to a board
   (Manage collaborators) who has accepted and has a real Boardly
   account - a still-pending invite won't show up in the list, since
   there's no account yet to notify.
2. Open any ticket, find the new "Assign to" dropdown, pick that
   person, save.
3. Signed in as that person (or have them check), their notification
   bell should show "You were assigned [ticket title]."
4. Assigning a ticket to yourself doesn't send a notification - you
   already know.
