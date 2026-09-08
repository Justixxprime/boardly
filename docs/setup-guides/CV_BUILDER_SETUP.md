# Setting up: CV Builder

A real CV/resume builder - personal info, summary, work experience,
education, skills, projects, certifications, and languages - with
three genuinely distinct templates, live as you type, downloadable as
a PDF or a portable JSON backup.

## Already deployed

Like the last several features, this was built and deployed live in
the same session - `supabase/schema_v61_cv_builder.sql` has already
been run. Nothing to run yourself - just pull the code and push.

```
git add .
git commit -m "Add CV Builder"
git push
```

## Where it lives

Unlike everything else built recently, a CV isn't board content at
all - it's personal to the account, the same way Settings is. It gets
its own page, `cv-builder.html`, linked from the main nav (next to
Tools) rather than tucked inside a specific board's More Tools menu.
You can save as many CVs as you like and switch between them from the
"My CVs" dropdown at the top - useful for keeping a different version
for different kinds of roles.

## The three templates

Each one is built for a different real situation, not just a
different color:

- **Ledger** - an editorial, serif-headed layout with hairline rules
  and dates set in a monospace column, like a real byline or credit
  line. Reads as credible and professional across most industries.
- **Studio** - a modern two-column layout with a tinted sidebar
  carrying your contact info, skills, and languages, main content
  flowing on the right. Suits creative, design, and tech roles where a
  bit of visual personality is expected.
- **Field** - fully monochrome, monospace throughout, no color or
  rules at all - whitespace does all the work. Built for conservative
  industries (finance, law, academia) and for maximum readability by
  automated résumé-screening software (ATS), which sometimes struggles
  with heavily designed layouts.

Pick an accent color (orange, teal, violet, or pink) independently of
the template - it only visibly matters for Ledger and Studio, since
Field stays monochrome on purpose.

## How the PDF download works

Same approach as Documents and the Forms/Proposals PDF downloads: two
small libraries (jsPDF and html2canvas) render exactly what's on
screen onto real PDF pages, so the download always matches the live
preview pixel for pixel. Same tradeoff as those too - it's an image of
the page, not searchable text, genuinely fine for sending or printing.

## Why there's also a JSON download

A CV is something people update for years, sometimes long after they
first built it here. The JSON download is a plain, portable backup of
every field you've filled in - useful for keeping outside Boardly
entirely, or for re-entering into a different tool later, without
depending on this account or this specific product still being around
whenever that day comes.
