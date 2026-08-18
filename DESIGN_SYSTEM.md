# Boardly Design System — "Drafting Desk"

Phase 2 of the redesign (brand + type + color). This is the foundation every later phase builds on. Read this before touching CSS or markup in any future phase.

## The idea in one sentence

Boardly is a drafter's desk: **paper** you work on (blueprint-gridded), **ink** you write with, and colored pencils sitting nearby for tags and status. This was already half-true in the old CSS (the comment literally said "warm paper + blueprint grid"). Phase 2 makes it real and consistent instead of accidental.

## Typography — why these three, not defaults

| Role | Typeface | Used for |
|---|---|---|
| Display | **Fraunces** | Logo, board title, hero numbers, page titles, section headers — anything you'd imagine written by hand on the desk |
| Body/UI | **General Sans** | Nav, buttons, body copy, labels, forms — the interface talking to you |
| Data/Mono | **IBM Plex Mono** | Dates, durations, counts, timestamps — anything measured, like a blueprint's dimension callouts |

**Why not Inter?** It was the old body font. It's the single most common default in AI-generated and template SaaS UI — using it works against the "does anything look generic or AI generated" test in your own brief (section 55/56).

**Important restraint applied:** Fraunces is a serif with thin strokes — beautiful at large sizes, weaker at small uppercase tracked labels (e.g. kanban column headers). Those now use General Sans instead. Display type is used for moments that deserve weight, not blanket-applied everywhere it technically fits. This is the "spend your boldness in one place" principle — don't dilute it.

Load these via `<link>` tags already added to every page — Fraunces + IBM Plex Mono from Google Fonts, General Sans from Fontshare (both free, no license cost).

### Type scale (CSS classes, in `css/style.css`)

`.text-display` → `.text-hero` → `.text-page-title` → `.text-section-title` → `.text-card-title` → `.text-body` → `.text-secondary` → `.text-meta` → `.text-label` → `.text-number`

Use these classes for any *new* component instead of inventing a `text-[17px]` one-off. Existing markup using Tailwind's `font-display`/`font-body`/`font-mono` + size utilities still works — those three font families are now wired to the new fonts, so old markup got the new identity for free without being rewritten.

## Color — semantic, not decorative

Every color has a *job*, not just a hex value:

- `--paper` / `--paper-2` — the desk surface (2 levels)
- `--surface-1/2/3` — lifted sheets: cards, nested panels, modals (3 elevation levels)
- `--ink` / `--ink-soft` / `--ink-faint` — text hierarchy, darkest to lightest
- `--brand` (warm orange, "desk lamp glow") — primary actions, the one color that means "this matters"
- `--secondary` (teal) — secondary actions, positive/structural accents
- `--violet` / `--pink` / `--amber` — tag and data-viz colors only, never for primary actions
- `--success` / `--warning` / `--critical` / `--info` — always these four for status, never a random accent. Each has a `-soft` background variant for badges/pills.

Old variable names (`--orange`, `--teal`) still work — they're aliased to the new semantic tokens — so nothing already referencing them broke.

Both light and dark mode are fully defined side by side in `:root` / `html.dark`, same as before, just extended.

## Motion tokens

`--ease-premium`, `--ease-out`, and duration tokens `--dur-instant` (120ms) → `--dur-slow` (550ms) now exist as named tokens instead of magic numbers scattered through CSS. Future motion work (Phase 3+) should reach for these instead of writing new `cubic-bezier()`/`ms` values inline, so the whole app's motion feels like one hand designed it.

## What changed today, concretely

- `css/style.css` — token block rewritten, type scale added, all hardcoded font-family declarations replaced
- All 14 HTML pages — font `<link>` tags swapped, Tailwind `fontFamily` config updated
- `dashboard.html` — 3 kanban column headers moved from display serif to body sans for legibility

## What did NOT change

No JavaScript logic touched. No markup structure, IDs, classes used by `dashboard.js` (drag-and-drop, offline queue, realtime sync) removed or renamed. This was a token-and-font-layer change only — everything that worked before still works, it just looks like Boardly now instead of a Tailwind starter.

## Next phases (per the master prompt's own Phase list)

3. Component library — turn `taskCardHTML()`, buttons, badges, empty states into a documented, reusable set using these tokens
4. Navigation & app shell — sidebar, mobile bottom bar, command center
5. Simple Mode / progressive disclosure on the task editor
...continuing through the 24-phase list already laid out in the master prompt.
