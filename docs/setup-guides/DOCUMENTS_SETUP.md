# Setting up: Documents & PDF Export

Real rich-text documents per board - briefs, meeting notes, anything
longer-form than a ticket's own notes field - each downloadable as a
real PDF. Also adds a "Download as PDF" button to Custom Forms (a
blank, printable copy of the form) and Proposals (a formatted copy of
the quote itself).

## Already deployed

Like Proposals before it, this was built and deployed live during the
same session - `supabase/schema_v60_documents.sql` has already been
run against the database. You don't need to run anything - just pull
the code and push.

```
git add .
git commit -m "Add Documents & PDF export"
git push
```

## How to use it

**Documents:** open a board, click **More tools**, then **Documents**.
Click **New document**, give it a title, and start writing - the
toolbar has headings, bold/italic/underline, bullet and numbered
lists, and links. Click **Save** anytime, and **Download PDF** to get
a real PDF file of exactly what's on screen.

**Downloading a Form or Proposal as a PDF:** in either the Forms or
Proposals list, there's now a small PDF icon next to each one. For a
Form, this gives you a blank, printable version - every field laid out
with a ruled line to write an answer on by hand, the way a paper
intake form looks. For a Proposal, it's a formatted copy of the quote
itself - title, line items, and total - the same thing the public link
shows a client, just as a downloadable file instead of a web page.

## How the PDF export actually works, and its one real tradeoff

There's no server involved in creating any of these PDFs - it all
happens in the browser, using two small libraries
([jsPDF](https://github.com/parallax/jsPDF) and
[html2canvas](https://github.com/niklasvh/html2canvas)) loaded from a
CDN the first time anyone actually downloads a PDF, not on every
dashboard visit.

html2canvas takes whatever's genuinely on screen (or, for Forms and
Proposals, a plain HTML snippet built just for this) and turns it into
an image, pixel-for-pixel exactly as the browser is already rendering
it - fonts, colors, spacing, all of it. jsPDF's only job is placing
that image onto one or more A4 pages.

The one real tradeoff worth knowing: because of that, the PDF is an
image of the page, not real selectable or searchable text. Genuinely
fine for "a document I want to send, print, or keep a copy of" - not
for "a document someone will open in a PDF reader and search inside
for one word." If that distinction ever turns out to matter, a proper
text-based PDF renderer (walking the document's actual structure and
drawing real text runs instead of an image) would be a separate,
meaningfully harder project for another day - not a quick follow-up to
this one.

## Who can use Documents

Documents are member-inclusive from the start - any board owner OR
an accepted editor collaborator can create, edit, and delete them, the
same owner-or-editor pattern schema_v50 already established for
milestones and automation rules. This is different from Custom Forms
and Proposals, which stay owner-only for now: a document is closer in
spirit to something a team writes together than a sales or intake tool
one person sends out.
