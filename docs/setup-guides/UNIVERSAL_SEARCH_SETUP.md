# Setting up: Universal Search (Command Palette)

Extends the existing Ctrl+K / Cmd+K command palette, which used to
only search task titles, to also search Documents, Proposals, Custom
Forms, Milestones, Playbooks, Idea Vault entries, and CVs - one box for
everything, addressing the "universal cross-entity search" gap the
last full audit (`docs/BOARDLY_AUDIT.md`) flagged as missing.

## Already deployed / nothing new to run

No new table, no new Edge Function - this only adds new read queries
against tables that already exist. Just pull the code and push.

```
git add .
git commit -m "Add universal search to the command palette"
git push
```

## How it works

Type 3 or more characters into the command palette and, alongside the
existing task results, you'll now see matches from every other real
content type in the product - a document, a proposal, a form, a
milestone, a playbook, an idea, or one of your CVs - each labeled with
which board it's on.

Clicking a result switches you to the right board and opens that
feature's own list (Documents, Proposals, Forms, and so on), rather
than trying to jump straight into the specific item's own editor. That
was a deliberate scope decision: reliably landing you in the right
PLACE beats a fragile shortcut that would need this one search function
to understand the internal loading order of six unrelated feature
files. From that list, opening the exact item is one more click.

CVs are the one exception - since a CV isn't board content, clicking a
CV result takes you straight to `cv-builder.html?open=<id>`, which
loads that exact CV directly.

## Why a missing table doesn't break the search

Every query is wrapped so that a table that doesn't exist yet (a
feature whose migration hasn't been run) just contributes zero results
instead of throwing an error that could break the rest of the search.
Same "explain, don't break" discipline every other add-on in this
project already follows.
