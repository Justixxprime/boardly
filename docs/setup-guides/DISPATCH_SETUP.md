# Setting up Dispatch

## Step 1: nothing to set up in Supabase

Same as Control Tower and Classroom — this reads information your
Field Service boards already have (Customer, Technician, Job address,
Job notes). No migration needed. Copy the files in and it's live.

**If you're updating from the first version of Dispatch:** a new
**Technician** field has been added to Field Service boards. It'll
show up automatically in the edit modal for any Field Service ticket
— nothing you've already entered is affected, jobs with no technician
set yet just show up under "Unassigned" until you fill it in.

---

## What this actually is

Field Service jobs already move through **Job Scheduled → On Site →
Completed**. Dispatch is the single screen answering "what do I need
to get to next."

**It only shows up on boards you've set to the Field Service type** —
every other board is completely unaffected, and the button stays
hidden.

On a field service board, you'll now see a **Dispatch** button in
your toolbar. Tap it and you get:

- A count of active jobs, how many are overdue, and how many you've
  completed today.
- A search box — matches customer, address, or technician, so a busy
  board is still easy to scan.
- Small chips across the top for each technician, showing how many
  jobs they're currently carrying.
- A list, **grouped by technician**, sorted within each technician's
  list by urgency (overdue first, then soonest due, undated last).
  Jobs with no technician typed in yet land under "Unassigned."
- Each job shows customer, job address, and job notes at a glance.
- **Mark job complete** opens a small optional note (like "parts
  replaced" or "needs a follow-up visit") before checking the job off
  — saved right on the ticket for later.
- **Open ticket** if you need the full details or want to edit
  anything else.

---

## Step 2: copy the files in

- `dashboard.html` (updated — search box, technician chips)
- `js/dashboard.js` (updated — new Technician field added to Field
  Service boards)
- `css/style.css` (updated — same modal-above-tab-bar fix as always)
- `js/dispatch.js` (updated — now groups by technician)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Update Dispatch — group by technician, add search"
git push
```

---

## What this does not do yet

- No route planning between job addresses.
- The completion note is a single line of text — no photo upload yet.
- The Technician field is still just a text box, not a real assigned-
  user account — same free-text approach the rest of Boardly's
  vertical fields already use.
