# Opportunity Radar, what to do with this zip

## What this is

A new panel on your Insights page (stats.html) called Opportunity Radar.
It looks at your real clients, invoices, retainers, and marketplace
activity and flags a few honest patterns, for example:

- A client who has paid you three or more invoices but doesn't have a
  retainer set up yet.
- A marketplace service that keeps getting booked and paid for.
- Paid marketplace bookings that never came from one of your listed
  services (shown with their actual descriptions, so you can see the
  pattern yourself).
- Winning the same category of marketplace job more than once by
  applying each time, instead of having a service listed for it.

Nothing here is AI. Every flag is a plain count over your real data,
and every flag says the exact numbers behind it. If nothing clears the
threshold, the whole panel just stays hidden, it never invents
something to show you.

## What you need to do

Nothing in the database. I checked your live Supabase project directly
and every table this feature reads (invoices, retainers,
marketplace_services, marketplace_bookings, marketplace_applications,
marketplace_opportunities) already exists and is already live. No
migration needed for this feature.

All you need to do is push these three files to your repo, replacing
the ones already there:

1. `stats.html`
2. `features.html`
3. `js/opportunity-radar.js` (this one is brand new, goes in your `js`
   folder alongside your other `.js` files)

That's it. Once it's live, open your Insights page. If you don't have
three or more paid invoices for one client yet, or three or more paid
bookings on one service yet, the panel just won't show anything, that
is expected, not a bug. It'll appear once your real numbers cross
those thresholds.

## One thing worth knowing

While building this I found something in your memory notes that was
wrong. Per-service marketplace listings were marked as "still queued,
not started," but I checked your live database and the
`marketplace_services` table already exists with real rows, and the
code that reads and writes it is already in `js/marketplace.js` and
`js/marketplace-public.js`. That feature is done and live, it's just
missing its own schema file in your repo's `supabase` folder (the
table itself was applied straight to your live database at some
point, but the `.sql` file describing it was never saved to the repo).
Not urgent, but worth knowing your `supabase` folder isn't a complete
mirror of your live database schema.
