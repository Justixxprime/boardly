# Setting up the Done Archive

## Step 1: nothing to set up in Supabase

This one doesn't touch your database at all. It's built entirely on
top of things Boardly already stores — no SQL Editor, no new table,
no edge function, no deploy command. Just copy the files in from the
zip (see the copy step below) and it's live.

---

## What this actually fixes

Every task you finish stays in the Done column forever, and there
was no built-in way to deal with that — the only tool was the trash
icon that deletes your **entire** Done column in one shot, with no
way to keep a record of what you'd finished first.

Now:

- The Done column only ever shows your **6 most recently finished**
  tasks. Once you've completed more than that, a small card appears
  at the bottom that says "+N more completed — View all."
- There's also a new archive icon (a little box) in the Done
  column's header — you can open the full archive any time, even
  before it's ever capped.
- Tapping either one opens the **Done Archive**: every completed
  task on this board, grouped by "Today," "Yesterday," "This week,"
  "This month," and "Earlier," with a search box up top and a small
  line telling you how many you've finished total and how many in
  the last 7 days.
- Each row in the archive has two small icons: a circular arrow to
  **restore** it back to your To do column, and a trash can to
  **delete it permanently**, one at a time.
- At the bottom, two buttons — "Clear 30+ days" and "Clear 90+
  days" — let you delete a whole batch of old completed tasks in one
  go, but only after you confirm exactly how many you're about to
  delete. Nothing is ever deleted silently.

Nothing about how you mark a task done, or how the other two columns
work, changed at all. This only touches how the Done column displays
once it starts piling up.

---

## Step 2: copy the files in

From the zip I gave you, copy these into your real project folder,
overwriting where asked:

- `dashboard.html` (updated — new archive button, new modal)
- `css/style.css` (updated — one line added so the new pop-up modal
  sits above your bottom tab bar on phones, same fix every other
  pop-up already uses)
- `js/done-archive.js` (brand new file)

---

## Step 3: push it to GitHub

Same as always, from your terminal, inside your `boardly` folder:

```
git add .
git commit -m "Add Done Archive to declutter the Done column"
git push
```

That's it — refresh your live site and the Done column will already
be capped, with the new archive icon sitting right in its header.

---

## What this does not do yet

- The "6 most recent" cap is the same for everyone right now — there's
  no setting yet to change that number from the app itself.
- Restoring a task from the archive always sends it back to **To do**
  (not straight to In progress) — you can drag it over from there.
- This is per-board, same as the rest of your tasks — it doesn't pull
  completed tasks in from your other boards.
