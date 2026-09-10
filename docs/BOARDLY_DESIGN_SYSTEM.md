# Boardly 2.0 — Design System (Phase 1)

This document is Boardly 2.0's own required deliverable (brief Section 92:
`docs/BOARDLY_DESIGN_SYSTEM.md`). It records what Phase 1 actually changed
this session, on top of the design system that already existed (see
`docs/DESIGN_SYSTEM.md` for the original token-only note this supersedes
for Boardly 2.0 purposes).

Everything here was checked against the real `css/style.css` and all 24
HTML pages during this session — nothing below is aspirational.

---

## 1. The font decision (Section 37)

**Decision: keep Fraunces + IBM Plex Mono. Replace General Sans → Synonym.**

The brief's Section 37 explicitly bans General Sans as a body/UI face,
and Boardly's entire site used it. This was flagged in the Phase 0 audit
as needing an explicit decision before any Phase 1 work, rather than a
silent default either way. The decision made this session:

- **Fraunces** (display) — kept. Not on the ban list. Load-bearing across
  every headline, hero number, and section title on all 24 pages.
- **IBM Plex Mono** (data/numeric) — kept. Not on the ban list. Load-bearing
  across every date, duration, count, and technical metadata display.
- **General Sans → Synonym** (body/UI) — changed. Synonym is the same
  foundry and license profile as General Sans (Fontshare / Indian Type
  Foundry — free, self-hostable, variable font, good Unicode coverage),
  so the swap costs nothing in performance or licensing. It's a distinct
  humanist sans rather than the geometric-neutral style General Sans
  shares with most of the brief's other banned fonts (Inter, Plus Jakarta
  Sans, Satoshi, Public Sans, Noto Sans, etc.).

**Why this was mechanically cheap despite touching all 24 pages:** the
whole codebase already routes body text through `var(--font-body)` in CSS
and `font-body` in each page's Tailwind config, rather than hardcoding
`"General Sans"` anywhere in component styles. The actual change was:

1. One CSS variable in `css/style.css` (`--font-body`).
2. The Fontshare CDN `<link>` tag, identical text on every page.
3. The `fontFamily.body` entry in each page's inline Tailwind config,
   identical text on every page.

All three were swapped with a scripted find-and-replace across all 24
`.html` files plus `css/style.css`, then verified with a pass over every
file confirming zero remaining `General Sans` / `general-sans` references
and a present `synonym` reference. No JS file hardcoded the font name, so
none needed touching.

---

## 2. Color tokens (Section 38)

Already substantially in place before this session — not new work, just
confirmed and extended:

- **Already existed:** `--paper`/`--paper-2` (background), `--surface-1/2/3`
  (elevated surfaces), `--line`/`--line-strong` (border), `--ink`/`--ink-soft`/
  `--ink-faint` (text/muted text), `--brand` (accent), `--success`/`--warning`/
  `--critical`/`--info` (+ `-soft` pairs) for semantic states. Light and dark
  values are separately authored per token (not a blanket invert), matching
  Section 38's explicit warning against inverted-for-dark-mode colors.
- **Added this session:** `--money`, `--client`, `--work` — the brief's new
  Money/Clients/Work information architecture (Section 4) needs its own
  semantic accents distinct from general `--success`/`--info`/etc. Rather
  than inventing new hues, these alias existing, already dark-mode-paired
  accents: `--money` → `--secondary` (teal, already read as "ledger/positive"
  in the existing UI), `--client` → `--pink`, `--work` → `--violet`. New
  Money/Clients/Work-scoped UI should reach for these tokens instead of the
  underlying accent directly, so the domain-to-color mapping stays
  swappable in one place if it needs to change later.

## 3. Spacing & radius scales

Did not exist as named tokens before this session — spacing came entirely
from Tailwind utility classes (`p-4`, `gap-3`, etc.) in markup, and radius
values were hand-typed per component (`.5rem`, `.75rem`, `999px`...).
Added `--space-1` through `--space-20` (4px-based) and `--radius-sm`
through `--radius-full` as named tokens for new CSS-level components that
need a value outside Tailwind's own class-based scale — this does **not**
replace or migrate existing Tailwind spacing usage, which is untouched
and still correct.

## 4. New reusable components

Added to `css/style.css`, additive only — nothing existing was removed or
rewritten:

- **`.modal-backdrop` / `.modal-panel`** — a named version of the pattern
  every existing modal on `dashboard.html` etc. already hand-builds inline
  (`hidden fixed inset-0 z-50` wrapper + backdrop + panel). The 24 existing
  modals were deliberately **not** migrated this session — that's real
  surface area across every page for a cosmetic-only change, which the
  Phase 0 audit and the brief's own Section 90 ("do not build everything
  in one pass") both argue against doing speculatively. New modals can use
  these classes now; existing ones can adopt them incrementally later.
- **`.sheet`** — a bottom-sheet primitive for mobile (Section 41).
- **`.table` / `.table-wrap`** — a dense, tabular-numeral-aligned data
  table pattern. Nothing in the current product needs this yet (no page
  has tabular financial/list data at this density) — this exists ahead of
  Money Center and Client CRM, which will.
- **`.loading-state` / `.error-state`** — full-section loading and error
  patterns per Sections 60–61 ("never a blank screen," "explain what
  happened, why, what to do"). Distinct from the existing `.skeleton`
  (content placeholder) and `.empty-state` (zero-data, not an error).

## 5. What Phase 1 does NOT include yet

Per the brief's own phased ordering and the Phase 0 audit's recommendation,
this pass is deliberately narrow:

- **Command palette** — a working `#cmdk` / `.cmdk-backdrop` already exists
  pre-Boardly-2.0 (search + navigate). The brief's Section 5 "Command
  Center" (natural-language → structured action plan → approve/edit/cancel)
  is Phase 8 (Intelligence) territory, not a Phase 1 styling concern, and
  isn't touched here.
- **Navigation rebuild** (Home/Work/Clients/Money/Operations/Discover/
  Insights) — Phase 2 per the brief's own ordering, not done this session.
- **Existing modal migration to `.modal-panel`** — see above.
- **Empty state copy for pages that don't exist yet** (Money Center, CRM,
  etc.) — written when those pages are built, not speculatively now.

## 6. Verification performed this session

- Every one of the 24 HTML pages checked for zero remaining
  `General Sans`/`general-sans` references and a present `synonym`
  reference (scripted, not spot-checked).
- `css/style.css` brace-balance check (475 open / 475 close).
- No JS file required changes (none hardcoded the font family name).
