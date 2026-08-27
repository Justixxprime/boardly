# Setting up: Post Preview + Share

## Nothing to set up in Supabase

Pure front-end feature — no schema change. Copy the files in and it's
live.

---

## What this actually is

Two real things, and one honest boundary on what's actually possible
from a website without each platform's own developer approval:

### 1. Preview

Every card in Content Calendar now has a **Preview** button. It shows
a stylized mockup of the post — the platform's own color and icon,
your attached image or video (or a soft placeholder if there isn't
one yet), your caption and hashtags, and a live character count
against that platform's real limit (Boardly already knew these:
Instagram 2,200, X 280, LinkedIn 3,000, and so on) — turning red if
you're over.

### 2. Share

Every card also has a **Share** button. On your phone, this tries the
real **Web Share API** first — the same "share sheet" you get from any
other app — which hands the actual attached image/video AND your
caption over to whichever app you pick (Instagram, TikTok, WhatsApp,
Notes, anything installed). This works because iOS Safari supports
sharing files this way, not because Boardly has any special access to
those apps.

Where that's not available (most desktop browsers), Share opens the
same Preview screen instead, which shows a **"Share to"** row with
real, working web links for X, WhatsApp, and Telegram — plus Facebook
and LinkedIn once you've set a live post URL (their share links need
an actual URL to pull a preview from; without one they'd just open
empty, so they're hidden until there's a link on file).

**The one honest limit:** Instagram, TikTok, and YouTube don't offer
*any* web link for composing a new post — that's a real limitation of
those platforms, not something Boardly is choosing not to build. For
those three, Preview shows a note and a **Copy caption** button
instead, so you can paste it in the app yourself.

---

## Step 2: copy the files in

- `dashboard.html` (updated — new preview modal, note: this uses
  "cc-preview-*" naming to avoid clashing with the *other*, older post
  preview already inside the task edit modal — that one's still there
  and untouched, it previews whatever you're currently typing before
  you've even saved; this new one previews an already-saved card from
  the Content Calendar list)
- `js/content-calendar.js` (updated)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Add post preview and share to Content Calendar"
git push
```

---

## What this does not do yet

- Nothing is auto-posted anywhere — Share always hands off to a real
  app or a real web page for a person to actually hit "post"
  themselves. True one-click auto-posting needs each platform's own
  developer app review (Meta, TikTok, etc.) — a much bigger, separate
  undertaking with its own approval process, not something to fake.
- The live preview only shows your first attached image or video, not
  a full carousel.
