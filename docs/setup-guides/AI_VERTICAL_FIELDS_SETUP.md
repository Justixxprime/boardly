# Setting up: AI now understands vertical fields

## Step 1: redeploy the AI function

```
supabase functions deploy board-assistant
```

That's it — no new secret, no new migration. This function already
existed; it just got smarter.

---

## What this actually fixes

You now have 7 board types, each with its own extra fields — Driver
and Delivery address on Logistics, Repository and Tech stack on
Software, Caption and Hashtags on Social Media, and so on. The AI
assistant never knew any of that existed. Ask it to "add a delivery
for the Johnson order, driver is Mike" and it could only create a
plain task — the Driver field would stay empty, because the AI had no
idea that field was even there.

**Now it does.** When you talk to the AI on a board with vertical
fields, it's told exactly which extra fields exist for that board (and
for every other type, in case it needs to set up a task as a
different type than the board itself — mixed boards, from a few
updates ago). It can now:

- Fill in vertical fields when creating a task ("add a social post for
  the Q4 launch, caption: '...' " → sets Campaign and Caption)
- Update just the vertical fields on an existing task without
  touching anything else
- Set a task's own Type when you clearly ask for something different
  from the board's default ("add a delivery task" on a general board)

Updates **merge** into a task's existing vertical fields rather than
replacing them wholesale — same rule Boardly's AI already follows for
checklists, so asking it to update one field never wipes out the
others.

---

## Step 2: copy the files in

- `js/dashboard.js` (updated — sends the board's vertical field
  schema to the AI, and applies task_type/metadata back from its
  actions)
- `supabase/functions/board-assistant/index.ts` (updated — the AI now
  knows about vertical fields and task types)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "AI assistant now understands vertical fields and task types"
git push
```
