SUBMIT DELIVERABLE - what's in this zip
=========================================

This is the "formal submit deliverable" feature (the last open item from
the Section 94 walkthrough). It is NOT the whole Boardly project, just the
new and changed files for this one feature, so you can drop them straight
into your existing project folder and overwrite.

Files in here, and where they go:

  supabase/schema_v98_marketplace_deliverables.sql
      New. Run once in the Supabase SQL Editor. (Already applied live for
      you as part of building this, this is here for your own repo/records.)

  supabase/functions/marketplace-booking-status/index.ts
      Changed. Replaces your existing copy of this Edge Function.
      (Already redeployed live for you too, same reason as above.)

  js/marketplace.js
      Changed. Replaces your existing copy. Adds the provider-side
      "Submit deliverable" form and history on each booking.

  js/booking-status.js
      Changed. Replaces your existing copy. Adds the client-facing
      deliverable display above the release button.

  booking-status.html
      Changed. Replaces your existing copy. Adds the markup the script
      above renders into.

  features.html
      Changed. Replaces your existing copy. Adds one new feature card
      ("Submit deliverable") to the public features page.

  docs/setup-guides/MARKETPLACE_DELIVERABLES_SETUP.md
      New. The full step-by-step walkthrough, including how to test it.
      Start there if anything is unclear.

Everything else in your project folder is untouched. Nothing was deleted,
nothing else was rewritten.
