# Setting up: Clear history in People

## Nothing to set up in Supabase

This only adds buttons — no schema change. Copy the files in and it's
live.

---

## What this actually is

The People view (Commitments + Waiting Room, grouped by person) never
had a way to clean up old, settled history — every kept commitment
and resolved waiting item just stayed there forever. Now there are
two ways to tidy it up:

- Open any person's detail panel and tap **"Clear this person's
  resolved history"** — deletes their kept/late commitments and
  resolved waiting items, after a confirm showing exactly how many.
  Anything still **open** for them is never touched.
- From the main People list, tap **"Clear all resolved"** at the
  bottom — same idea, across everyone at once.

Both always show you the exact count before deleting anything, and
neither can be undone — same discipline as Done Archive's own "Clear
30+/90+ days" buttons.

---

## Step 2: copy the files in

- `dashboard.html` (updated — two new buttons in the People modal)
- `js/people.js` (updated)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Add clear-history actions to People"
git push
```
