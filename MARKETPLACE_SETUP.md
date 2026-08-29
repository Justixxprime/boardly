# Setting up Marketplace

## Be honest about scope

The master plan's "Skill Marketplace / Borrow My Time / Local
Professional Network / Reputation Graph" is a real, separate product
surface — discovery, matching, reputation, and payment.

**v1 (this file) is the honest, buildable core:** a public directory
where you publish a profile describing what you do, and anyone can
find you and send an inquiry. No payment, no booking, no reputation
score — genuine discoverability, the foundation everything else sits
on top of.

**Payment, booking, and real escrow now exist too** — see
`MARKETPLACE_PAYMENTS_SETUP.md`. It's a separate, optional migration on
top of this one: run this file first, get the directory working, then
add payments whenever you're ready. Nothing below changes.

---

## Step 1: run the database migration

1. Open Supabase → **SQL Editor** → **New query**.
2. Copy everything from `supabase/schema_v30_marketplace.sql`, paste
   it in, click **Run**.
3. This adds two new tables — `marketplace_profiles` and
   `marketplace_inquiries` — nothing existing is touched. No Edge
   Function needed here (unlike Client Portal) — a profile is either
   published or it isn't, a plain condition your database can enforce
   directly.

---

## Step 2: copy the files in

- `dashboard.html` (updated — new Marketplace button and modal)
- `css/style.css` (updated — same modal-above-tab-bar fix as always)
- `js/marketplace.js` (brand new file — your own profile editor +
  inquiries inbox)
- `marketplace.html` (brand new file — the public directory page)
- `js/marketplace-public.js` (brand new file — powers that page)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Add Marketplace v1"
git push
```

---

## How to use it

1. In Boardly, tap **Marketplace** in your toolbar.
2. Fill in your profile — display name, headline, bio, skills
   (comma-separated), rate range, location, portfolio link,
   availability.
3. Tick **"Publish this profile to the public directory"** and save.
4. Tap **Copy** next to your public link to share it anywhere — or
   just point people to `yoursite.com/marketplace.html` for the full
   directory.
5. When someone finds you and sends an inquiry, it shows up under the
   **Inquiries** tab, with a one-tap "Reply by email" that opens your
   email client addressed to them.

Unpublishing (unticking the checkbox) makes your profile invisible to
everyone but you again, instantly.

---

## What this does not do yet

- No reputation score or reviews.
- No messaging inside Boardly — replies happen over email, the same
  way any inquiry form works.
- Search is simple keyword matching (name, headline, bio, skills), not
  smart matching by category.

Payment, booking, and escrow are covered separately — see
`MARKETPLACE_PAYMENTS_SETUP.md`.
