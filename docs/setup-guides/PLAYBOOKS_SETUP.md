# Setting up: Playbooks

A new "Playbooks" entry in the toolbar's "More tools" dropdown.
Procedures worth writing down once - "How we onboard a new logistics
client," "Publishing a social media post," a lesson you teach every
term - so the steps live somewhere real instead of only in your head.

Different from the other two similar-sounding features:
- **Task Templates** create a new ticket.
- **Idea Vault** is for things you haven't committed to yet.
- **Playbooks** is just knowledge - steps to follow, referenced as many
  times as you need, never turning into anything on its own.

No new provider account needed - just your existing Supabase project.

## Step 1: run the database update

1. Supabase dashboard -> SQL Editor -> New query.
2. Open `supabase/schema_v42_playbooks.sql`, copy all of it, paste,
   click Run.
3. You should see "Success. No rows returned."

This adds one new table, `playbooks`. Nothing existing is touched.

## Step 2: copy the files in, then push

```
git add .
git commit -m "Add Playbooks"
git push
```

## Step 3: test it

1. Toolbar -> More tools -> Playbooks.
2. Write a title and the steps (one per line works well), save.
3. Click the title to expand it - you can edit the content right there
   and hit "Save changes," or delete it with the trash icon.
4. If you haven't run Step 1 yet, you'll see a note about the database
   update still being needed instead of a blank list.
