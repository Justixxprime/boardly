# Setting up: Routines on your Good Morning screen

## Nothing to set up in Supabase

Pure presentation — reads the same repeating reminders Routines
already shows. No migration needed. Copy the files in and it's live.

---

## What this actually is

Good Morning already pulls together what matters for your day —
today's priorities, anything at risk, who you're waiting on. It never
knew about Routines, since that feature didn't exist yet. Now it does:
a **"Today's routines"** section shows any recurring routine (like
"Wake me up," 6:00 AM, every weekday) whose next occurrence lands
today, with its time shown on the right in the same monospace style
Routines itself uses.

Same rule as the rest of Good Morning: the section only appears when
there's something to show — no routines today, and it stays hidden,
same as "At risk" or "People" already do when there's nothing there.

---

## Step 2: copy the files in

- `dashboard.html` (updated — new section)
- `js/morning.js` (updated)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Show today's routines on the Good Morning screen"
git push
```
