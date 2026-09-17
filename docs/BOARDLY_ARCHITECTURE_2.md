# Boardly 2.0 Architecture

This describes the system as it actually exists, not the aspiration. Where
something the brief describes isn't built yet, that's said plainly rather
than implied.

## Stack

Plain HTML, CSS, and JavaScript. No build step, no bundler, no framework
(no React, no Vue). Every page is a real, hand-written `.html` file, and
every feature is a real, hand-written `.js` file loaded with a plain
`<script src="...">` tag. Hosted on GitHub Pages.

The backend is entirely Supabase:

- **Postgres** for every table, with row level security (RLS) doing all
  tenant isolation, see `BOARDLY_SECURITY_2.md`.
- **Supabase Auth** for accounts and sessions.
- **Supabase Storage** for uploaded files.
- **Supabase Realtime** for the small number of places that actually need
  live updates (a single board's own channel while it's open, nothing
  subscribes globally).
- **Edge Functions** (Deno/TypeScript) for anything that must run
  server-side: payments, webhooks, admin-only reads, AI calls, anything
  that needs a secret key the browser must never see.

This is a deliberate choice, not a limitation waiting to be fixed. The
brief's own Section 73 calls for the cheapest architecture that safely
supports the current stage, and a plain-JS/Supabase stack with zero
hosting cost (GitHub Pages) and a generous Supabase free tier is exactly
that for a single-developer product at this size.

## Why no framework

Every page works today without a build step: edit a file, refresh the
browser, see the change. That trade-off is intentional. The real cost is
size: some JS files (`dashboard.js` in particular) have grown large
because there's no module system to split them across files without
manually managing script-tag order and shared globals.

## Schema versioning

There's no migration framework. Every schema change is its own numbered
SQL file (`supabase/schema_v1...sql` through the current version), run
once by hand or via the Supabase MCP connector, always written to be safe
to re-run (`add column if not exists`, `create table if not exists`,
`drop policy if exists` before `create policy`). Nothing has ever been
destructively rewritten; old schema files stay in the repo as history.

Reaching schema_v74 does not mean 74 tables exist, most files add one or
two columns or a single new table to something that already existed.

## Information architecture

Seven top-level destinations (brief Section 4): **Home, Work, Clients,
Money, Discover, Insights**, and **Settings**. Six of these are real,
consistent nav destinations across every hub page (desktop and mobile).
**Operations** deliberately has no top-level nav link of its own yet:
vertical workflows (logistics, teaching, freelance, field service,
healthcare, social media, software) are board types inside Work, grouped
and surfaced through `operations.html`, not a separate first-class module
system. That's real future work (brief Section 63's fuller persona
configuration), not something this doc should overstate as done.

## The vertical fields system

Rather than a named database column per industry field (`delivery_address`,
`patient_name`, `student_name`, and so on for every vertical), every task
has one flexible `metadata` jsonb column (schema_v14). Which fields render
for a given task is driven entirely by `VERTICAL_FIELDS` in
`js/dashboard.js`, a plain JavaScript object keyed by work type. Adding a
new field to an existing vertical, or a new vertical entirely, needs no
schema migration, only a change to that one object (and, if the field is
numeric, both branches of `renderVerticalFields`/`collectVerticalFields`
already support text, textarea, and number types).

This is the same reasoning behind `user_settings.workspace_type` and
`user_settings.goals`: durable signals live in real columns, workflow
details live in flexible jsonb, and neither approach is used where the
other fits better.

## AI integration

One pattern, reused everywhere AI appears: **Groq first** (a genuinely
free tier, no card, currently `openai/gpt-oss-120b`), **OpenRouter as an
automatic fallback** if Groq isn't configured or a specific call fails
(free models: `meta-llama/llama-3.3-70b-instruct:free`, then
`deepseek/deepseek-chat-v3-0324:free`). Every AI-backed edge function
(`board-assistant`, `generate-proposal-draft`, `generate-cv-draft`) uses
this identical fallback chain and the same two secrets
(`GROQ_API_KEY`, `OPENROUTER_API_KEY`), so getting one working sets up all
of them.

Per brief Sections 72 and 83: AI is never used where a plain database
query or a deterministic rule would do (overdue detection, invoice
status, Silent Sentinel's signals are all plain arithmetic and threshold
checks, none of them AI). AI is reserved for genuine language generation
(writing a proposal or a CV draft) and always produces a draft a person
reviews before anything saves or sends, never an autonomous action.

## What doesn't exist yet (stated plainly, not glossed over)

- **No background job runner or scheduler.** Nothing in this codebase
  runs on a timer. Retainers, overdue detection, and every other
  "should happen automatically" feature is instead computed at load time
  or triggered by an explicit click. Where the brief implies automation
  (Section 12's "Boardly automatically creates recurring invoice"), the
  actual behavior is stated honestly in both code comments and UI copy
  rather than faked.
- **No test runner or build step.** Sections 78-79's testing requirements
  are met by `supabase/tests/rls_policy_audit.sql`, a saved, re-runnable
  SQL audit against Postgres's own policy catalog, the honest equivalent
  for a project with no test infrastructure, not a substitute pretending
  to be full test coverage.
- **No formal module/entitlement gating per persona.** `js/entitlements.js`
  gates by subscription tier (Free/Pro/Pro+), not by the workspace
  persona questions from signup. Section 63's `enabled_modules` /
  `default_workflows` / `default_dashboard` vision is only partially
  realized (`user_settings.goals` reorders Home's section order, nothing
  is hidden or gated by persona).
- **Marketplace is both a directory and a job board, on purpose.** The
  original directory (schema_v30, clients search professional profiles
  and initiate an inquiry or booking) still works exactly as before.
  A job board (schema_v75, clients post work, professionals browse and
  apply) was added alongside it rather than replacing it, per Section
  89's "never destroy working functionality." An accepted application
  does not yet automatically create an escrow booking, connecting those
  two flows is a real, separate follow-up, not built yet.

See `docs/BOARDLY_IMPLEMENTATION_STATUS.md` for the full, current,
feature-by-feature status table.
