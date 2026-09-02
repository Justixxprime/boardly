# Setting up: Boardly Intelligence Graph (v1)

This is the last of the seven features from your doc. Per your own
notes: this was never meant to be a literal graph database - the
relational data already exists (task dependencies via `blocked_by_id`,
milestones linked to tasks, client responses, assignment). What was
actually missing was a reasoning layer on top of it: the AI assistant
never saw any of that data, so a question like "why is X delayed" could
only ever be a guess dressed up as an answer.

This update doesn't add a new feature surface - it teaches the existing
board assistant (Ask AI, same one Do It For Me and Emergency Mode also
use) to actually look at these relationships before answering, instead
of speculating.

## Step 1: no database changes needed

Every relationship this uses already exists in tables you've already
set up (task dependencies, milestones, task assignment, client portal).
This is purely about what gets sent to and read by the assistant. Skip
straight to step 2.

## Step 2: redeploy the board-assistant function

```
supabase functions deploy board-assistant
```

## Step 3: copy the files in, then push

```
git add .
git commit -m "Add Boardly Intelligence Graph reasoning to the board assistant"
git push
```

## Step 4: test it

This only shows up as clearly grounded answers on boards that actually
have some of these relationships set up already:

1. Set up a real dependency: edit a ticket, set "Blocked by" to another
   ticket that isn't done yet (needs Dev Fields / schema_v11 run).
2. Open Ask AI and ask "why is [that ticket's title] delayed?" - the
   reply should specifically name the blocking ticket, not a vague
   general answer.
3. If you have Milestones or Task Assignment set up, try "what's left
   on [milestone name]" or "what's assigned to [a collaborator]" too.
4. Ask about a ticket that has none of these relationships set - the
   assistant should say it doesn't see a known blocker, rather than
   inventing one.

## What actually changed

Two small, related changes:

- The task list Boardly already sends to the assistant (in
  `js/dashboard.js`) now includes a few extra fields, but only for
  tasks where they're actually relevant - what a task is blocked by,
  what other tasks are waiting on it, its milestone and that
  milestone's real live progress, who it's assigned to, and any client
  response through the Client Portal. All of this is built from data
  that was already in `state` - nothing new to load.
- The assistant's own instructions (in
  `supabase/functions/board-assistant/index.ts`) now explain what those
  fields mean and tell it to use them - and only them - when explaining
  a delay or a blocker, and to say plainly when nothing in the data
  explains something rather than guessing.
