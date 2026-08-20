# Setting up real collaboration (invite people, comments, mentions)

This adds three things on top of your existing setup:

1. **Board members** - invite someone by email to a specific board, as
   an editor (can add/edit tasks) or a viewer (read-only).
2. **Task comments** - a thread on each task, visible to everyone on
   that board.
3. **@mentions** - typing `@someone@email.com` in a comment notifies
   them if they're a member of the board.

Read this once, honestly: until now, every board and task in Boardly
could only ever be seen by the one account that created it - the
"realtime sync" and "live cursors" you may already have running are
about your own account staying in sync across your own tabs and
devices, not about other people. This is the first release where a
second real person can actually get onto a board.

Requires `schema.sql` through `schema_v16_ai_brief.sql` already run.
Do these in order.

---

## Step 1: run the collaboration database migration

Supabase dashboard → SQL Editor → New query → paste the whole contents
of `supabase/schema_v17_collaboration.sql` → Run.

This is additive only: new tables (`board_members`, `task_comments`),
new RLS policies alongside your existing ones, and a trigger that
attaches a pending invite the moment the invited person signs up.
Nothing existing is touched.

## Step 2: deploy the invite-member Edge Function

```
supabase functions deploy invite-member
```

No new secrets needed - it uses the same `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` every other
function already has.

Why this needs a server function at all: adding someone to
`board_members` is something your own session can already do under
RLS, but checking whether the invited email already has a Boardly
account requires the service role key, which must never reach the
browser - same reasoning as `delete-account`.

## Step 3: add `task_comments` and `board_members` to realtime

If your Supabase project didn't already have every table in the
`supabase_realtime` publication turned on automatically, run this once
(the last two lines of `schema_v17_collaboration.sql` do this for you,
but confirm in Database → Replication if comments aren't showing up
live for a second person).

## Step 4: you're done - what to expect

- Open a board → the new person icon next to your board name lets you
  invite someone by email.
- If they already have a Boardly account, they'll see the board next
  time they load the app.
- If they don't yet, nothing breaks - the invite sits pending, and the
  moment they sign up with that exact email, they're in.
- Open any task → there's now a comment thread under the title.
  Type `@` followed by a board member's email to mention them.

## What this does not do yet

- No accept/decline step - being invited means being in, there's no
  pending-approval UI on the invited person's side yet.
- No granular per-field permissions - editors can create/edit tasks,
  only the board owner can delete one.
- No email notification when you're invited or mentioned - today it's
  in-app only (a toast, if you're already looking at the task when it
  happens). Wiring mentions into the existing `send-push` /
  `daily-digest` functions is a natural next step, not done here.
