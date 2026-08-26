# Setting up: video, PDF, and document attachments

## Nothing to set up in Supabase

This one just changes what the file picker accepts and how the
attachment list displays each file — the storage bucket you already
set up (task-attachments) works exactly the same, it never restricted
file types on its own. Copy the files in and it's live.

---

## What changed

**Before:** the attachment file picker on any task only let you
choose images — the underlying upload actually accepted anything, but
the picker itself hid every other file type from you.

**Now:**

- The file picker accepts images, videos, PDFs, and Word/RTF/
  OpenDocument files.
- The size cap is up to **50MB per file** (from 15MB), to leave real
  room for video.
- Each attachment in the list now shows a proper icon for its type —
  a real thumbnail preview for images, a violet video icon, a red PDF
  icon, an orange document icon — instead of every file looking like
  a plain paperclip.

---

## Step 2: copy the files in

- `dashboard.html` (updated — file picker now accepts more types)
- `js/dashboard.js` (updated — size cap raised, type-aware icons)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Support video, PDF, and document attachments"
git push
```

---

## What this does not do yet

- The "paste from clipboard" (Cmd/Ctrl+V) shortcut is still
  image-only — that's a real browser limitation on what the Clipboard
  API can read, not something skipped on purpose.
- Pasting a *link* to a video or file that's already hosted elsewhere
  (Drive, YouTube, etc.) into the "…or paste a link" field already
  works for any type, same as before.
- If your Supabase plan's Storage bucket has its own file size limit
  set lower than 50MB, uploads of larger files will still fail at that
  limit — you can raise it in Supabase → Storage → task-attachments →
  bucket settings.
