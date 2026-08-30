# Setting up Memory Vault

## Nothing to set up in Supabase

Searches tables that already exist, protected by the same RLS rules
they already have. No migration needed. Copy the files in and it's
live.

---

## Be honest about what this is

The original master-plan idea for "Memory Vault" was semantic
search — type a vague description and find the right note even if it
doesn't share exact words with your search. That needs a vector
database extension plus a real embeddings API (OpenAI or similar) — a
genuine new-provider decision that hasn't been made yet, so it wasn't
faked here.

**What v1 actually is:** real, honest keyword search — case-
insensitive, matches anywhere in the text — across everything you've
ever written in Boardly, in one place, across **every board**, not
just the one you're currently on:

- Task titles and notes
- Decisions (decision, reason, alternatives, outcomes)
- Client feedback (comments from the Client Portal)
- Commitments
- Waiting Room items

Tap **Memory Vault** in your toolbar, start typing (2+ characters),
and results appear grouped by type as you type. Tap any result to
jump straight to it — a task opens its full ticket (switching boards
first if it's on a different one), a decision/commitment/waiting item
opens its own dedicated view.

If a real embeddings provider gets set up down the line, this is the
file that would upgrade — the search box and grouped results wouldn't
need to change, only how matching works underneath.

---

## Step 2: copy the files in

- `dashboard.html` (updated — new button, new modal)
- `css/style.css` (updated — same modal-above-tab-bar fix as always)
- `js/memory-vault.js` (brand new file)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Add Memory Vault (keyword search across everything)"
git push
```
