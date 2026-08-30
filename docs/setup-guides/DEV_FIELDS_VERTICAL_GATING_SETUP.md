# Setting up: Environment/Git fields now only show for Software tasks

## Nothing to set up in Supabase

Pure UI fix — no schema change. Copy the files in and it's live.

---

## What this fixes

The "Pro" fields section (Priority, Environment, Git branch/PR, Time
tracking, Blocked by) used to show the same way on **every** task,
regardless of what kind of board or task it was — so a Logistics or
Teaching task's edit screen would still show "Environment: Dev /
Staging / Production" and Git branch fields that made no sense there.

**Now:** Environment and Git only appear when a task's actual type is
**Software / Web Dev** (either because the board itself is that type,
or because that one task's Type override says so). Priority, Time
tracking, and Blocked-by stay visible everywhere, since those
genuinely apply to any kind of work, not just software.

If you already had Environment or Git data saved on a task before
this update, it's still there — this only changes what's *shown*, it
never deletes anything, even for a task that isn't currently
Software-typed.

---

## Step 2: copy the files in

- `dashboard.html` (updated — Environment/Git moved into their own
  sub-section)
- `js/dashboard.js` (updated — that sub-section is now gated on the
  task's actual type)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Only show Environment/Git fields on Software tasks"
git push
```
