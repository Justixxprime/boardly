# Setting up: real smart search (Memory Vault embeddings)

This turns Memory Vault from keyword search into real search-by-
meaning. It takes about 10 minutes and costs nothing.

**Why Gemini specifically:** of the realistic free options, Google's
Gemini API is the best fit for this one job — genuinely free forever
(not a trial that runs out), no credit card needed to start, and it's
a "you hold one key, server-side" model exactly like everything else
in Boardly already works. (Puter.js was the other option floating
around — it's a different model entirely: every person using your app
would need their own separate account with a third party to pay for
their own usage. That's not what Boardly wants, so it's not part of
this.)

---

## Step 1: get a free Gemini API key (no card required)

1. Go to **[aistudio.google.com](https://aistudio.google.com)** and
   sign in with any Google account.
2. Click **"Get API key"** (top left or in the menu).
3. Click **"Create API key"**. It's issued instantly — no billing
   setup, no card.
4. Copy the key somewhere safe for a moment — you'll paste it into
   Supabase next.

---

## Step 2: add the key to Supabase

From your terminal, inside your `boardly` project folder:

```
supabase secrets set GEMINI_API_KEY=paste_your_key_here
```

---

## Step 3: run the database migration

1. Open Supabase → **SQL Editor** → **New query**.
2. Copy everything from
   `supabase/schema_v29_memory_vault_embeddings.sql`, paste it in,
   click **Run**.
3. This turns on pgvector (a feature that already ships with every
   Supabase project, free — this just switches it on) and adds one
   new "embedding" column to five tables. Nothing existing is touched.

---

## Step 4: deploy the new Edge Function

```
supabase functions deploy generate-embedding
```

(No `--no-verify-jwt` needed here — unlike the Client Portal
functions, this one is only ever called by you, signed in, so it
should require a normal login, and it does by default.)

---

## Step 5: copy the rest of the files in

- `js/dashboard.js` (updated — one new readiness check)
- `js/memory-vault.js` (rewritten)
- `dashboard.html` (updated — new status line and "Build search index"
  button inside Memory Vault)

Then:

```
git add .
git commit -m "Add real semantic search to Memory Vault (Gemini embeddings)"
git push
```

---

## Step 6: build your search index

1. Open Boardly, tap **Memory Vault**.
2. You should see "Smart search is on" near the top instead of the
   keyword-search message.
3. Tap **Build search index** at the bottom. This looks at everything
   you've ever written — tasks, decisions, client feedback,
   commitments, waiting items — and generates a "meaning fingerprint"
   for each one that doesn't already have one. You'll see a progress
   count while it works.
4. Once it says "Indexed," search away. Try something that doesn't
   share exact words with what you wrote, like searching "the driver
   who kept being late" when what you actually typed was "Mike's 3rd
   missed delivery this month" — that's the difference real semantic
   search makes.

**You only need to tap "Build search index" again when you want newly
added notes to become searchable this way** — it's not automatic on
every save, on purpose, so nothing is quietly making API calls in the
background without you knowing. It only ever processes what's new
since last time, so re-running it later is quick.

---

## What happens if something's not set up right

Memory Vault never breaks — if the migration hasn't run, the function
isn't deployed, or the key is missing or wrong, it silently falls back
to the same keyword search it always had. You'll just see "Keyword
search" instead of "Smart search is on" at the top, with a reminder to
check this doc.

---

## What this does not do yet

- Indexing is manual (the button), not automatic on every save — see
  the honest reasoning above.
- Free-tier Gemini has a daily request cap. If "Build search index"
  reports some failures, that's very likely why — just run it again
  later (it only retries what's still missing, so nothing's wasted).
- This searches text only — image or video attachments aren't
  embedded, only whatever text is written around them.
