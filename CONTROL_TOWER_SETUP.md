# Setting up the Logistics Control Tower

## Step 1: nothing to set up in Supabase

This one doesn't need any migration at all. Boards already know their
own "type" (general, logistics, teaching, etc — from way back in
`schema_v12_work_type.sql`), and logistics tasks already have a
Customer, Delivery address, and Driver field on them (from
`schema_v14_vertical_fields.sql`). This just reads that same
information in a more useful way. Copy the files in and it's live.

---

## What this actually is

Right now, a logistics board is just a regular kanban board with
extra fields on each ticket. Useful, but if you're the one dispatching
— "what's still out, who's carrying what, is anything late" — you'd
have to scroll the whole board hunting for that. The Control Tower is
a dedicated screen that answers exactly those three questions.

**It only shows up on boards you've set to the Logistics type** —
every other board (Freelance, Teaching, General, etc.) is completely
unaffected, and the button stays hidden.

On a logistics board, you'll now see a **Control Tower** button in
your toolbar. Tap it and you get:

- A quick count: how many deliveries are active right now, and how
  many are overdue.
- Small chips across the top for each driver, showing how many
  deliveries they're currently carrying.
- A list, grouped by driver, of every active delivery — customer
  name, delivery address, and due date, with **Overdue** shown in red
  if it's past due and not yet marked delivered.
- Two buttons per delivery: **Mark delivered**, which opens a small
  optional "proof of delivery" note (like "signed by Amaka" or "left
  at the gate") before checking it off — and **Open ticket**, which
  jumps you straight into the full ticket if you need to edit
  anything else.

The proof note gets saved right on the ticket itself, so it's there
later if you ever need to look back at how a delivery was completed.

---

## Step 2: copy the files in

- `dashboard.html` (updated — new button, new modal)
- `css/style.css` (updated — same modal-above-tab-bar fix as always)
- `js/control-tower.js` (brand new file)

---

## Step 3: push it to GitHub

```
git add .
git commit -m "Add Logistics Control Tower"
git push
```

Refresh your site, switch to (or create) a board set to the
**Logistics** type, and the Control Tower button will be sitting
right in your toolbar.

---

## What this does not do yet

- No live GPS or real-time driver location — "driver" here is just
  the name typed into that field on each ticket, the same as it's
  always been.
- No route planning or optimized delivery order — deliveries are
  simply grouped by driver, not sequenced.
- The proof-of-delivery note is a single line of text — no photo
  upload yet.
