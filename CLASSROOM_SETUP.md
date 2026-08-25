# Setting up Classroom

## Step 1: nothing to set up in Supabase

Same as the Control Tower — this reads information your Teaching
boards already have (Class, Student, Meeting link — from
`schema_v14_vertical_fields.sql`). No migration needed. Copy the
files in and it's live.

---

## What this actually is

The Teaching vertical already relabels your Done column to
**"Graded"** — that idea was already there, just never had a proper
screen of its own. Classroom is that screen: "what's still to teach
or grade, organized by class."

**It only shows up on boards you've set to the Teaching type** —
every other board is completely unaffected, and the button stays
hidden.

On a teaching board, you'll now see a **Classroom** button in your
toolbar. Tap it and you get:

- A count of active lessons right now, and how many you've graded
  today.
- A small search box — matches lesson title, student, or class.
- Small chips across the top for each class, showing how many active
  lessons/assignments it has.
- A list, grouped by class, of everything not yet graded — student
  name and due date if you've filled those in, a **Mark graded**
  button, a **Join** button if the lesson has a meeting link saved,
  and an **Open** button for the full ticket.
- Tapping **Mark graded** opens a small box for the actual grade
  (like "18/20", "A", or "Pass") and an optional feedback line, then
  checks the lesson off — which moves it into your Graded column, same
  as it always has.
- A **Recently graded** section at the bottom shows your last 5
  graded items with their grade, so you can glance back without
  digging through the Done column.

---

## Step 2: copy the files in

- `dashboard.html` (updated — new button, new modal)
- `css/style.css` (updated — same modal-above-tab-bar fix as always)
- `js/classroom.js` (brand new file)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Add Classroom Command Center"
git push
```

Refresh your site, switch to (or create) a board set to the
**Teaching** type, and the Classroom button will be right there in
your toolbar.

---

## What this does not do yet

- No student roster or attendance tracking — "student" is still just
  a text field on each lesson, the same as before.
- No gradebook export or grade averaging across a class.
- The full "Boardly Classroom" idea from the master plan — real
  classes with rosters, assignments as their own object, and grading
  rubrics — is a much bigger, separate product surface than this. This
  is a first, honest step: making the data you already collect
  actually usable day to day.
