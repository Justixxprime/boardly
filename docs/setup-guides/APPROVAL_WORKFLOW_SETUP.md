# Setting up: Team Approval Workflow

Phase 3 of the master build spec: an internal review flow - one
teammate submits their work, another (or the board owner) approves it
or asks for changes. Separate from the Client Portal's own
approve/changes-requested, which is external (a paying client, not a
teammate).

## Step 1: run the migration

In the Supabase SQL Editor, run `supabase/schema_v56_approval_workflow.sql`.

## Step 2: copy the files in, then push

```
git add .
git commit -m "Add Team Approval Workflow (Phase 3)"
git push
```

## Step 3: test it

1. Open a ticket, find "Team approval," click **Submit for approval**.
2. As the SAME account, notice you can't approve or reject your own
   submission - a real review needs someone else.
3. As a different collaborator (or the board owner, from a different
   account/browser), open the same ticket - you should see **Approve**
   and **Request changes** buttons.
4. Click "Request changes," add a note - the submitter gets a
   Notification Center entry, and the history log at the bottom of the
   section shows every step with a timestamp.
5. Submit again, this time click Approve - same notification, same
   permanent history entry.

## Every action here shows a toast and logs to history

Submitting, approving, and requesting changes all show a confirmation
toast immediately, success or failure - none of these should ever
happen silently, since they're real decisions someone is making about
someone else's work. The history table is insert-only (no update or
delete policy exists for it) - once logged, an approval decision can't
be quietly edited after the fact.
