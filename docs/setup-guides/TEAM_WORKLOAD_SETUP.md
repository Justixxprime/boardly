# Setting up: Team Workload (capacity vs assigned)

Phase 3 of the master build spec: comparing what each person on a
board can actually handle against what's currently assigned to them,
using real ticket estimates (schema_v54) rather than a guess.

## Step 1: run the migration

In the Supabase SQL Editor, run `supabase/schema_v55_team_capacity.sql`.

## Step 2: deploy the new Edge Function

```
supabase functions deploy set-my-capacity
```

This exists because `board_members`' own security rules deliberately
only let the board OWNER write to a member's row (so a member can't
quietly promote their own role) - this function lets someone update
just their OWN capacity number without touching that rule. The board
owner's own capacity doesn't need this function at all; it's stored on
the board itself, which owners can already update directly.

## Step 3: copy the files in, then push

```
git add .
git commit -m "Add Team Workload (Phase 3)"
git push
```

## Step 4: test it

1. Make sure a couple of tickets have both an Estimated time
   (schema_v54) and someone assigned to them (Task Assignment).
2. Open the board menu → **Team workload**.
3. Enter your own weekly capacity in hours - it saves as soon as you
   click away from the field.
4. You should see a bar showing assigned hours against that capacity -
   green if there's room, orange approaching the limit, red over it.
5. As a different (invited, non-owner) account, try the same thing -
   it should save via the Edge Function instead, and still only ever
   let you edit your own row, never anyone else's.

## An honest limitation

This uses ticket estimates as a stand-in for real hours-of-work data,
and a single flat weekly-capacity number rather than a full
days-off/vacation calendar - the master spec describes a richer model
than that. This version answers the real question ("who's overloaded
right now") using data Boardly already has, rather than requiring a
whole separate calendar feature to be built first before this could
exist at all.
