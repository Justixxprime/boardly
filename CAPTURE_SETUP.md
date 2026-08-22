# Setting up Capture (Second Brain Inbox)

Reuses your AI assistant entirely - if `AI_SETUP_BABY_STEPS.md` is
already done, this works with no extra setup at all beyond
redeploying the function (its instructions changed):

```
supabase functions deploy board-assistant
```

If you've also set up Commitments and Waiting Room
(`COMMITMENT_GUARDIAN_SETUP.md`, `WAITING_ROOM_SETUP.md`), Capture can
sort into those too. If you haven't, Capture still works fine - it
just treats everything as a regular task instead.

---

## What this is for

Sometimes you don't want to think about which box something belongs
in - you just want to dump what's in your head and have it land in
the right place. That's what this does: open **Capture**, type or
paste a messy block of text, and the AI reads through it and sorts
each piece into what it actually is.

**Example input:**

> call the printer tomorrow about the order, still waiting on the
> designer for the logo, told the client I'd send the invoice Friday

**What comes out of that:**

- A task: "Call the printer about the order," due tomorrow
- A waiting-on item: "Logo from the designer"
- A commitment: "Send the client the invoice," due Friday, to "the
  client"

## How to use it

1. Click **Capture** in the board toolbar.
2. Type or paste your messy notes - full sentences, fragments,
   whatever's actually in your head. No need to format anything.
3. Click **Sort it out**.
4. The AI panel opens with a short summary of what it found and
   sorted.

## What to know

- If something in your text is too vague to confidently sort (not
  clearly a task, a promise, or something you're waiting on), the AI
  leaves it out rather than guessing wrong - it'll mention what it
  skipped in its reply, so you can add it yourself if it matters.
- This is one-directional: text in, real items out. It doesn't ask you
  follow-up questions mid-sort - if it gets something wrong, just edit
  or delete the item afterward like normal.
