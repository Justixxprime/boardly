# Setting up: Proofing

The last piece of Phase 4 of the master build spec: "Proofing - place a
comment pin at an exact x/y coordinate on an image."

## What this actually is

You already have two ways to review work:

- The internal **Approval Workflow** (Submit / Approve / Request
  changes) gives a whole TICKET one verdict.
- **File-Level Approval Status** gives one specific FILE its own
  verdict (Approved / Needs changes / Rejected).

Proofing goes one level more precise than both of those: it lets you
point at one exact SPOT on an image and say what's wrong right there.
"The logo is too big" doesn't tell anyone where on the design you
mean. A pin sitting right on top of the logo does.

## Step 1: run the new schema file

Open the Supabase SQL Editor and run:

```
supabase/schema_v57_proofing.sql
```

This creates one new table, `proof_comments`. It holds, for each pin:
which task and attachment it belongs to, its position (as a percentage
across the image, not a pixel count, so it stays correctly placed no
matter what size the image displays at), the comment text, who wrote
it, and whether it's been marked resolved.

## Step 2: copy the files in, then push

```
git add .
git commit -m "Add Proofing (Phase 4)"
git push
```

## Step 3: test it

1. Open a ticket that has at least one image attachment.
2. Next to that image, click the small speech-bubble icon (it's new,
   sitting next to the copy-image icon).
3. A full-screen view opens showing just that image. Click anywhere on
   it - a little box pops up right there asking what needs attention.
   Type something and click **Save pin**.
4. A small numbered orange circle appears exactly where you clicked,
   and your comment shows up in the list on the side too.
5. Click **Mark resolved** on that comment - the circle on the image
   turns teal/green instead of orange, showing at a glance that it's
   been dealt with.
6. Close the proofing view and look at the attachment row again - if
   any pin on that image is still unresolved, a small red number badge
   now sits on the speech-bubble icon, so you can tell there's open
   feedback without reopening the view.

## Why pins are tied to the file's URL, not its position in the list

Every other attachment feature so far (versions, review status) refers
to a file by its position in the list - "the 2nd attachment on this
ticket." That breaks the moment someone removes an earlier attachment
or reorders them, since the 2nd one is now a different file. Pins use
the file's actual web address instead, which never changes for as long
as that specific file exists - so a pin always stays attached to the
exact file it was left on, however the list around it changes.

One deliberate tradeoff: if you upload a "new version" of a file
through File Versioning, that new version gets a brand new address, so
any pins left on the old version simply stop appearing (they're not
deleted - they're still tied to the old file, which is still
recoverable through the version history). This is intentional: a
genuinely new version of a design could look nothing like the one the
pins were talking about, so carrying old pins forward onto it would be
more likely to confuse than help.
