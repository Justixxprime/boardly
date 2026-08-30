# Setting up: Mixed boards + Social Media + Content Calendar

This update does two things together, because the second one needed
the first: it lets a single task belong to a different "type" than
the rest of its board, and it adds Social Media as a full vertical
with its own dedicated view — Content Calendar, joining Control
Tower, Classroom, Dispatch, and Care Rounds.

---

## Step 1: run the database migration

1. Open Supabase → **SQL Editor** → **New query**.
2. Copy everything from `supabase/schema_v28_task_type_override.sql`,
   paste it in, click **Run**.
3. This adds ONE new column, `task_type`, to your tasks table.
   Every task you already have is unaffected — it stays blank, which
   just means "use whatever type the board itself is set to," exactly
   how things already worked before this update.

---

## Step 2: copy the files in

- `dashboard.html` (updated — new Type dropdown in the edit modal,
  new Content Calendar button and modal, search boxes added to all
  vertical views)
- `js/dashboard.js` (updated — Social Media added as a board type,
  the Type override dropdown, and every vertical view now reads a
  task's real type instead of assuming the whole board matches)
- `css/style.css` (updated — same modal-above-tab-bar fix as always)
- `js/control-tower.js`, `js/classroom.js`, `js/dispatch.js`,
  `js/care-rounds.js` (all updated)
- `js/content-calendar.js` (brand new file)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Add mixed-board task types, Social Media vertical, Content Calendar"
git push
```

---

## Part A: a task can now say "I'm actually a different type"

**The problem this solves:** every dedicated view so far only looked
at the BOARD's type — a board was either "a logistics board" or "a
teaching board," fully. That falls apart the moment you run one board
that mixes things, like a few delivery jobs sitting next to unrelated
personal errands.

**How it works now:** open any task, and near the bottom you'll see a
new field:

> **Type** — *(overrides the board's default just for this task)*

It defaults to **"Use board default"** — meaning nothing changes
unless you touch it. But if you pick something else, like Logistics,
that ONE task now behaves as a logistics task: it gets the Customer /
Driver / Delivery address fields, and it shows up in Control Tower —
even if the board itself is set to General, or to something else
entirely.

This also means the toolbar buttons (Control Tower, Classroom,
Dispatch, Care Rounds, Content Calendar) are smarter now: a button
shows up whenever the board's own type matches, **or** whenever at
least one task on the board has been individually set to that type.
So a mostly-general board with three delivery tasks tagged Logistics
will show the Control Tower button, and Control Tower will show
exactly those three — nothing else.

---

## Part B: Social Media is now a full vertical

Boardly already had platform tagging (Instagram, TikTok, LinkedIn,
etc.) and a "link to the live post" + performance note pair of fields
— those existed before this update. What was missing was a proper
home for them: **Social Media** is now a board type of its own, right
alongside Logistics, Teaching, Field Service, and Healthcare, with its
own column labels:

**Idea → In Production → Published**

and one new field: **Campaign** (a short text field, e.g. "Q4
Launch").

---

## Part C: Content Calendar

The fifth view in this family, opened from the new **Content
Calendar** button (shows up on Social Media boards, or any board with
at least one task set to Social Media). It's built a little
differently from the other three, on purpose:

- It **groups by Platform** — not a new field, it reuses the platform
  tagging Boardly already has, since that was already the real
  "who's this for" answer for content.
- Each piece shows its campaign (if set) and due date (its publish
  date), overdue pieces flagged in red, sorted soonest-first within
  each platform.
- **Mark published** offers to save the live post link and a quick
  performance note (like "2.4k views") right at the moment you'd
  actually have them — these reuse the existing "Link to the live
  post" fields, not new ones.
- A stats line up top: active pieces, how many are overdue, and how
  many you've published today.
- Same search box as the other four.

---

## What this does not do yet

- The Type override is a single dropdown per task — there's no bulk
  "reassign 10 tasks at once" tool yet.
- Content Calendar doesn't post anything anywhere — "Mark published"
  just records that you've published it and where, the same as
  before.
- No content approval workflow beyond what already existed (the
  Pipeline stage field, if you have Pro fields enabled).
