# Setting up Task DNA

## Step 1: nothing new to run in Supabase — but check this one thing

Task DNA doesn't add anything new — it just reads columns that
already exist. But it does depend on Friction Detector's two
counters (`postponement_count`, `reopen_count`). If you haven't run
`supabase/schema_v26_friction_detector.sql` yet, Task DNA still works
fine — it just won't have any "pushed back" or "reopened" numbers to
show, since those columns won't exist yet.

If you're not sure whether you've run it, it's completely safe to
paste it into SQL Editor again — it only adds things "if not exists."

---

## What this actually is

Friction Detector already flags, on your Insights page, which tasks
across the whole board have been pushed back 3+ times or reopened 2+
times. What was missing was seeing a task's own story while you're
looking right at it — so now there are two small things:

1. **A quiet badge on the card itself.** Any task that's ever been
   pushed back or reopened — even just once — now shows a small grey
   DNA icon on its card, right on the board. It turns orange once
   that task crosses the same "worth flagging" line Insights already
   uses (3+ pushes or 2+ reopens), so the color means the same thing
   in both places.
2. **A "Task DNA" strip inside the edit modal.** Open any ticket and,
   right under the title, you'll now sometimes see a small row of
   chips: how long it took to finish (if it's done), how long it's
   been sitting open (if it isn't), and — only when the number is
   actually more than zero — how many times it's been pushed back or
   reopened. A task with a totally clean record shows nothing here at
   all, on purpose — no "0 times" clutter.

---

## Step 2: copy the files in

- `dashboard.html` (updated — new empty strip in the edit modal, new
  script tag)
- `js/dashboard.js` (updated — one line added to the card, right next
  to the existing "Blocked" badge)
- `js/task-dna.js` (brand new file)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Add Task DNA — per-task history in the edit modal and board card"
git push
```

Refresh your site — open any ticket you've pushed back a due date on
before, and you'll see it show up right under the title.

---

## What this does not do yet

- It's a summary, not a full history log — it tells you *how many*
  times something was pushed back or reopened, not the exact dates
  each time it happened. That's the same deliberate trade-off
  Friction Detector itself already made, to avoid building a much
  heavier audit-trail system for a question that really only needs a
  count.
- The "took X days" / "open X days" numbers are simple calendar-day
  math from `created_at` — they don't account for weekends,
  timezones beyond your device's own, or paused/blocked time.
