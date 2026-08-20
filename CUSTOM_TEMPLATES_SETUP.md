# Setting up "save this board as a template"

This is a small, one-piece addition. Boardly already came with built-in
templates (Sprint planning, Content calendar, and so on) and the
vertical quick-templates in the "New board from template" menu. This
adds a third source: templates YOU made from a board you already built.

---

## Step 1: run the database migration

Supabase dashboard → SQL Editor → New query → paste the whole contents
of `supabase/schema_v18_custom_templates.sql` → Run.

This adds one new table, `board_templates`. Nothing existing is
touched, and it uses the same simple "only I can see my own rows" rule
every table before it used, before collaboration was added - a saved
template is always private to you.

## Step 2: that's it, no Edge Function, no secrets

Everything for this feature runs directly between the browser and the
database, like most of Boardly already does. There is nothing to
deploy.

## Step 3: try it

1. Build a board you like, or open one you already have.
2. Click the board name at the top → **Save this board as a
   template**.
3. Give it a name. Every task currently on that board (their titles
   and categories) gets saved as the template's starting tasks.
4. Open **New board from template** (or the template gallery) → your
   saved template appears at the top, under "Your templates," above
   the built-in ones.
5. Click **Use this template** any time to spin up a brand new board
   pre-filled with the same starting tasks.

## What this does not do yet

- Saving a template is a snapshot, not a live link - editing the
  original board afterward does not change a template you already
  saved, and using a template again later never changes past boards
  made from it.
- Only titles and categories are saved, not due dates, priorities, or
  attachments - a template is meant to be a reusable starting point,
  not a full copy of a specific moment in time.
- No sharing a template with someone else yet - that's a natural
  future extension once this table exists, using the same
  `board_members` idea from `COLLABORATION_SETUP.md`, not done here.
