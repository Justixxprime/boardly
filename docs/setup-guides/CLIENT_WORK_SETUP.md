# Setting up Client Work

## Nothing new to set up in Supabase

Same fields as before (Client, Project). No migration needed for this
update. Copy the files in and it's live.

---

## What changed: Client Work now sees across every board type

**Before:** Client Work only ever showed tasks whose type was
Freelance.

**Now:** it shows the combination of two things —

1. Every Freelance-typed task (same as before), **and**
2. Every task marked **"Show this to the client in their Client
   Portal"** (the Client Portal feature's own checkbox), no matter
   what vertical that task belongs to.

So if you mark a Teaching lesson or a Dev Board task as client-
visible, it now shows up in Client Work too — because it genuinely is
something you're delivering to a client, even if it's not "freelance
work" in the strict sense. Each card gets a small badge naming its
actual type (e.g. "Teaching," "Software / Web Dev") when it's not
Freelance, plus a teal **"In Client Portal"** badge when it's shared
with a client — so a mixed list still stays easy to read at a glance.

Everything else works the same: grouped by client, sorted by
urgency, **Mark delivered** with an optional note.

---

## Step 2: copy the files in

- `js/client-work.js` (rewritten)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Client Work now shows client-visible tasks across every vertical"
git push
```

---

## What this does not do yet

- No invoicing, payment tracking, or "amount owed."
- The delivery note is a single line of text.

