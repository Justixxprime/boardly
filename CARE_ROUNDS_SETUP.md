# Setting up Care Rounds

## Step 1: nothing to set up in Supabase

Same as the others — this reads information your Healthcare/Care
boards already have (Patient, Caregiver, Visit address, Visit notes).
No migration needed. Copy the files in and it's live.

**If you're updating from the first version of Care Rounds:** a new
**Caregiver** field has been added to Healthcare boards. It'll show up
automatically in the edit modal for any Healthcare ticket — nothing
you've already entered is affected, visits with no caregiver set yet
just show up under "Unassigned" until you fill it in.

---

## What this actually is

Healthcare visits already move through **Visit Scheduled → In
Progress → Completed**. Care Rounds is the single screen answering
"who do I need to see next."

**It only shows up on boards you've set to the Healthcare / Care
type** — every other board is completely unaffected, and the button
stays hidden.

On a healthcare board, you'll now see a **Care Rounds** button in
your toolbar. Tap it and you get:

- A count of active visits, how many are overdue, and how many
  you've completed today.
- A search box — matches patient, address, or caregiver.
- Small chips across the top for each caregiver, showing how many
  visits they currently have.
- A list, **grouped by caregiver**, sorted within each caregiver's
  list by urgency (overdue first, then soonest due, undated last).
  Visits with no caregiver typed in yet land under "Unassigned."
- Each visit shows patient name, visit address, and visit notes at a
  glance.
- **Mark visit complete** opens a small optional outcome note (like
  "vitals stable, follow-up in 2 weeks") before checking the visit
  off — saved right on the ticket.
- **Open ticket** for the full details.

**On sensitivity:** this doesn't collect or send anything new —
patient name and visit notes were already being typed into your board
before this existed. This is a personal/small-team scheduling view,
not a replacement for whatever compliant record-keeping your practice
actually requires.

---

## Step 2: copy the files in

- `dashboard.html` (updated — search box, caregiver chips)
- `js/dashboard.js` (updated — new Caregiver field added to
  Healthcare boards)
- `css/style.css` (updated — same modal-above-tab-bar fix as always)
- `js/care-rounds.js` (updated — now groups by caregiver)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Update Care Rounds — group by caregiver, add search"
git push
```

---

## What this does not do yet

- No route planning between visit addresses.
- The visit outcome is a single line of text — not a clinical record,
  and not a substitute for any compliant documentation your practice
  requires.
- The Caregiver field is still just a text box, not a real assigned-
  user account — same free-text approach the rest of Boardly's
  vertical fields already use.
