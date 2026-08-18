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

## Phase 3 — Component layer (buttons, badges, focus)

**The problem this fixes:** every button in `dashboard.html` was a hand-copied string of Tailwind utilities — `bg-orange text-white font-semibold px-5 py-2.5 rounded-full hover:bg-orange-dark transition text-sm` — repeated verbatim 5+ times. That's the literal definition of "assembled, not designed" the brief warns against: change the brand color once and you're hunting through 5+ near-identical strings hoping you didn't miss one or introduce a typo in one copy.

**What was added to `css/style.css`:**

- `.btn` (base) + `.btn-primary` / `.btn-secondary` / `.btn-ghost` / `.btn-destructive` / `.btn-icon` — five roles, each with real hover/focus/disabled states, all sharing one focus ring (`--shadow-focus`) instead of the browser default
- `.btn-sm` / `.btn-lg` size modifiers
- `.is-loading` state (spinner replaces label without the button changing width, so nothing jumps)
- `.badge` + `.badge-info` / `-success` / `-warning` / `-critical` — one shape, four semantic colors, matching the status roles from Phase 2's color system
- A single `:focus-visible` rule covering every interactive element site-wide

**Important:** the existing `.btn-pop` class (the tactile press-down microinteraction — lifts and scales on hover, compresses on click) was **kept, not replaced**. It's genuinely good work already — section 4/48's "tactile microinteractions" requirement was already partially met. The new `.btn` classes sit underneath it; they don't compete with it.

**Applied to real markup today (dashboard.html):** all 5 repeated primary buttons (Add task, Save, Yes/do it, Save changes, Import tasks), the templates ghost button, the composer send button, and the offline badge — all now pull from the shared classes instead of duplicated utility strings. Zero IDs, event handlers, or `dashboard.js` logic touched — this was purely a class-attribute swap with an equivalent or improved rendered result.

**Not yet converted:** dropdowns, context menus, modals/sheets, inputs/forms, avatars, the notification center, calendar components. These are the rest of Phase 3/4's component list and are the natural next chunk.

## Phase 3, continued — the task card

The task card (`taskCardHTML()` in `dashboard.js`) had the same duplication problem as the buttons, just inside one function instead of across the file: the metadata row (due date, reminder, attachments, git branch, time tracking, blocked-by, priority, platform — 12 conditional badges in total) hand-repeated `font-mono text-[10px] text-ink-soft flex items-center gap-1` (or a near-identical variant with a conditional color swapped in) in four slightly different forms.

**What changed:** all 12 now share one `.meta-chip` class in `css/style.css`. Where a chip needed a conditional color (overdue date, active time-tracking, blocked-by, git-link hover), that logic stayed exactly as it was — only the duplicated class list was removed. Nothing else in the function changed: no `data-id`, no event-handler classes (`.ticket`, `.check-btn`, `.delete-btn`, `.drag-handle`, `.edit-target`, `.select-box`), no conditional structure. Verified with `node -c` before and after — the file still parses as valid JavaScript, and every rendered chip is either byte-identical or a strict class-name simplification of what it was.

Left alone deliberately: the subtask-progress counter and the geofence-pin label, which use a similar-looking but genuinely one-off style each — folding those into `.meta-chip` would trade a real distinction for false consistency.

## Phase 3, continued — forms and modal chrome

The edit-task form (the biggest form in the app — title, platform, notes, category, status, pipeline, and more) had **18 labels and 18 near-identical input/select/textarea class strings**, several of which had quietly drifted apart over time (`px-3` vs `px-3.5`, a missing `mb-4` here and there) — the kind of small inconsistency that creeps in from copy-pasting instead of reusing a component.

**What changed:** added `.input` / `.input-sm` / `.form-label` to `css/style.css`. All 18 form fields across the edit-task form now use `.input` (plus whatever spacing utility, like `mb-4`, that field specifically needs — spacing stays flexible per-field, only the look is shared). All 18 labels use `.form-label`. Also consolidated the 4 modal close buttons (edit, import, templates, AI panel — previously `h-7 w-7`, 28px) into `.btn-icon` (36px) — a small but real accessibility improvement toward Apple's 44px minimum touch-target guidance, which matters since testing happens on an iPhone 13.

**Left alone deliberately:** the markdown-preview `<div>` in the notes field, which happens to share styling with the inputs around it but is a read-only preview, not a form control — same look, genuinely different element, correctly not merged in.

**Verification on every edit in this phase:** `node -c js/dashboard.js` (valid JS syntax), open/close tag balance counts for `<div>`, `<button>`, `<form>`, `<select>`, `<textarea>`, and CSS brace balance in `style.css` — all checked clean before packaging.

## Phase 4 (started) — nav/shell buttons, propagated site-wide

Before a real navigation *architecture* redesign (sidebar vs. top bar, what belongs in a mobile bottom bar) — which is a structural decision affecting how you use the app daily, not a style pass — I finished propagating the Phase 3 component system to every page's header and mobile menu, since that was pure mechanical consistency work with no architecture risk.

**What changed, across all 14 HTML files:**

- The mobile-menu close icon-button (`h-9 w-9 ...`), identical on 9 pages, → `.btn-icon`
- The marketing-site "Get started" header CTA, identical on 6 pages, → `.btn-primary`
- 8 more marketing CTA buttons (hero buttons, pricing-card buttons, contact-page CTA, 404-page CTA, tools-page CTA) — each had slightly different padding/width utilities (`px-6 py-3`, `px-7 py-3`, `w-full`, `magnetic`, `block` vs `inline-block`) → all now `.btn-primary.btn-lg` plus whichever layout utility that instance actually needs, so the color/shape is shared but the layout stays flexible per placement
- The dashboard header's two remaining raw icon buttons (keyboard-shortcuts `?`, mobile-menu close) → `.btn-icon`

**Left alone, correctly:** the "Most useful" pricing-page badge, which uses `bg-orange text-white` but is a `.stamp` pill, not a button — a different component doing a different job, not a missed conversion.

**Verification:** every one of the 14 HTML files was checked for balanced `<div>`/`<button>` tags after the edits (all clean), and every JS file in the project was re-run through `node -c` as a final safety net even though none of them were touched in this pass.

**What Phase 4 still needs, and why it's not done yet:** the actual navigation *structure* — what lives in the sidebar vs. top bar vs. mobile bottom bar, whether a command center replaces some of the current header — is a decision about how you'll actually use the app, not a design system detail I should make silently. That's the open question from the last message.

## Next phases (per the master prompt's own Phase list)

4. Navigation & app shell — sidebar, mobile bottom bar, command center
5. Dropdowns, context menus, and the calendar/notification components — the remaining pieces of the Phase 3 component list
6. Simple Mode / progressive disclosure on the task editor
...continuing through the 24-phase list already laid out in the master prompt (onboarding, verticals, AI, billing, public site, SEO, performance, accessibility, final polish).
