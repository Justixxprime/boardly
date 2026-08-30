# Setting up: Timesheets

A new "Timesheet" button in the toolbar. A real weekly hours view -
Monday through Sunday, broken down by ticket, with a week total and a
CSV export you can hand to a client or an employer.

It's built on top of the Start/Stop timer that already exists on every
ticket (needs `schema_v11_dev_features.sql` - if you've used that timer
before, you already have this). Every time you stop that timer, one
row gets written to a new ledger table this migration adds. Nothing
about the existing timer changes - the little clock badge on a ticket
and its running total in the edit screen work exactly as before.

No new provider account needed - just your existing Supabase project.

## Step 1: run the database update

1. Supabase dashboard -> SQL Editor -> New query.
2. Open `supabase/schema_v39_time_entries.sql`, copy all of it, paste,
   click Run.
3. You should see "Success. No rows returned."

This adds one new table, `time_entries`. Nothing existing is touched.

## Step 2: copy the files in, then push

```
git add .
git commit -m "Add Timesheets"
git push
```

## Step 3: test it

1. Start the timer on a ticket (in its edit screen, under "Time
   tracking" - needs `schema_v11_dev_features.sql` too, if you haven't
   run that one yet), let it run a few seconds, then stop it.
2. Open "Timesheet" in the toolbar - that session should show up under
   today's column for that ticket.
3. Use "Log time by hand" to add an entry for work that was never
   tracked live - pick a ticket, a date, and how many hours.
4. Click the arrows to move between weeks.
5. Click "Export CSV" - it downloads a spreadsheet-ready file of
   exactly what's on screen for that week.

## A note on scope

This shows time across ALL of your boards for the week, not just the
one you currently have open - a timesheet is a personal record of
hours worked, not something that should hide time just because you're
looking at a different board right now.
