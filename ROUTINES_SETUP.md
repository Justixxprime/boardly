# Setting up Routines

## Step 1: this needs the reminder-repeat migration

Routines are built entirely on the repeating-reminder feature that
already exists (Timely). If you haven't already run
`supabase/schema_v7_reminder_repeat.sql`, do that first (SQL Editor →
paste → Run). If you've already got repeating reminders working
anywhere else in Boardly, you're already set — nothing more to do in
Supabase.

---

## What this actually is

"Wake me up weekdays at 6am" isn't really a task — it has no
deadline, nothing gets delivered, it never finishes. Before this, the
only way to set one up was the full ticket editor, and it then sat in
your To-do column looking exactly like unfinished work, forever.

**Routines** gives that specific kind of thing its own home:

- A new **Routines** button in your toolbar (shows up once the
  migration above is in place).
- Tap it, and you'll see every recurring reminder on this board laid
  out as its own distinct card — a soft glowing ring around a bell
  icon, a big clock-style readout of the time, the repeat pattern in
  plain words ("every weekday"), and when it'll next go off ("Next:
  tomorrow").
- Color varies by pattern — teal for daily, orange for weekdays,
  violet for weekly — so a quick glance tells them apart.
- A simple form right there to create a new one: title, time, repeat
  pattern, timezone. No due date field to skip past, no status to
  manage.
- Each card has a small edit and delete button — edit opens the full
  ticket if you need to change anything else about it, delete removes
  it after a confirm.

Routines still exist as ordinary tasks underneath (they still show up
on your board if you look) — this is a better front door for creating
and reviewing them, not a separate system.

---

## Step 2: copy the files in

- `dashboard.html` (updated — new button, new modal)
- `css/style.css` (updated — the routine card's visual style, plus
  the modal-above-tab-bar fix)
- `js/routines.js` (brand new file)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Add Routines"
git push
```

Refresh your site — you should see the Routines button in your
toolbar. Tap it, set "Wake me up," 6:00 AM, every weekday, and you're
done.

---

## What this does not do yet

- No snooze or "skip today" action — deleting and recreating is the
  only way to change a routine's schedule for now beyond editing it
  directly.
- No sound/vibration beyond whatever your existing browser or email
  reminder settings already do (Routines doesn't add a new
  notification channel, it reuses Timely's).
