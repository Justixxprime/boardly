# Setting up the Views menu

## Step 1: nothing to set up in Supabase

This one is a pure toolbar reorganization — no new data, no
migration. Copy the files in and it's live.

---

## What this actually fixes

Since the last update, a single board can now have tasks of several
different types at once (the new Type field on each task). That's
great for mixed boards, but it had one side effect: if a board had,
say, a few delivery tasks AND a few teaching tasks, you'd end up with
**both** Control Tower and Classroom sitting in your toolbar at the
same time — and if someone really went all-in on a mixed board, all
six vertical views (Control Tower, Classroom, Dispatch, Care Rounds,
Content Calendar, Client Work) could show up simultaneously, turning
your toolbar into a wall of buttons.

**The fix:** those six buttons now live inside one collapsed
dropdown, opened by a single **Views** button. The Views button itself
only appears once at least one of the six is actually relevant to
your board — same as before, nothing shows up on boards that don't
need it. Tap Views, and you'll see only the ones that currently apply
to your board, nothing else.

Nothing about how any of the six views themselves work changed even
slightly — same grouping, same search, same "mark complete" flows as
before. This is purely about where you find the button to open them.

---

## Step 2: copy the files in

- `dashboard.html` (updated — the six buttons moved into a dropdown
  under one new "Views" button)
- `js/views-menu.js` (brand new file — just handles opening/closing
  the dropdown and showing/hiding the Views button itself)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Consolidate vertical views into one Views menu"
git push
```

Refresh your site — if your board has any active vertical view, you
should see one **Views** button in your toolbar instead of up to six
separate ones.
