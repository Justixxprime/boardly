# Boardly 2.0 - Implementation Map (Phase 0 Audit)

Produced per the Boardly 2.0 brief's own Section 2 and Section 90-91
instructions: inspect before modifying, and produce this map before
writing any Phase 1+ code. Every claim below was checked directly
against the real repository during this session, not assumed or
carried over from memory of earlier sessions.

## 0. How to read this document

This is the honest starting line, not a status report on work already
done toward Boardly 2.0. Almost nothing below reflects Boardly 2.0's
own vocabulary (Work/Clients/Money/Operations/Discover/Insights) yet -
that's the whole point of writing this first. Where the brief asks for
something that doesn't exist, this says so plainly rather than
describing it as partially there.

---

## 1. Current architecture (as it actually is today)

- **No build step.** No `package.json`, no bundler, no framework. Every
  page is plain HTML with `<script>` tags loading global-scope `.js`
  files directly. Tailwind, fonts, and FontAwesome load from CDNs at
  runtime.
- **24 top-level HTML pages** (dashboard, tools, settings, stats,
  cv-builder, form, proposal, request, roadmap, client-portal,
  marketplace, video-workroom, admin, plus marketing/auth pages).
  Routing is just separate static files - there is no client-side
  router.
- **70 JS files** under `js/`, one per feature, sharing one global
  `state` object declared in `dashboard.js`. This is why file load
  order matters and why every feature file greps for name collisions
  before adding a global.
- **Backend is Supabase only**: Postgres + Auth + Storage + Realtime +
  Edge Functions. **62 schema migration files** (`schema_v1` through
  `schema_v61`), each additive, none rewritten in place. **34 Edge
  Functions**, mostly small single-purpose Deno functions.
- **No test suite exists.** No `*.test.js`, no test runner, nothing
  under a `tests/` directory. Verification today is: `node --check` on
  touched JS files, manual brace/paren balance checks on edited TS
  functions, and now Supabase's own `get_advisors` linter when the MCP
  connector is available. There is no automated regression testing at
  all - Section 78's test list (auth, tenant isolation, payments,
  webhooks, offline sync) does not exist in any form today.
- **No `docs/BOARDLY_2_IMPLEMENTATION_MAP.md`, `BOARDLY_ARCHITECTURE_2.md`,
  `BOARDLY_SECURITY_2.md`, `BOARDLY_PRODUCT_2.md`, or
  `BOARDLY_DESIGN_SYSTEM.md` existed before this file** - `docs/`
  currently holds `PRODUCT_VISION.md` (tier philosophy, not
  architecture), `BOARDLY_AUDIT.md` (an earlier, narrower audit from
  before this build phase began), a continuation prompt, two "how to
  use" guides for Charles himself, a design-system note scoped to
  visual tokens only, a GitHub push guide, and a stale `TODO.md` left
  over from `v4`.

## 2. Feature inventory (what's real vs. what Boardly 2.0 assumes)

Section 3 of the brief lists a long "preserve this" inventory as if
confirming it already exists. Checked against the real repo:

**Genuinely built and working**, matching the brief's list closely:
boards, tasks, columns, drag and drop, categories, priorities, due
dates, recurring tasks, subtasks/checklists, attachments (with
versioning and per-file approval status), offline queue, share links,
calendar, timeline, search (now cross-entity, this session), CSV/JSON
export, board templates, activity log, notifications, mentions,
assignments, team invitations/roles, security center, client portal,
client work vertical, request portal, custom forms, proposals,
documents (with templates), file proofing (pin comments), public
roadmap with voting, content calendar, dev-board vertical, video
workroom, a real (Paystack-backed) Marketplace, classroom vertical,
dispatch vertical, care-rounds vertical, timesheets, Good Morning
view, Quick Resume, Routines, Commitment Guardian, Waiting On,
Decision Ledger, Board Health, Task DNA, Workload Thermostat, Critical
Path, Project Baselines, Task Links, Milestones, a CV Builder, and a
WHEN/IF/THEN automation engine (Boardly Autopilot).

**Named in the brief's "preserve" list but not actually present as
named**: "swimlanes", "presentation mode", "board backgrounds",
"card covers", "printing" as a dedicated feature, "capture" as its
own named system (task capture exists inline, not as a separate
module), "Friction Detector" and "Execution Score" as named features
(Task DNA covers adjacent ground under different names). These aren't
regressions - they were never built under those names. Worth a direct
decision: build them, or drop them from the spec.

**Not present at all, despite being implied as "existing" by Section
3's phrasing**: leads, opportunities, contracts (a Contract *document
template* exists inside Documents; there is no contract *object* with
status/e-signature), invoices, payment links, expenses, payouts (beyond
Marketplace's own booking payout), subscriptions, retainers,
profitability tracking, cash flow, refund/dispute objects, professional
marketplace profiles with trust/verification badges, teacher-specific
gradebook/attendance-as-a-system (Classroom has real attendance
tracking; grading is more limited), a general appointments/session
system.

## 3. Database inventory

62 tables/migrations spanning: `tasks`, `boards`, `board_members`,
`documents`, `proposals`, `custom_forms` + `custom_form_submissions`,
`resumes`, `milestones`, `task_links`, `project_baselines`,
`automation_rules` + `automation_runs`, `activity_events`,
`notifications`, `client_comments`/`client_portal`, `marketplace_*`
(listings, bookings, payments), `idea_votes`/`ideas`, `playbooks`,
`proof_comments`, `security_events`, plus vertical-specific tables for
Classroom, Dispatch, Care Rounds, Content Calendar, Dev Board fields.

No table exists yet for: `clients` (as a CRM object distinct from
`board_members`), `leads`, `invoices`, `invoice_items`, `payments` (as
a general ledger - only `marketplace_bookings`/`marketplace_payments`
exist, scoped to Marketplace), `transactions` (general ledger),
`expenses`, `payouts` (general), `subscriptions` (Boardly's own
Free/Pro/Pro+ billing is entirely manual today - `js/entitlements.js`
gates features client-side and `admin-set-plan` moves a user's plan by
hand; there is no payment processor wired to it at all), `disputes`.

RLS: every table added since `schema_v50` follows one of two
deliberate patterns - owner-or-editor-board-member (shared board
content: Documents, Milestones) or owner-only (Proposals, Custom
Forms, resumes, automation_rules). Public-facing tables
(`custom_form_submissions`, `idea_votes`) correctly have **no** public
policy at all - every public write goes through a service-role Edge
Function that validates a per-feature token. This pattern is sound and
consistent; Section 49's RLS/tenant-isolation requirements are already
substantially met for what exists.

## 4. Route inventory

Not applicable in the SPA sense the brief assumes (Section 4's
Home/Work/Clients/Money/Operations/Discover/Insights nav implies a
client-side router with nested views). Today's "routes" are 24 static
files. `dashboard.html` is the single largest surface and already
functions as a de facto "Work" hub (boards, tasks, calendar, timeline)
plus a "More tools" catch-all menu that now holds 15+ feature entry
points (Milestones, Playbooks, Idea Vault, Custom Forms, Proposals,
Documents, Autopilot, Activity Log, and more) - this is the single
clearest, most concrete piece of evidence that Section 4's core
complaint ("main navigation should not expose every feature") is
already a real, worsening problem, not a hypothetical one.

## 5. Security findings

- Payment confirmation is genuinely server-side for the one payment
  flow that exists (`marketplace-payment-webhook` verifies the
  Paystack webhook and has an explicit idempotent-no-op guard for
  duplicate webhook delivery - Section 9's "never allow duplicate
  webhook processing" and Section 54's idempotency requirement are
  already honored for this one flow, not "not implemented" as a
  blanket statement would suggest).
- No idempotency-key architecture exists *generally* (Section 54 asks
  for one covering payments, invoices, orders, payouts, automation -
  none of those objects exist yet to need one, except the one webhook
  above).
- No rate limiting, no CSRF tokens, no MFA support anywhere in the
  codebase today.
- `public.idea_votes` shows in Supabase's own linter as "RLS enabled,
  no policy" - verified this session to be **intentional and correct**
  (the table is only ever written to via a service-role Edge Function),
  not an actual gap. Flagging here so it isn't "fixed" into a real
  vulnerability by a future pass that doesn't check the reasoning first.
- Two genuinely missing standalone-page script tags were found and
  fixed this session (a class of bug the project's own history already
  flagged once before on `admin.html`) - this is a real, recurring
  failure mode worth a permanent pre-ship checklist item, not just a
  one-off fix.

## 6. Performance findings

No code-splitting, no lazy-loaded routes (nothing to split - no
bundler exists). Heavier dependencies (ffmpeg.wasm for the Metadata
Remover, Quill for Documents, jsPDF/html2canvas for PDF export) are
already lazy-loaded only on first actual use, not on every page load -
this discipline is already in place and should carry forward into any
Phase 1 work rather than being reintroduced as if new. No pagination
audit has been done on `state.tasks` for boards with very large
ticket counts - a real, plausible gap Section 75 correctly worries
about, unverified either way in this session.

## 7. Design-system findings

Current typography: **Fraunces** (display), **General Sans** (body),
**IBM Plex Mono** (data/code). Section 37 of the brief explicitly lists
General Sans among fonts to avoid. This is a direct, material conflict
between the brief and 24 pages of already-shipped, load-bearing brand
identity (every resume template built this session, every document
export, the whole marketing site) - not a small detail. This needs an
explicit decision from Charles before any Phase 1 design-system work
starts, not a silent choice either way.

Color tokens already exist as CSS custom properties with light/dark
pairs (`--paper`, `--ink`, `--orange`/`--brand`, `--teal`/`--secondary`,
`--violet`, `--pink`, `--line`, `--card`) - genuinely deliberate, not
inverted-for-dark-mode as Section 38 warns against (verified: light
and dark values are separately authored, e.g. `--brand:#E8622C` light
vs `#F3773D` dark). This is a real asset Phase 1 should audit and
extend, not throw away.

## 8. Navigation findings

Confirmed concretely in Section 4 above: the "More tools" dropdown
menu on `dashboard.html` is already overloaded, and this session made
it measurably worse by adding three more entries (Forms, Proposals,
Documents) to an already-long list, on top of feature entries added in
prior sessions (Milestones, Playbooks, Idea Vault, Autopilot, Activity
Log, and the vertical-specific tools). Section 4's proposed
Home/Work/Clients/Money/Operations/Discover/Insights structure is a
real, warranted fix for a real, observable problem - not a
speculative improvement.

## 9. Feature gaps (net new work Boardly 2.0 actually requires)

Ranked by how much new surface area each represents, largest first:

1. **Money Center** (Sections 8-12) - invoices, payment links, a
   general transaction ledger, expenses, retainers, profitability.
   Genuinely nothing exists here beyond Marketplace's own scoped
   payment flow. This is the single largest gap and the one most
   directly tied to the brief's core positioning ("Work. Clients.
   Money. One place.").
2. **Client CRM + lead pipeline** (Sections 13-15) - no `clients` or
   `leads` objects exist; `board_members` is authentication/collaboration,
   not a sales record.
3. **Marketplace trust/dispute layer** (Sections 17-20) - listings and
   escrow-style payment exist; verification badges, a real dispute
   center, and professional profiles with reputation do not.
4. **Vertical "modes" as first-class configured workflows** (Sections
   21-26) - the underlying board verticals (Classroom, Dispatch, Care
   Rounds, Content Calendar, Dev Board, Client Work) already exist and
   are genuinely good starting material, but they're separate board
   *types*, not the persona-driven module-toggling system Section 63
   describes (`workspace_type`, `enabled_modules`, a shared codebase
   configured per persona rather than a vertical baked into board
   creation).
5. **Intelligence layer as named systems** (Sections 27-31) - Silent
   Sentinel, Reality Mode, Opportunity Radar, and Intelligence Graph
   as *named, dedicated* features don't exist. Real building blocks for
   several already do (Board Health is deterministic and event-driven
   in spirit; Task DNA tracks per-task friction signals already;
   activity_events is a real event log Reality Mode could read from).
6. **Full navigation/design-system rebuild** (Sections 4-6, 35-41) -
   see Sections 7-8 above.
7. **Onboarding/persona configuration** (Sections 62-63) - no
   persona-selection flow exists; new signups land straight on an
   empty general board today.

## 10. Recommended migration plan

Given everything above, three things follow directly from the brief's
own stated principles (Section 2's "inspect before modifying," Section
90's "do not build everything in one pass," Section 99's "chase useful
actions completed, not feature count"):

1. **Don't touch the design system or navigation first**, tempting as
   Section 90's own Phase 1/2 ordering makes that. Rebuilding
   typography and nav across 24 pages before anything Money-related
   exists would touch the most surface area for the least new
   capability, and directly risks the "collection of generated pages"
   outcome the brief itself warns against in Section 84. Money Center
   is the actual gap that makes Boardly 2.0 Boardly 2.0.
2. **The font conflict (Section 37 vs. General Sans) needs a decision
   before ANY Phase 1 work**, not a default. Changing it touches every
   page ever shipped; keeping it means Section 37 gets an explicit,
   documented exception rather than being silently ignored.
3. **Build Money Center as its own vertical slice** - schema, one or
   two Edge Functions for anything payment-adjacent, and a real UI -
   verified and shippable on its own, the same incremental discipline
   every feature this session already followed, rather than as a
   sub-task of a wholesale navigation rewrite.

This document is Phase 0. It makes no code changes. The next message
should be Charles picking which of the two open decisions above to
settle, and which single Phase 1 slice to actually start on -
consistent with "do not try to build everything in one pass."
