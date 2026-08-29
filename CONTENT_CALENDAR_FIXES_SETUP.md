# Setting up: Content Calendar fixes (from your screenshots)

Three real bugs, all fixed. No migration needed — copy the files in.

## Step 1: copy the files in

- `js/content-calendar.js` (updated)

## Step 2: push it to GitHub

```
git add .
git commit -m "Fix Content Calendar button overflow, LinkedIn share, preview stacking"
git push
```

---

## What was actually wrong

**1. "Open" button cut off outside the card.** The row of action
buttons (Mark published, View, Preview, Share, Open) was too wide for
the card and just overflowed sideways instead of wrapping. Fixed: the
row now wraps properly, and the four secondary actions (View, Preview,
Share, Open) are compact icon-only buttons, so all five fit cleanly
regardless of screen width.

**2. LinkedIn (and Facebook) missing from Share.** These were
deliberately hidden until a post had a live URL set, since their share
dialogs work best with one. But hiding them entirely meant no LinkedIn
option at all for a post that hasn't been published yet — which is
most of them. Fixed: LinkedIn and Facebook now always show up in
Share; without a URL, they open to a blank compose box instead of a
pre-filled one, but the option is always there.

**3. Preview appearing "behind" the calendar, cut off and jumbled.**
This was a real bug: opening Preview never actually closed the Content
Calendar modal underneath it — both were rendering on screen at the
same time, competing for the same space. Fixed: opening Preview now
properly closes Content Calendar first, and closing Preview brings
Content Calendar back, instead of leaving you with nothing open.
