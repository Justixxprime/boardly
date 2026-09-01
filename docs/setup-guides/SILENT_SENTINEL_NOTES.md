# Silent Sentinel (built on your existing Board Health)

You asked for "Silent Sentinel" - your own spec said it best: *"tell me
when something needs my attention, but don't make me constantly
check."* That's a UI/timing property, not a different detection system
- so rather than building a second, parallel thing that re-detects the
same overdue/blocked/stale tickets Board Health already finds (which
would be exactly the "duplicate functionality" your master spec says
to avoid), Sentinel is the ambient layer sitting on top of it.

## What's new

**A quiet badge next to your board's name.** Nothing to open, nothing
to check - it's just there when something needs a look, and gone when
it doesn't. Click it to jump straight into Board Health for the
details.

**Two new detection signals**, on top of the five Board Health already
had (overdue, blocked, stale, due soon, no due date):
- **Forgotten** - still in To Do, created a while ago, and nobody's
  assigned to it (needs `schema_v46_task_assignment.sql` - without it,
  this just checks "still in To Do and old", which is still useful on
  its own).
- **Client waiting** - shared with the client but they haven't
  approved or requested changes yet, and it's been a while (needs
  Client Portal to be set up - quietly does nothing otherwise, no error).

No new database migration for the badge/detection logic itself - it's
built entirely from data schema_v40 (Milestones) and earlier already
introduced. If you've already run schema_v46 (Task Assignment) and set
up Client Portal, both new signals work immediately; if not, they just
sit at zero rather than erroring.

## Copy the files in, then push

```
git add .
git commit -m "Add Silent Sentinel (ambient badge + 2 new signals)"
git push
```

## Test it

1. Create a ticket, leave it in To Do, don't touch it (you can fake
   this by backdating - or just trust the logic and wait).
2. Open Board Health once to confirm your existing signals still work
   exactly as before.
3. The badge next to your board's name should reflect the same total -
   try clicking it, it should open Board Health directly.
