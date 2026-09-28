# Boards now default to your own type. What this is, in plain terms.

## No manual setup needed

Unlike most recent deliverables, this one needs nothing from you in
Supabase. No new column, no new secret, no dashboard setting. It only
reads `user_settings.workspace_type`, a column that has existed since
`schema_v69`. Just copy the changed files in and push whenever your
computer is back.

## What changed, in one sentence

Boardly now remembers what kind of business you told it you run (at
signup, or whatever you last set in Operations) and quietly uses that
as the starting point for new boards, instead of forgetting it the
moment your very first board was created.

## What this is NOT

This is not the full "enabled modules per persona" system the master
brief describes in Section 63, the one where a persona would only see
certain modules. That would mean hiding or restricting things based on
what someone picked once at signup, which runs against a rule this
project already settled on for the signup goals feature: reorder by
relevance, never hide. So this closes the same real gap ("Boardly
doesn't act like it knows what kind of business you run, past the very
first board") the same honest way that feature did: smarter defaults,
nothing hidden, everything still one click away.

## What actually changed, concretely

1. Every new board you add (the plus button, "New blank board") now
   starts already set to your own persona's type, if you have one set,
   instead of always starting as "General." You can still change it
   instantly afterward, exactly like before, nothing is locked.
2. The menu that changes a board's type (click the board's type icon
   in its toolbar) now shows your own type first, labelled "(your
   type)", instead of it sitting wherever alphabetical or definition
   order happened to put it. Every other type is still right there
   underneath it, nothing removed.
3. Boards created straight from a template (the "New board from
   template" submenu) already set their own type correctly and were
   not touched, that part was already right.

## What is still open, on purpose, left for a future pass

The "New board from template" submenu is a static list in the HTML,
not something built by a script, so it was not reordered to float a
matching template to the top the same way the type menu was. Doing
that properly means turning that menu into something rendered by
script instead of fixed HTML, a bigger change than this pass, and not
worth rushing just to tidy up a menu that already works fine as is.

## How to see it for yourself once your computer is back

1. Open Settings or Operations, confirm your account has a work type
   set (teaching, logistics, whichever fits you).
2. Go to Work, open the board switcher, click "New blank board," name
   it anything.
3. Open that new board's type menu. It should already be set to your
   own type, not General, and your type should be the first thing
   listed, marked "(your type)".
