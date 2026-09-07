# Setting up: Custom Form Builder

Phase 5 of the master build spec: Forms + Automation. Boardly already
had the Public Request Portal (one fixed shape - name, email, title,
details) and Boardly Autopilot (WHEN/IF/THEN on ticket status). This is
the piece that was genuinely still missing: a form where YOU define the
questions, not Boardly.

## Why this is different from the Request Portal

The Request Portal is one link, one board, one fixed shape - good for
"let anyone send me a quick ask." But a freelancer taking on new
clients needs a completely different set of questions ("What's your
budget? What's your timeline? Do you have a logo already?") than a bug
report needs ("What page? What browser? What did you expect to
happen?"). The Request Portal can't be shaped into either of those
well, because its four fields are fixed in the code.

With this, you build your own form - pick exactly the fields you want,
in whatever order - and a board can have as many of these as you like,
each with its own separate link. A "New client intake" form and a "Bug
report" form can both live on the same board at once.

## Step 1: run the new schema file

Open the Supabase SQL Editor and run:

```
supabase/schema_v58_custom_forms.sql
```

This creates two new tables: `custom_forms` (the form itself - its
name, its fields, its own link) and `custom_form_submissions` (one row
per person who filled it out, kept even after the ticket it created
might get moved around or archived).

## Step 2: deploy the two new Edge Functions

```
supabase functions deploy get-custom-form-info --no-verify-jwt
supabase functions deploy submit-custom-form --no-verify-jwt
```

Both need `--no-verify-jwt` because a stranger filling out a public
form has no Boardly login to send along - same reason every other
public-facing function in this project needs it.

## Step 3: copy the files in, then push

```
git add .
git commit -m "Add Custom Form Builder (Phase 5)"
git push
```

## Step 4: build your first form

1. Open a board, click **More tools**, then **Forms**.
2. Click **New form**. Give it a name (just for you - the person
   filling it out never sees this unless you also fill in the
   description), and pick which status new tickets should land in.
3. Add your fields one at a time - a label, a type (short text, long
   text, number, date, dropdown, or a yes/no checkbox), and whether
   it's required. For a dropdown, list the choices separated by
   commas.
4. Notice the small "Title" radio button next to each field as you add
   it - whichever field has it selected becomes the actual ticket
   title once someone submits the form. The first field you add gets
   this automatically; move it to a different field anytime before
   saving.
5. Click **Save form**, then back on the list, click the toggle to
   **publish** it. Once published, click the link icon to copy its
   public link.
6. Open that link in a private/incognito window to see exactly what
   whoever you send it to will see, and try submitting it - a new
   ticket should appear on your board right in the status you picked.

## A couple of things worth knowing

**Unpublishing doesn't change the link.** Toggling a form off just
stops it from accepting responses - the same link works again the
moment you toggle it back on. This is different from how the Request
Portal's unpublish works (that one hands out a brand new link every
time you republish). Deliberately simpler here: a form is something
you might turn on and off seasonally ("client intake, open" /
"client intake, currently closed"), and losing the link every time
would mean re-sharing it constantly for no real security benefit.

**Deleting a form deletes its response history, but not the tickets
already created from it.** Each ticket a form creates is a completely
normal ticket the moment it lands on your board - deleting the form
later doesn't touch it. What does go away is the `custom_form_submissions`
row's own copy of the raw answers, since without the form it came from,
that row has nothing left to make sense of anyway.

**Fields are owner-only for now**, matching how Boardly Autopilot's
own rules already work - an invited editor on your board can't build
or edit forms yet, only you can. If that turns out to matter for how
you actually work with collaborators, it's a small, deliberate change
to make later (the same way schema_v50 opened up several other
owner-only tables to editors) - just say so and it can be built.
