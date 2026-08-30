# Setting up: Classroom v2 (real rosters, gradebook, rubrics)

## What this actually is

Classroom v1 gave you a screen that pulled together "what's still to
teach or grade, organized by class" - but under the hood, a lesson's
"student" was just a text field, and grading it wrote one grade string
onto the whole ticket. Fine for a one-on-one tutor. Not fine if a
lesson is really for your whole Grade 9 Biology class and you need 24
separate grades out of it.

This update adds the three things v1's own setup doc admitted were
missing:

1. **Real rosters** - add actual named students to a class, once.
2. **A real gradebook** - grade a lesson for a class with a roster, and
   you get one row per student, not one note for the whole lesson.
   Class averages and a CSV export both come out of this automatically.
3. **Grading rubrics** - build a reusable scoring template once (e.g.
   "Thesis /10, Evidence /10, Grammar /5") and attach it whenever you
   grade something - Boardly adds up the points for you.

**Nothing about your existing lessons or grades changes just from
running this.** A class you've never added a roster to keeps grading
exactly like it always has - one free-text grade box, same as before.
The new stuff only switches on for a class once you actually add
students to its roster (for the gradebook) or select a rubric while
grading (for rubrics) - both entirely optional, both free.

---

## Step 1: run the database migration

In Supabase -> SQL Editor -> New query, paste the whole contents of
`supabase/schema_v32_classroom_v2.sql` and click Run. It only adds four
new tables - nothing existing is touched, and it's safe to run even if
you're not sure whether you've run it already.

---

## Step 2: copy the updated files in

- `dashboard.html` (updated - two new buttons in the Classroom header,
  two new modals: Roster and Rubrics)
- `css/style.css` (updated - same modal-above-tab-bar z-index fix every
  new modal in this project needs)
- `js/classroom.js` (rewritten - this is where all the new logic lives)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Add Classroom v2: real rosters, per-student gradebook, grading rubrics"
git push
```

Refresh your site, open a Teaching board, and tap **Classroom**. You'll
see two new small icon buttons next to the search box - one for
**Roster**, one for **Rubrics** - plus a CSV export icon.

---

## How to actually use it

### Adding a roster
Tap the roster icon (people icon). Type a class name (matching
whatever you've been putting in a lesson's "Class" field - it'll
suggest ones you've already used) and a student's name, then **Add
student**. Repeat for each student. That's it - the very next lesson
you grade for that class will show one row per student instead of one
box for the whole thing.

### Building a rubric
Tap the rubrics icon (checklist icon), then **New rubric**. Give it a
name, add a criterion (like "Thesis") and its max points, tap **Add
criterion** for as many as you need, then **Save rubric**. It's now
available on every lesson you grade on this board, roster or no
roster.

### Grading
Nothing changes about how you open a lesson to grade it - tap **Mark
graded** same as always. If the class has a roster, you'll now see one
row per student. If you've built any rubrics, a dropdown appears above
the rows - pick one and every row switches from a single grade box to
one number input per criterion, auto-totalled. Leave it on "No rubric"
and it behaves exactly like v1.

### Exporting
Tap the small CSV icon any time - downloads every grade saved for this
board (class, student, assignment, grade, feedback, when it was
graded) as a spreadsheet-ready file.

---

## If something breaks

Open your browser's console (F12 or right-click -> Inspect -> Console)
and send me exactly what it says in red. The most likely thing to get
wrong is pasting only part of `schema_v32_classroom_v2.sql` - if the
Roster screen keeps saying it needs a database update even after you
ran it, re-open the SQL Editor and check all four `create table`
statements actually ran without an error above them.
