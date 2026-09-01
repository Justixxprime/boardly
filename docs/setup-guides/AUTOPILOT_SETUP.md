# Setting up: Boardly Autopilot

A new "Autopilot" entry in the toolbar's "More tools" dropdown.
WHEN a ticket moves to a status you pick, THEN Boardly does the
routine follow-up automatically - no need to ask it, no need to
remember to do it yourself.

Kept deliberately narrow for v1, matching what Boardly's data actually
has (not a generic do-anything automation builder): one trigger shape
(a ticket moved to a given status), one optional condition (category),
and three actions (move it again, assign it to someone, or notify you).

## Step 1: run the database update

1. Supabase dashboard -> SQL Editor -> New query.
2. Open `supabase/schema_v47_automation.sql`, copy all of it, paste,
   click Run.

This adds two new tables (`automation_rules`, `automation_runs` - the
second is the execution history, logging every run whether it
succeeded or failed). Nothing existing is touched.

## Step 2: copy the files in, then push

```
git add .
git commit -m "Add Boardly Autopilot"
git push
```

## Step 3: test it

1. Toolbar -> More tools -> Autopilot.
2. Try: name it "Notify me when done," WHEN moved to Done, IF category
   is Any, THEN Notify me. Save.
3. Drag any ticket to Done (or check it off) - your notification bell
   should show "Autopilot: Notify me when done" a moment later.
4. Try a chained one: WHEN moved to Done, THEN move it to To Do (a
   silly example, but a good test) - watch it actually move again on
   its own.
5. Toggle a rule off with the switch icon - it stops firing without
   being deleted, so you can turn it back on later.

## What it deliberately does NOT do

- It only fires from dragging a card or using the checkbox - not from
  the AI assistant's bulk actions ("move all overdue to Sarah," "clear
  my done column"). Those are already a deliberate bulk action on
  their own; stacking automatic behavior on top of a bulk operation is
  exactly the kind of surprising cascade this feature has to avoid.
- A chain of automations triggering more automations stops itself
  after 3 hops on the same ticket, logged clearly as "stopped: possible
  loop" rather than spinning forever or failing silently.
- "Notify" always notifies whoever created the rule - not because it
  can't reach anyone else, but because a normal signed-in user's
  browser is blocked on purpose from writing a notification into
  someone ELSE's bell directly (see schema_v36_notifications.sql). If
  you want Autopilot to notify a specific collaborator later, that's a
  clean follow-up, not a limitation baked into the design.
