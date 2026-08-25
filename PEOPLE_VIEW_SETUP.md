# Setting up People (Relationship Engine v1)

## Step 1: nothing to set up in Supabase

Just like the Done Archive, this one doesn't touch your database at
all — no SQL Editor, no new table, no edge function, no deploy
command. It just reads two tables you may already have: Commitments
and Waiting Room. Copy the files in and it's live.

If you haven't set up Commitments (`schema_v24_commitment_guardian.sql`)
or Waiting Room (`schema_v23_waiting_room.sql`) yet, the People button
still opens — it just shows a small note telling you to set those up
first, instead of breaking.

---

## What this actually is

Two features you already have — Commitments (promises you made to
someone) and Waiting Room (things you're waiting on someone for) —
both already ask "who's this about," but as a plain text box. Nothing
before this ever pulled all of that together by the actual person.

Now there's a **People** button next to Commitments in your toolbar.
Tap it and you get:

- A list of everyone who shows up in either Commitments or Waiting
  Room, sorted so whoever you owe the most to right now floats to
  the top.
- Each person shows two small badges — how many things you owe them,
  and how many things you're waiting on them for — or a calm "All
  clear" if there's nothing open.
- Once someone has at least 2 finished commitments on record, you
  also see a plain honest line like "3 of 4 kept on time" — their
  track record. Under 2, it shows nothing rather than guess.
- Tap a person to see the actual list: what you owe them, what
  you're waiting on, and their past commitments (kept or late) —
  plus two buttons at the bottom that jump you straight into the
  full Commitments or Waiting Room screens if you want to act on
  something.

Names are matched by trimming spaces and ignoring capitalization only
— "Amaka" and "amaka " are the same person, but "Amaka" and "Amaka O."
are treated as two different people, since there's no real account
behind these, just text you typed once when adding the commitment or
waiting item.

---

## Step 2: copy the files in

From the zip, copy these into your real project folder:

- `dashboard.html` (updated — new People button, new modal)
- `css/style.css` (updated — same modal-above-tab-bar fix as always)
- `js/people.js` (brand new file)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Add People view (Relationship Engine v1)"
git push
```

Refresh your live site and the People button will be sitting right
next to Commitments in your toolbar.

---

## What this does not do yet

- It's read-only for now — you can't rename or merge two people from
  here (e.g. if you once typed "Amaka" and another time "amaka O.").
  You'd still add/edit the underlying commitment or waiting item from
  their own screens.
- It only looks at Commitments and Waiting Room. It doesn't pull in
  people from your real invited collaborators (that's a different,
  already-existing system — actual accounts, not free-text names) or
  from task assignees.
- This is across ALL your boards, not just the one you're currently
  viewing — since a commitment or waiting item can exist without
  being tied to any one board.
