# Setting up Client Work

## Step 1: nothing to set up in Supabase

Same as the rest of this family — this reads information your
Freelance boards already have (Client, Project). No migration needed.
Copy the files in and it's live.

---

## What this actually is

Freelance work already moves through **To do → In progress →
Delivered**. Client Work is the same shape as Control Tower and its
siblings: "who am I working for, what's due, what's overdue" — all in
one screen, grouped by client instead of scattered across a general
kanban board.

**It shows up on boards set to the Freelance type, or on any board
with at least one task individually set to Freelance** (see the Type
field added to every task's edit modal in the last update) — every
other board is unaffected.

On a freelance board, you'll now see a **Client Work** button in your
toolbar. Tap it and you get:

- A count of active projects, how many are overdue, and how many
  you've delivered today.
- A search box — matches title, client, or project.
- Small chips across the top for each client, showing how many active
  items they have.
- A list, **grouped by client**, sorted within each client's list by
  urgency (overdue first, then soonest due, undated last).
- Each item shows its project name and due date at a glance.
- **Mark delivered** opens a small optional note (like "sent via
  email, awaiting feedback") before checking it off.
- **Open ticket** for the full details.

**One honest note:** this is not an invoicing tool. It doesn't track
what you're owed, generate invoices, or record payments — Boardly
doesn't have real billing data behind it, and this isn't pretending
to. It's purely a "what's active, for who, is it late" view, the same
kind of screen as every other vertical in this family.

---

## Step 2: copy the files in

- `dashboard.html` (updated — new button, new modal)
- `css/style.css` (updated — same modal-above-tab-bar fix as always)
- `js/client-work.js` (brand new file)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Add Client Work"
git push
```

Refresh your site, switch to (or create) a board set to **Freelance**
(or tag a task's Type as Freelance on any board), and the Client Work
button will be right there in your toolbar.

---

## What this does not do yet

- No invoicing, payment tracking, or "amount owed" — see the note
  above.
- No client portal integration yet — if you want a client to actually
  see or approve this work, that's the separate Client Portal feature
  (a different thing entirely, built earlier in this project).
- The delivery note is a single line of text.
