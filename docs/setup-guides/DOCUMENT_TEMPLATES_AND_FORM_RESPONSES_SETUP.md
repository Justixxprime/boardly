# Setting up: Document Templates & Form Response PDFs

Two additions building on Documents and Custom Forms:

1. **Document templates** - starting points for a new document (Invoice,
   Meeting Notes, Contract, Cover Letter) instead of always starting
   from a blank page.
2. **Form responses** - a proper way to see everyone who filled out a
   published Custom Form, each response downloadable as its own
   nicely designed PDF - not just a blank copy of the form itself.

## Already deployed / nothing new to run

Both of these are pure additions to features that were already live -
no new table, no new Edge Function. Just pull the code and push.

```
git add .
git commit -m "Add document templates and form response PDFs"
git push
```

## Document templates

Open **More tools -> Documents -> New**. Instead of one plain button,
you'll now see a small grid: Blank, Invoice, Meeting Notes, Contract,
and Cover Letter. Picking one opens the same rich text editor as
before, just pre-filled with a real starting structure and
bracketed placeholders (`[Client name]`, `[Amount]`, and so on) ready
to type over. Nothing about saving, editing, or downloading as a PDF
changed - templates just change what's already in the box when you
open a new one.

## Viewing and downloading form responses

Open **More tools -> Forms**. Any published form now has a small inbox
icon next to it - click it to see every response, newest first. Each
one has its own **Download** button, which produces a proper
one-response document: the form's name, when it came in, and every
answer laid out as a clean label/value pair - the kind of thing you
could actually attach to an email or file away, not a raw data dump.

This uses the same shared "document shell" (a colored top rule, a
small eyebrow naming what the document is, a serif title) that the
blank form PDF and Proposal PDF downloads already use - so a response
PDF, a blank form PDF, and a Proposal PDF all now share one consistent,
considered look instead of three different one-off layouts.
