# Setting up: Task Templates

Two new things in the dashboard: a "Save" button inside every ticket's
edit screen (under "Task templates"), and a "Templates" button in the
toolbar.

For work you do over and over - a weekly content batch ticket, a
client-onboarding checklist, a lesson you teach every term - save it
once, then create a fresh, fully independent new ticket from it any
time. Editing a ticket made from a template never touches the
template, and editing the template later never touches tickets already
made from it.

No new provider account needed - just your existing Supabase project.

## Step 1: run the database update

1. Supabase dashboard -> SQL Editor -> New query.
2. Open `supabase/schema_v38_task_templates.sql`, copy all of it,
   paste, click Run.
3. You should see "Success. No rows returned."

This adds one new table, `task_templates`. Nothing existing is touched.

## Step 2: copy the files in, then push

```
git add .
git commit -m "Add Task Templates"
git push
```

## Step 3: test it

1. Open any ticket, scroll to "Task templates," click Save, and give
   it a name when asked.
2. Click "Templates" in the toolbar - your saved template should be
   listed, along with how many checklist items it carries over (if
   any).
3. Click "Create ticket from this" - a brand new ticket appears on
   your board with that title, notes, and checklist already filled in.
4. If you haven't run Step 1 yet, both the Save button and the
   Templates list quietly explain the database update is still needed,
   instead of erroring.
