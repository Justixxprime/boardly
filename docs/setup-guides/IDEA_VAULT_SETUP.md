# Setting up: Idea Vault

A new "Idea Vault" button in the dashboard toolbar. A place to write
something down without it becoming a task - it only turns into real
work when you click "Turn into task" on that specific idea, never
automatically.

No new provider account needed - just your existing Supabase project.

## Step 1: run the database update

1. Supabase dashboard -> SQL Editor -> New query.
2. Open `supabase/schema_v37_idea_vault.sql`, copy all of it, paste,
   click Run.
3. You should see "Success. No rows returned."

This adds one new table, `ideas`. Nothing existing is touched.

## Step 2: copy the files in, then push

```
git add .
git commit -m "Add Idea Vault"
git push
```

## Step 3: test it

1. Open a board, click "Idea Vault" in the toolbar.
2. If you haven't run Step 1 yet, you'll see a note about the database
   update still being needed - that's expected.
3. Write something down and save it.
4. Try changing its stage in the dropdown (Idea -> Considering ->
   Validated -> Planned -> Building -> Released -> Archived).
5. Click "Turn into task" on one - it should appear as a real task on
   your board, and the idea's own stage automatically moves to
   "Building" (it doesn't disappear from the vault, so you can still see
   where every idea ended up).
