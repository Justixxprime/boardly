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

## Phase 4 — mobile bottom tab bar (the real structural piece)

The open question from before was answered by making the call myself, per the brief's own "don't make me decide everything" instruction: **the existing top bar + slide-out menu stays** (it's real, working, and owns profile/install/dark-mode/logout — things that don't need to be one tap away), and a genuine **mobile bottom tab bar** was added alongside it, since that was the one concrete structural gap between what exists and what every version of the brief has asked for under "mobile navigation."

**What it is:** four tabs — Board, Insights, Tools, More — fixed to the bottom on screens under 640px, hidden entirely on desktop. `env(safe-area-inset-bottom)` keeps it clear of the iPhone home indicator. Active tab highlights in brand orange with a small dot indicator.

**"More" reuses the existing menu, it doesn't duplicate it.** The button calls the exact same `open()` function in `js/site.js` that the hamburger icon already used — Settings, install, theme toggle, and everything else in the slide-out menu is reached from either entry point. No second menu system, no new state.

**Applied to:** `dashboard.html`, `stats.html`, `tools.html`, `settings.html` — the four pages you're actually authenticated and working inside. Marketing/auth pages (index, features, pricing, login, signup, etc.) don't get it, since a tab bar for "Board / Insights / Tools" makes no sense before you're signed in.

**Content padding:** added a `body.has-bottom-tabs main{ padding-bottom: ... }` rule so scrolled content on all four pages never tucks under the fixed bar.

**Verification:** `node -c` on `js/site.js`, and `<nav>`/`<div>`/`<body>` tag balance checked on all four modified HTML files.

**On the research citations in the latest document you sent:** it opened with claims of Behance/Dribbble research backed by citation markers that rendered as blank placeholder characters, not real links. I didn't treat those as verified sources, and I'm not fabricating specific "reference" attributions I can't check.

## Phase 3, finally complete — dropdown menus

The last unconverted piece of the component list: the 7 dropdown menus (board switcher, board templates, export, more, templates, notes-templates, plus the progress popover) had **13 hand-repeated menu-item buttons** using the same class string, and none of the menus had any entrance motion — toggling `.hidden` just snapped them into view.

**What changed:** all 13 menu items now use `.menu-item` (plus `.menu-item-accent` for the one destructive/highlighted item). All 7 menus now fade and settle in over 160ms via a `.dropdown-menu` keyframe animation — this needed zero JavaScript changes, since an element going from `display:none` to visible automatically replays its CSS animation from the start.

**Verified:** tag balance on `dashboard.html` after every replacement pass, including catching one instance that had an extra `hidden` class prefix and needed a manual fix rather than the bulk script.

Phase 3 (component system: buttons, badges, chips, inputs, modal chrome, menus) is now fully done.

## Task detail panel — fully consolidated

Went back through the entire edit-task form field by field (title through attachments to the footer buttons) rather than just the fields caught by the first sweep. Found and fixed several variants the earlier bulk replacements missed because they didn't start with `w-full` or had a stray `hidden` prefix breaking the exact-string match:

- 1 more `.form-label` (caption/notes field)
- 8 more input variants (git branch, git PR link, due date, reminder time, all previously raw `border border-line rounded-lg...` strings) → `.input` / `.input-sm`, keeping `flex-1`/`font-mono`/`resize-none` as separate utilities where each field actually needs them
- 2 new fixed-size icon buttons added: `.btn-icon-sq` (36px, square, bordered) for the clear-date/clear-reminder/clear-geofence buttons that sit next to a rectangular input — a circular `.btn-icon` would look wrong next to a square input, so this is a deliberate second icon-button variant, not the same one applied twice
- 5 small inline icon toggles (markdown preview, post preview, insert-snippet, time-reset, share) → new `.icon-link` — lighter than `.btn-icon` on purpose, since these sit inline next to text/other controls and forcing a fixed 36px tap target would break the layout they're in

**Left alone, deliberately:** the Cancel and Delete footer buttons, which use understated text-only styling on purpose (visual weight should favor the primary Save button next to them), and the Delete button's brand-orange color rather than the semantic `--critical` red — that's an existing stylistic choice, not an oversight, and changing a destructive action's color is a real decision worth flagging rather than silently changing. Worth a conscious yes/no from you later, not bundled into a mechanical cleanup pass.

**Verified:** full tag balance (`<div>`, `<button>`, `<form>`, `<select>`) and CSS brace balance after every edit.

## Phase 5 + 6 together — board/kanban chrome and calendar review

Combined these two because reviewing the calendar showed it didn't need the same kind of work the board did — it's a different situation in each case, worth being honest about rather than manufacturing busywork to look symmetrical.

**Board (kanban columns):** the 6 column-header icon buttons (clear-column and focus-column, ×3 columns) were the same copy-paste pattern as everything else in Phase 3 — now `.btn-icon-xs` (24px, matching their small in-context size, distinct from the 36px `.btn-icon` used elsewhere). Column headers themselves (`.icon-badge-orange/-teal/-violet`, the count, the label) were already well-built and needed nothing.

**Empty states:** checked, not touched. `emptyStateHTML()` in `dashboard.js` already has a hand-drawn SVG matching the desk motif, contextual copy per column ("No tickets on the desk," "Nothing in motion," "Nothing filed yet"), and a keyboard-shortcut hint. This already satisfies what the brief asks for under empty states — teaching, not just saying "no tasks." Redesigning it now would be change for its own sake.

**Calendar:** checked, mostly not touched. `renderCalendar()` builds each day cell in a loop — that's normal, not the copy-paste-duplication problem the button/input work was fixing. It already has today-highlighting, a hover-reveal quick-add button, and per-task critical/reminder icons in each day's chips. The one true one-off (a 16px add-button sized specifically to fit inside a compact day cell) was left as its own scale rather than forced into `.btn-icon-xs`, since 24px doesn't fit that space cleanly.

**Verified:** tag balance (`<div>`, `<button>`, `<section>`) on `dashboard.html`, `node -c` on `dashboard.js`, CSS brace balance.

## The multi-vertical work-type system — real, working, equal weight to all four

You confirmed Boardly is going multi-vertical, then corrected me twice: not "personal," and not "logistics-first" either — all four verticals (general, logistics, teaching, freelance) get equal treatment. Here's what was actually built, not just planned.

**The key discovery that made this low-risk:** `supabase/schema_v2.sql` already has a `boards` table — multiple boards per account already existed. So instead of a new status system, `work_type` is one new column on `boards` (`supabase/schema_v12_work_type.sql`, additive, defaults to `'general'`, nothing breaks if you haven't run it yet).

**How it actually works:** a task's real status is still exactly `todo` / `inprogress` / `done` — always. `work_type` only changes what those three columns are *called* and which icon/color they wear, per board. Drag-and-drop, filtering, counts, search, realtime sync — none of it changed, because none of it needed to.

| work_type | To do column | In progress column | Done column |
|---|---|---|---|
| general | To do | In progress | Done |
| logistics | Pickup Scheduled | In Transit | Delivered |
| teaching | Planned | Teaching | Graded |
| freelance | To do | In progress | Delivered |

**What's live:**
- `TERMINOLOGY` object in `dashboard.js` — the single source of truth for all four verticals' labels/icons/colors
- A "Board type" selector in the ⋯ more-menu, switches the current board's vertical and saves it
- The board-switcher list now shows each board's actual vertical icon (truck, chalkboard, briefcase) instead of one generic grid icon for every board
- Three new starter templates with real operational tasks — Logistics operations, This week's teaching, New client project — each creates its board already set to the right work_type. The old "Logistics update series" template was renamed to "Logistics announcement posts" for honesty: it was always a social-media template about logistics, not real ops, and now sits next to the real logistics-ops template instead of being confused for it.

**One bug caught and fixed mid-edit:** an early replace accidentally deleted the `const NEW_BOARD_TEMPLATES = {` declaration line. Caught immediately by `node -c` failing, fixed, re-verified.

## Three more verticals — Personal, Field Service, Healthcare/Care

Asked to think about who genuinely can't do without an app like this — not "everyone needs task management," but specific people whose problems match Boardly's actual technical strengths (offline-first, geofencing, photo attachments, reminders together, which almost nothing at this price point has).

**The reasoning:**
- **Field trades and home services** (plumbers, electricians, AC techs, cleaners) — one of the largest underserved software markets globally, running businesses from WhatsApp and paper because $50-200/month tools assume reliable internet they don't always have. Geofenced "arrived on site" reminders and before/after photo proof are exactly what Boardly already does.
- **Community health workers / home caregivers** — visit logs, medication reminders, offline-capable for low-connectivity areas.
- **Personal life admin** — the biggest market by raw numbers, and location-based reminders ("when I leave the house," "when I get to the pharmacy") is the one differentiator most to-do apps don't do well.

**What shipped, same pattern, zero special-casing:** `TERMINOLOGY` in `dashboard.js` gained `personal`, `field_service`, `healthcare`. Because the Board-type menu, board-switcher icons, and template system all read from that one object generically, none of that code needed to change — adding a vertical is now purely additive. New migration `schema_v13_more_verticals.sql` widens the database check constraint (run after `schema_v12`). Three new starter templates: Personal errands, Field service jobs, Home visits & care.

**Caught and fixed:** an unescaped `&` in "Home visits & care" would have broken HTML parsing — changed to `&amp;` before packaging.

Total verticals: General, Logistics, Teaching, Freelance, Personal, Field Service, Healthcare/Care — seven, equal weight, same safe pattern each time.

## Vertical-aware empty states

The empty-column copy ("No tickets on the desk") was still hardcoded and identical no matter which vertical a board was set to — a logistics board with zero pickups said the same generic thing as a healthcare board with zero visits. Fixed: each vertical entry in `TERMINOLOGY` now carries its own `empty` copy per column (e.g. logistics' "In Transit" column empty state reads "Nothing on the road" instead of "Nothing in motion"; healthcare's reads "No visit in progress"). The hand-drawn desk SVG stayed exactly the same across all seven — only the words change, since the visual motif works fine everywhere and redesigning it per vertical would be effort spent on something that wasn't broken.

`setBoardWorkType()` now calls `renderBoard()` after switching a board's type, so empty columns update their copy immediately rather than waiting for a reload. Switching between boards of different verticals already worked correctly since `loadTasks()` already called the same rendering path.

## Per-vertical task fields — the real "built for logistics" piece

This is the difference between relabeled columns and an actually vertical-aware product. Followed the exact pattern already established for every other optional feature in the codebase (reminders, social, pro, dev fields): a probed `stateXReady` flag, an additive schema column, a hidden-until-ready form section, and gated read/write in `openEditModal`/`saveEditedTask` — nothing new invented, just extended consistently.

**The architecture decision:** one flexible `metadata jsonb` column on `tasks` (`schema_v14_vertical_fields.sql`), not a named column per field. Seven verticals times three-to-five fields each would mean 25-35 columns, nearly all null on any given row. `metadata` only ever holds what's relevant to whichever vertical the task's board is set to, and an eighth vertical later needs zero schema changes — only an entry added to `VERTICAL_FIELDS` in `dashboard.js`.

**What each vertical actually gets**, via `VERTICAL_FIELDS`:
- Logistics: Customer, Delivery address, Driver/rider
- Teaching: Class, Student(s), Meeting link
- Freelance: Client, Project
- Personal: Where
- Field Service: Customer, Job address, Job notes
- Healthcare/Care: Patient, Visit address, Visit notes
- General: nothing — a generic board doesn't get an empty "Details" section for the sake of symmetry

**Where it lives in the UI:** a "[Vertical] details" section appears in the task panel right after due date, before reminders — matching Simple Mode's own instinct of "core fields first, specifics right after," not buried behind an Advanced toggle.

**Verified:** full tag balance including `<label>` (new to this check, since the vertical-fields section generates several), `node -c` after each of the four edit locations (state declaration, probe, render call, save payload x2, undo-restore payload).

## Onboarding — the work-type question finally gets asked

Found a real gap while building this: signup created only an auth user, then `dashboard.js` silently gave every brand-new account a board literally named "My board" set to General — no question was ever asked about what kind of work it's for, even though the whole vertical system now depends on that answer.

**Fixed with the smallest possible mechanism.** `signup.html` gets a second step, shown right after account creation succeeds (only when there's an immediate session — the email-confirmation path is untouched): "What are you organizing?" with all seven verticals as tappable cards. The choice is written to `localStorage` and read exactly once by `loadBoards()` in `dashboard.js` when it creates that account's first board — then the key is cleared. No schema changes, no new auth logic, no new page-to-page data channel. If the key is missing (an older account, or someone lands on `dashboard.html` some other way), behavior falls back to exactly what it always did: a board called "My board" on General.

**Also converted while in these files:** `signup.html` and `login.html` still had the original unconverted `Inter`-era input/button classes from before Phase 2 — same `.input`/`.form-label`/`.btn-primary` treatment as everywhere else now, no visible pages left running the old styles.

## Public site — fabricated testimonials removed, real vertical content added

Found something worth stopping on rather than building around: `index.html` had a "People who tried the board" section with three 5-star testimonials — "Freelance designer," "Small team lead," "Indie developer" — attributed to no verifiable person. Boardly doesn't have real users yet, so these were fabricated placeholder content. The master prompt itself is explicit: *"Do not use fake testimonials. Do not invent customer numbers."* Removed rather than left in place, and replaced with something honest and more useful: a section actually explaining the seven verticals, since that's real and it's what the site was missing anyway.

**What replaced it, on both `index.html` and `features.html`:** a grid of all seven verticals with their actual column terminology (Pickup Scheduled → In Transit → Delivered, etc.) and what fields each one adds to a task — pulled directly from `TERMINOLOGY` and `VERTICAL_FIELDS` in `dashboard.js`, not invented copy that could drift from what the product actually does. `features.html`'s version is more detailed since that's the page someone evaluating the product actually reads closely; `index.html`'s is a lighter-weight teaser pointing at the same reality.

**Checked the rest of the marketing pages** (`pricing.html`, `changelog.html`, `contact.html`) for the same fabricated-claims pattern — none found.

## Notification preferences and account deletion — real gaps, both fixed

Found while checking: `notify_phone` existed in the database since `schema_v5_timely_plus.sql`, but there was never a settings UI for it — the only way to set it was a raw browser `prompt()` popup the first time a critical alert would have fired. And there was no way to delete an account at all, which most real businesses and app stores require.

**Notification channel (`schema_v15_notify_channel.sql`):** one new column, `notify_channel` on `user_settings`, defaulting to `both` so nobody silently stops getting alerts. Settings now has a real Notifications section — Email and text / Email only / Text only / Off — plus a proper phone number field replacing the `prompt()` hack. **Both edge functions that actually send notifications were updated for real, not just documented as a TODO:** `send-critical-sms/index.ts` now skips anyone set to `email` or `off`, and `daily-digest/index.ts` now skips anyone set to `sms` or `off`. Redeploy both after running the migration.

**Delete account (`delete-account` edge function, new):** this can't be done from the client at all — no anon-key session can delete its own `auth.users` row, only the service-role key can, and that key must never reach the browser. Built as a proper Edge Function that verifies the caller's own identity from their JWT (never trusts a passed-in user ID), cleans up their uploaded files in the `task-attachments` storage bucket, then deletes the auth account. **Correction made mid-build:** I initially wrote manual delete steps for the `tasks`, `boards`, and `user_settings` tables before checking the schema — turns out all four tables already have `user_id ... references auth.users(id) on delete cascade`, so deleting the auth user already cascades everything correctly and atomically. Removed the redundant manual deletes rather than ship needless, riskier code. The one thing a SQL cascade genuinely can't reach is Storage, which is the one manual step that remained.

Settings UI: a destructive-styled section with a confirmation modal requiring the user to type "DELETE" before the button enables — not a single accidental tap.

**Also converted while in `settings.html`:** the last page still running pre-Phase-2 input/button classes — profile, password, and app-lock fields all now use `.input`/`.form-label`/`.btn` like everywhere else.

## Per-board AI brief — the assistant can now follow a client's real content rules

You pasted a full "Social Media Content Manager for First Experts Logistics" brief and asked for the AI to actually follow it — LinkedIn + X captions for every post, contact info, checklist template, WAT scheduling times, no duplicate topics. Building a one-off feature for one client's exact rules would be the wrong shape; what's actually built is a reusable mechanism any client's brief can use.

**How it works:** `boards.ai_brief` (new column, `schema_v16_ai_brief.sql`) holds free-form custom instructions, set once per board via a new "AI brief for this board" option in the ⋯ menu. `board-assistant/index.ts` now includes it in the system prompt for every message sent while that board is open — so once you paste First Experts Logistics' full brief into that board, "write me a post about customs clearance" already knows to produce both platform captions, include the phone/email/website, and follow the rest, with zero repetition needed in the chat.

**The assistant's action schema was extended to match what the brief actually needs**, not just title/category/due_date like before:
- `platform` — already existed on `tasks` (`schema_v8_social.sql`), the AI just wasn't using it
- `notes` — also already existed, now where the AI puts LinkedIn/X caption text instead of stuffing it into the title
- `subtasks` — a short checklist (capped at 5 items in the prompt, matching the brief's own "keep checklists short" rule)
- `reminder_at` — a full ISO timestamp with explicit UTC offset (`+01:00` for WAT), so a scheduled reminder is correct regardless of what timezone the server itself runs in

**One real code change needed to support this:** `addTask()` didn't return the created row, since none of its existing callers needed it. Added a `return data` at the end — safe, since a function returning something new never breaks callers that already ignored the return value — so the AI-action loop can attach `notes`/`subtasks`/`reminder_at` in one follow-up update after the task exists.

**Caught during review:** my first draft of the subtask follow-up generated `{id, text, done}` objects, but the app's own subtask-add code only ever uses `{text, done}` — no `id` field. Fixed to match the real shape rather than introduce a second, inconsistent one.

## Next phases (per the master prompt's own Phase list)

4. Navigation & app shell — sidebar, mobile bottom bar, command center
5. Dropdowns, context menus, and the calendar/notification components — the remaining pieces of the Phase 3 component list
6. Simple Mode / progressive disclosure on the task editor
...continuing through the 24-phase list already laid out in the master prompt (onboarding, verticals, AI, billing, public site, SEO, performance, accessibility, final polish).
