# Setting up: the Plan / Capability System (Free, Pro, Pro+)

This is Phase 1 foundation work from the new master build spec: a
CENTRALIZED system for what Free, Pro, and Pro+ each unlock, instead of
scattering `if (plan === "pro")` checks through the app. Read this
whole file before running anything - there's an important read-only
step before you touch the database.

## Read this first: there's no real payment processor for this yet

Paystack is already connected in Boardly, but only for one specific
thing: holding client payment in escrow on Marketplace jobs. It is
NOT wired up for recurring subscriptions, and building a fake
"Upgrade to Pro - $9/mo" button that doesn't actually charge anyone
would be exactly the kind of fake billing the build spec explicitly
forbids. So for now:

**Moving someone onto Pro or Pro+ is a manual step you do yourself** -
either through the new admin dashboard (Step 1b below), or directly in
the Supabase Table Editor if you'd rather. A real self-serve checkout
flow (Paystack subscriptions + a webhook that actually updates
`user_plan`) is a substantial separate project on its own - flag it
separately when you want to tackle it, rather than it being silently
bundled into this.

## What's gated so far: exactly one thing

Only **inviting someone else onto a board** (Task Assignment /
collaboration) is gated behind Pro right now - this matches what
`pricing.html` already promised as the paid "Team" tier before this
update even happened ("Invite teammates onto one board"). Nothing else
in Boardly changed. This is intentional: the build spec itself warns
against making 50 unrelated changes at once, so this pass built the
real, working SYSTEM and gated one real feature with it, rather than
touching dozens of features in one go.

## Step 1: run the migration

In the Supabase SQL Editor, run `supabase/schema_v49_capability_system.sql`.

This adds one new table, `user_plan` - one row per user, defaulting to
Free. A user with no row at all is treated as Free everywhere this is
checked, so there's nothing to backfill for your existing users.

## Step 1b: set up the admin dashboard

There's now a real page for moving people between Free/Pro/Pro+, at
`admin.html`, instead of doing it by hand in the Supabase Table Editor
every time. It is NOT linked anywhere in the site's normal navigation -
bookmark it yourself, or type the URL directly. That's just etiquette
though, not the actual security - the real protection is server-side:

1. Set the `ADMIN_EMAILS` secret (comma-separate more than one email if
   you ever add a co-admin):
   ```
   supabase secrets set ADMIN_EMAILS=youremail@example.com
   ```
2. Deploy the two functions this page needs:
   ```
   supabase functions deploy admin-list-users
   supabase functions deploy admin-set-plan
   ```
3. Sign in with an account whose email is in `ADMIN_EMAILS`, then open
   `admin.html`. You should see every Boardly account with a plan
   dropdown next to each one - change it and it saves immediately.
4. Sign in with any OTHER account and open `admin.html` - you should
   see "Not authorized," with no user list at all. This is the real
   test: the page isn't just hidden from that account, the server
   genuinely refuses to hand it any data.

The affected person also gets a real Notification Center entry the
moment their plan changes, so a change here doesn't happen silently.

## Step 2: redeploy the invite-member function

```
supabase functions deploy invite-member
```

The REAL enforcement of "Free users can't invite people" lives here,
server-side - not in the browser. A client-side check in
`collaboration.js` also exists, but only as a fast, friendly early
exit; it is not the security boundary. Someone could open their
browser console and skip right past any client-side check, so the
actual gate has to live in the Edge Function, which it now does.

## Step 3: copy the files in, then push

```
git add .
git commit -m "Add the Free/Pro/Pro+ capability system, gate collaboration"
git push
```

## Step 4: test it

1. As a normal (Free) user, open a board and try to invite someone.
   You should see a "Paid plan needed" popup instead of an invite going
   out.
2. As the admin, open `admin.html` and set that same account's plan to
   Pro (or, if you'd rather do it by hand: Supabase Table Editor >
   `user_plan` > insert a row with that user's `user_id` and
   `plan` = `pro`).
3. Reload Boardly, try inviting someone on that same board again - it
   should work normally now.
4. Open Settings - you should see "Your plan: Pro" near the top.
5. Try inviting someone from a totally different (still Free) account
   - it should still be blocked. This confirms the gate is genuinely
   per-user, not global.

## An important safety detail: this can't accidentally lock anyone out

If you deploy the updated `invite-member` function BEFORE running the
SQL migration (easy to do by accident, since they're two separate
steps), invites keep working for everyone exactly as they do today -
the function specifically checks whether `user_plan` failed to load
because the table doesn't exist yet, and treats that as "don't enforce
anything," not as "block everyone." Only once the table genuinely
exists and returns a real answer does Free actually mean Free. This
matters because otherwise, deploying code and running SQL in the wrong
order would have broken a feature every existing user already relies
on, for everyone, until you noticed.

## How to gate something else later

1. Add a new key to `PLAN_CAPABILITIES` in `js/entitlements.js` - the
   one and only place that says what each plan unlocks.
2. In the feature's own code, replace whatever check currently guards
   it with `if (!can("your_new_key")) { showUpgradePrompt("..."); return; }`
   for the friendly client-side early exit.
3. If the feature has its own server-side Edge Function, add the same
   `user_plan` lookup there too (copy the pattern from
   `invite-member/index.ts`, including the fail-open-on-missing-table
   behavior) - that's what actually enforces it. If the feature is
   purely client-side with no Edge Function of its own, the RLS
   policies protecting its own tables are what needs the real
   enforcement instead - the client-side `can()` check alone is never
   enough on its own.
