# Setting up Dispatch

## Step 1: nothing to set up in Supabase

Same as Control Tower and Classroom — this reads information your
Field Service boards already have (Customer, Job address, Job notes —
from `schema_v14_vertical_fields.sql`). No migration needed. Copy the
files in and it's live.

---

## What this actually is

Field Service jobs already move through **Job Scheduled → On Site →
Completed**. What was missing was a single screen answering "what do
I need to get to next" — this is that screen.

**It only shows up on boards you've set to the Field Service type** —
every other board is completely unaffected, and the button stays
hidden.

On a field service board, you'll now see a **Dispatch** button in
your toolbar. Tap it and you get:

- A count of active jobs, and how many are overdue.
- A single list, sorted the way a technician actually thinks about
  their day — **overdue jobs first**, then whichever job is due
  soonest, undated jobs last.
- Each job shows customer, job address, and job notes at a glance —
  no clicking in to see them.
- **Mark job complete** opens a small optional note (like "parts
  replaced" or "needs a follow-up visit") before checking the job off
  — saved right on the ticket for later.
- **Open ticket** if you need the full details or want to edit
  anything else.

One honest note on why this looks slightly different from Control
Tower: logistics jobs have a Driver field to group deliveries by, but
field service jobs don't currently have an equivalent "assigned to"
field — so instead of grouping, Dispatch sorts by urgency. That's a
genuine difference in what data each vertical currently tracks, not
an oversight.

---

## Step 2: copy the files in

- `dashboard.html` (updated — new button, new modal)
- `css/style.css` (updated — same modal-above-tab-bar fix as always)
- `js/dispatch.js` (brand new file)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Add Field Service Dispatch"
git push
```

Refresh your site, switch to (or create) a board set to the **Field
Service** type, and the Dispatch button will be right there in your
toolbar.

---

## What this does not do yet

- No technician assignment field yet, so no grouping by who's doing
  which job — see the note above.
- No route planning between job addresses.
- The completion note is a single line of text — no photo upload yet.
