# Setting up: File Versioning

Phase 4 of the master build spec: "file.pdf v1, v2, v3. Allow restore."

## Step 1: nothing to run

No new database column or table - this reuses the same `attachments`
JSONB column every other attachment feature already uses. Each
attachment can now optionally carry a `versions` array alongside its
current `url`/`name`, that's all.

## Step 2: copy the files in, then push

```
git add .
git commit -m "Add File Versioning (Phase 4)"
git push
```

## Step 3: test it

1. Open a ticket with at least one attachment.
2. Click the upload-arrow icon next to it (not the main "add
   attachment" area - this one specifically replaces that file).
3. Pick a new file - the attachment updates to the new one, and a
   small "v2" badge appears next to it.
4. Click that badge - it expands to show the previous version, with a
   **Restore** link.
5. Click Restore - the old version comes back as current, and the one
   you just moved away from becomes recoverable too (nothing is ever
   a one-way, lossy action here).

## Why this stores versions inside the same JSONB field

A separate `attachment_versions` table would be more normalized, but
for what's realistically a handful of versions on a handful of
attachments per ticket, keeping everything in one JSONB blob means the
whole feature is one round trip to save, matching how attachments
already worked before this. If a board's attachments ever grow far
past that (dozens of versions on the same file), a proper table would
be worth revisiting - not needed for the realistic case today.
