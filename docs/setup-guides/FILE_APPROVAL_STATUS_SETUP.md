# Setting up: File-Level Approval Status

Phase 4 of the master build spec: a separate FILE-level approval status
(Approved / Needs changes / Rejected) on an individual attachment,
distinct from the ticket-level Approval Workflow (schema_v56) that
approves the WHOLE ticket.

## Why this is a different thing from the ticket-level Approval Workflow

You already have "Submit for approval / Approve / Request changes" on
a whole ticket (js/approval-workflow.js). That's the right tool when
the ticket itself, as a unit of work, needs sign-off.

But a ticket can carry several attachments at once - say three logo
drafts on one "Design new logo" ticket. The ticket-level workflow can
only give you one verdict for all three files together. This feature
lets you mark each FILE on its own: draft 1 approved, draft 2 needs
changes, draft 3 rejected, all on the same ticket, without needing
three separate tickets.

## Step 1: nothing to run

No new database column or table - just like File Versioning right
before it, this reuses the same `attachments` JSONB column every other
attachment feature already uses. Each attachment can now optionally
carry two more things alongside its `url`/`name`:

- `fileStatus` - the current verdict (`approved`, `needs_changes`,
  `rejected`, or nothing yet)
- `fileStatusLog` - every verdict that file has ever had, newest
  first, so there's a real trail even after a verdict gets changed or
  cleared later

## Step 2: copy the files in, then push

```
git add .
git commit -m "Add File-Level Approval Status (Phase 4)"
git push
```

## Step 3: test it

1. Open a ticket that has at least one attachment (upload one if it
   doesn't).
2. Under the attachment, you'll see a small "Review:" row with three
   icon buttons - a checkmark, a warning triangle, and an X.
3. Click the checkmark - the button turns solid green and fills in
   "Approved". The board card for that ticket does nothing extra yet,
   because Approved isn't something that needs your attention.
4. Click the warning triangle instead - it turns solid orange for
   "Needs changes". Now look at the ticket's card on the board itself
   - a small red file-warning icon appears on the card, so you can see
   at a glance, without opening the ticket, that something on it needs
   a second look. The same red icon shows up for "Rejected" too.
5. Click whichever button is already solid/active again - it clears
   back to no verdict. This is the only way to "undo" a verdict once
   set; there's no separate Clear button, since clicking the same one
   twice reads naturally as "undo that."
6. Once a file has had at least one verdict, a small clock icon
   appears on the right of the Review row - click it to expand the
   full history of every verdict that file has ever had (including
   ones that were later cleared).

## Why this stores its history the same way File Versioning does

Same reasoning as File Versioning: a separate table for this would be
more "correct" in a database-textbook sense, but for what's
realistically a handful of verdict changes on a handful of files per
ticket, keeping it inside the same JSONB blob means this feature adds
zero new round trips and zero new RLS policies to think about. If a
board's files ever needed a heavier audit trail than this (compliance-
grade, tamper-evident logging), a real `file_approval_history` table
would be worth it - not needed for the realistic case today.
