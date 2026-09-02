# Setting up: Activity Log

The foundation piece described in your "seven features" doc: *"Every
important action creates an event... this becomes the raw material for
intelligence."* Silent Sentinel and Reality Mode compute their signals
live from current task state and don't need history - but a real
timeline of what actually happened is its own useful thing, and it's
what Opportunity Radar will need to build on next.

New "Activity" entry in the toolbar's "More tools" dropdown shows it -
this isn't just invisible plumbing, it's a real, working timeline you
can open right now.

## Step 1: run the database update

1. Supabase dashboard -> SQL Editor -> New query.
2. Open `supabase/schema_v48_activity_log.sql`, copy all of it, paste,
   click Run.

This adds one new table, `activity_events`. Nothing existing is
touched. Events older than 180 days are pruned automatically - longer
than Security Center's 90 days on purpose, since Opportunity Radar
(built later, on top of this same table) will need enough history to
actually notice a pattern.

## Step 2: copy the files in, then push

```
git add .
git commit -m "Add Activity Log"
git push
```

## Step 3: test it

1. Create a ticket, then complete it.
2. Toolbar -> More tools -> Activity - you should see both events,
   newest first, with how long ago each happened.
3. Assign a ticket to a collaborator (needs Task Assignment already set
   up) - that shows up too.

## What's logged right now

- Ticket created
- Ticket completed / reopened
- Ticket moved between any two other columns (e.g. To Do -> In Progress)
- Ticket deleted
- Ticket edited (title, due date, category, or priority changed)
- Ticket assigned / unassigned
- Milestone completed
- An Autopilot rule actually did something
- A client left a comment through the Client Portal
- A client approved a ticket or requested changes through the Client
  Portal

No new database table was needed for this - `event_type` is a plain
text column, not a fixed list, so new kinds of events are just new
`logActivity(...)` calls, same pattern as before.

## Extra step for this update: redeploy one Edge Function

The two client-portal events (a client commenting, approving, or
requesting changes) happen on Supabase's side, not in the browser -
someone using the Client Portal has no Boardly login at all, so they
can't use the normal browser-side logging helper. That means
`client-portal-action` needed a small code change, and needs
redeploying for the new events to start showing up:

```
supabase functions deploy client-portal-action --no-verify-jwt
```

Same `--no-verify-jwt` flag as before (a client portal visitor still
has no login token to send) - nothing else about how this function is
deployed has changed.

Every other new event type here is just a browser-side `logActivity(...)`
call, so no other redeploys are needed - only `git push` the updated
`.js` files.
