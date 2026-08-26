# Setting up Dev Board

## Step 1: nothing to set up in Supabase

Same as the rest of this family — this reads information your
Software/Web Dev boards have (Repository, Tech stack, Staging link).
No migration needed. Copy the files in and it's live.

---

## What this actually is

Software / Web Dev is now a board type of its own, right alongside
the others, with its own column labels:

**Backlog → Building → Shipped**

and three new fields: **Repository**, **Tech stack**, and **Staging /
preview link** (Repository and Staging link both get a copy button,
same as the caption/hashtag fields on Social Media).

**Dev Board** shows up on boards set to this type, or on any board
with at least one task individually set to it (the Type override
field). Tap it and you get:

- A count of active tasks, how many are overdue, and how many you've
  shipped today.
- A search box — matches title, repo, or tech stack.
- Grouped **by repository** — since a dev-focused board often spans
  more than one project.
- **Mark shipped** offers to save the live deploy link and a quick
  note (like "deployed to prod, no errors") — right at the moment
  you'd actually have that link. These reuse the same "Link to the
  live post" fields Content Calendar already uses, not new ones.
- Quick **Preview** and **Live** buttons on each card if those links
  are set.

**One honest note:** this is separate from — not a replacement for —
the existing git branch / pull request fields (under "Pro" fields in
any task's edit modal). Those are about the individual unit of work;
Repository/Tech stack here are about the project it belongs to.

---

## Step 2: copy the files in

- `dashboard.html` (updated — new menu item inside the Views dropdown,
  new modal)
- `js/dashboard.js` (updated — Software/Web Dev added as a board type)
- `css/style.css` (updated — same modal-above-tab-bar fix as always)
- `js/dev-board.js` (brand new file)
- `js/views-menu.js` (updated — now also checks Dev Board)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Add Software/Web Dev vertical + Dev Board"
git push
```
