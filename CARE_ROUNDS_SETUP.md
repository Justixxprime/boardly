# Setting up Care Rounds

## Step 1: nothing to set up in Supabase

Same as Dispatch and the others — this reads information your
Healthcare/Care boards already have (Patient, Visit address, Visit
notes — from `schema_v14_vertical_fields.sql`). No migration needed.
Copy the files in and it's live.

---

## What this actually is

The Healthcare vertical already moves visits through **Visit
Scheduled → In Progress → Completed**. Care Rounds is the same idea
as Dispatch (its Field Service sibling) applied here: one screen
showing "who do I need to see next," sorted by urgency instead of
buried across your board.

**It only shows up on boards you've set to the Healthcare / Care
type** — every other board is completely unaffected, and the button
stays hidden.

On a healthcare board, you'll now see a **Care Rounds** button in
your toolbar. Tap it and you get:

- A count of active visits, and how many are overdue.
- A single list, overdue visits first, then whichever visit is due
  soonest, undated visits last.
- Each visit shows patient name, visit address, and visit notes at a
  glance.
- **Mark visit complete** opens a small optional outcome note (like
  "vitals stable, follow-up in 2 weeks") before checking the visit
  off — saved right on the ticket.
- **Open ticket** for the full details.

Same honest note as Dispatch: healthcare visits don't currently have
an "assigned to" field, so this sorts by urgency instead of grouping
by caregiver — that's a real gap in what the data currently tracks,
not a shortcut.

**On sensitivity:** this doesn't collect or send anything new —
patient name and visit notes were already being typed into your board
before this existed. This is a personal/small-team scheduling view,
not a replacement for whatever compliant record-keeping your practice
actually requires.

---

## Step 2: copy the files in

- `dashboard.html` (updated — new button, new modal)
- `css/style.css` (updated — same modal-above-tab-bar fix as always)
- `js/care-rounds.js` (brand new file)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Add Care Rounds"
git push
```

Refresh your site, switch to (or create) a board set to the
**Healthcare / Care** type, and the Care Rounds button will be right
there in your toolbar.

---

## What this does not do yet

- No caregiver assignment field yet, so no grouping by who's seeing
  which patient — see the note above.
- No route planning between visit addresses.
- The visit outcome is a single line of text — not a clinical record,
  and not a substitute for any compliant documentation your practice
  requires.
