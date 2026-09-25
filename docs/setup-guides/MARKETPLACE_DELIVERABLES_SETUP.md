# Setting up: Marketplace deliverables (Submit deliverable)

This is the smallest setup Boardly has had in a while. There's no new
account to create, no new secret to set, nothing to paste into anyone's
dashboard. You already have everything this needs.

## What this actually is

Before this, once a client paid for a Marketplace booking, the money sat
held in escrow (that part already worked) but the provider had no way,
inside Boardly, to actually hand the finished work over. They'd message
the client on WhatsApp or email, and the client would just have to trust
that message before clicking "release payment."

Now, on any booking that's been paid and is sitting in escrow, the
provider can submit a deliverable, a short note plus an optional link
(a Google Drive folder, a GitHub repo, a live website, whatever fits the
job). The client sees it right on their booking status page, above the
release button, before they confirm and release the money.

One thing to be clear on, the same honesty this project uses for the
Dispute Center: submitting a deliverable does not release any money by
itself, and a client can still release payment even if nothing was ever
submitted. This is proof for the client to look at, not a lock on the
release button.

## Step 1: run the database update

1. Open your Supabase dashboard, click **SQL Editor**, click **New query**.
2. Open `supabase/schema_v98_marketplace_deliverables.sql` from this
   project folder in any text editor, select all, copy it.
3. Paste it into the Supabase SQL Editor and click **Run**.
4. You should see "Success. No rows returned." That's it, this step is done.

## Step 2: redeploy one Edge Function

Only one existing function changed, `marketplace-booking-status`. It
already runs, this update just teaches it to also send back any
deliverables a provider has submitted, so the client's booking page can
show them.

If you deploy through the Supabase CLI on your own computer:

```
supabase functions deploy marketplace-booking-status --no-verify-jwt
```

If you don't use the CLI yourself, that's fine, this one was already
deployed live for you as part of building this feature. You only need
to run this command yourself if you're setting Boardly up somewhere new
from scratch.

## Step 3: copy in the updated files

Overwrite these three files in your project folder with the versions
in the new zip:

- `js/marketplace.js`
- `js/booking-status.js`
- `booking-status.html`

Then push to GitHub as usual (`git add .`, `git commit -m "Submit
deliverable"`, `git push`).

## Step 4: test it for real

1. Open Boardly, go to **Discover > your Marketplace profile > Bookings
   tab**. Find (or create) a booking that's paid and shows "Paid, held
   in escrow."
2. Click **Submit deliverable**. Type a short note, optionally paste a
   link, click **Submit deliverable**. You should see a toast confirming
   it, and the note should now show under that booking, right there in
   your own Bookings tab.
3. Open that same booking's client-facing link (the one from
   `booking-status.html?id=...&token=...`, the client got this after
   paying). You should see a "What the provider has submitted" section
   above the release button, showing exactly what you just submitted.
4. Try submitting a second one on the same booking. Both should show,
   newest first, on both sides.

## What this does not do (stated plainly, not glossed over)

- It doesn't attach files. There's no file upload here, only a link you
  paste in (Drive, GitHub, wherever the actual files already live). File
  upload for this would be a separate, bigger feature.
- It doesn't stop a client from releasing payment without ever looking
  at a deliverable. Boardly doesn't force that decision.
- It doesn't notify the client by email or push when one is submitted.
  They'll see it the next time they open their booking link, same as
  every other status change on that page.
