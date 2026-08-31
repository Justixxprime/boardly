# Setting up: Public Roadmap + Voting

A new "Public roadmap" row inside Idea Vault. Publishing gives you a
link anyone can open to see your ideas laid out as Now / Next / Later /
Done, and vote on the ones they want prioritized - no Boardly account
needed to vote.

**Important:** this is a completely separate link from your Client
Portal link, on purpose. A roadmap link is meant to be handed out
widely (posted publicly, shared with a team or client base) - reusing
the same private token as Client Portal would mean anyone with the
(more widely shared) roadmap link could also see private client data.
They will always be two different links, even on the same board.

Only ideas in these stages are ever shown publicly: Considering,
Validated, Planned, Building, Released. The raw "Idea" stage and
Archived ones never appear - a roadmap is for things worth other people
seeing, not a window into every early, unfiltered thought.

## Step 1: run the database update

1. Supabase dashboard -> SQL Editor -> New query.
2. Open `supabase/schema_v44_public_roadmap.sql`, copy all of it,
   paste, click Run.

This adds a `roadmap_public_token` column to your existing `boards`
table, a `votes` column to `ideas`, and one new table (`idea_votes`)
that's what actually stops the same visitor voting twice - not just a
check in the browser, which anyone could get around.

## Step 2: deploy the two new Edge Functions

```
supabase functions deploy get-public-roadmap --no-verify-jwt
supabase functions deploy roadmap-vote --no-verify-jwt
```

Both need `--no-verify-jwt` - a visitor voting on a public roadmap has
no Boardly login to send, same reason Client Portal's functions need
it too.

## Step 3: copy the files in, then push

```
git add .
git commit -m "Add Public Roadmap + Voting"
git push
```

## Step 4: test it

1. Open Idea Vault, click "Publish" next to "Public roadmap."
2. Click "Copy link" and open it in a private/incognito window (so it
   isn't sharing your own signed-in session).
3. You should see your board's ideas laid out in columns. Try voting on
   one - the count goes up and the button greys out.
4. Try voting on the same one again (reload the page first) - it
   should say you've already voted, not let you vote twice.
5. Add a brand-new idea in Idea Vault at the default "Idea" stage,
   reload the public roadmap page - it should NOT appear there. Move it
   to "Considering" and reload again - now it shows up under Later.
