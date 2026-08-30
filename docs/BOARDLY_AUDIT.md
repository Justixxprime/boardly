# Boardly Audit

Audit date: 2026-08-30

## Scope and architecture

Boardly is a static, multi-page web application built with HTML, CSS,
vanilla JavaScript, Tailwind via CDN, Font Awesome, SortableJS, and
Supabase JavaScript v2. It has no package manifest or automated test
runner. The main authenticated experience is `dashboard.html` plus
feature modules in `js/`; Supabase tables are introduced through
versioned SQL files and sensitive operations use Deno Edge Functions.

This audit is based on the supplied source archive, setup guides, SQL
migrations, and Edge Function source. It distinguishes code present in
the archive from third-party account setup that cannot be verified from
source code.

## Existing and working in source

| Area | Evidence |
| --- | --- |
| Core boards and tasks | `dashboard.html`, `js/dashboard.js`, base schema |
| Task editing, subtasks, reminders, recurrence, attachments, offline queue, sharing | `js/dashboard.js`, schemas v3, v7, v10, v19, v20 |
| Work-type verticals | Control Tower, Classroom, Dispatch, Care Rounds, Content Calendar, Client Work, and Dev Board modules |
| Collaboration | task discussion, mentions, people view, waiting room, commitments, decisions |
| AI assistance | `board-assistant` Edge Function with Groq and OpenRouter fallback |
| Client-facing work | client portal and client-work views with scoped Edge Function actions |
| Marketplace | published profiles, inquiries, Paystack booking, payout setup, payment verification, and client-controlled release |
| Classroom v2 | rosters, per-student gradebook, rubrics, averages, CSV export |
| Video Workroom | Daily private rooms, expiring invitations, owner-only creation, and guest token issuance |
| Additional work intelligence | task DNA, friction detection, workload, morning routines, memory vault, control tower |

## Fixed in this audit pass

The task-edit social-media preview had already received partial fixes
in the supplied archive: it closes the editor before opening, restores
it on close, scrolls, copies captions, and is gated to Social Media
tasks. This pass completes the flow by adding a supported-image
download action and making Escape close the preview and restore the
editor.

## Existing but incomplete or needs verification

| Area | Status |
| --- | --- |
| Google Calendar | Code and setup instructions exist; the Google Cloud OAuth client, redirect URI, and secrets require owner-side confirmation. |
| Slack and Zapier | Integration code and setup guides exist; app creation, signing secret/webhook configuration, and deployment require owner-side confirmation. |
| SMS via Termii | Function exists; sender ID approval, account balance, webhook setup, and real delivery require provider-side confirmation. |
| Edge Functions and SQL migrations | Source is present; deployment and applied migration state cannot be established from the supplied archive. |
| Offline conflict handling | Local queue and conflict notification exist; there is no field-level merge. |
| Content publishing | Content Calendar records and previews content but deliberately does not auto-publish to social platforms. |
| Marketplace escrow | Booking verification and manual, client-controlled payout release exist. Automated release, refunds, and dispute handling are intentionally absent. |

## Documented but not implemented in the supplied archive

The broad product brief describes a long-term operating system. The
following product areas are not evidenced as complete, end-to-end
features in the current source: project milestones/baselines/critical
path, calendar time-blocking and timesheets, capacity scheduling,
centralized workspace roles and entitlements, file versioning/proofing,
custom public forms and deterministic automations, formal proposals/
invoices/expenses/profitability, wiki/SOP versioning, reporting and
scheduled reports, universal cross-entity search, and a centralized
Free/Pro/Pro+ capability service.

These should be developed in the brief's staged order rather than
added as isolated UI surfaces, because each requires shared data,
authorization, and migration design.

## Deferred decisions

Video Workroom now uses Daily. See `ADR-001-video-provider.md` and
`VIDEO_WORKROOM_SETUP.md`; external account setup and the Daily API
key are still required before the live call flow can be used.
The requested names Silent Sentinel, Reality Mode, Boardly Autopilot,
Opportunity Radar, One Tap Business, Do It For Me, and Boardly
Intelligence Graph have no functional specification. They should not
be guessed or presented as implemented.

## Security and production risks

- The project has server-side checks in many Edge Functions and RLS
  migrations, but production access guarantees depend on applying every
  migration and deploying every function in the relevant setup guide.
- There is no automated lint, test, type-check, or build pipeline in
  the archive. Regression checks must be added before claiming broad
  production readiness.
- Tailwind and several runtime dependencies load from public CDNs.
  Pinning versions locally and applying a CSP are recommended before a
  higher-security release.
- The marketplace relies on Paystack secrets and webhook deployment;
  payment state must remain verified by the webhook rather than browser
  navigation alone.

## Recommended order

1. Apply and record the existing SQL migrations, then deploy and smoke
   test the existing Edge Functions in a staging Supabase project.
2. Add a minimal automated browser regression suite for authentication,
   task CRUD, task preview, offline queue, sharing, and RLS boundaries.
3. Establish workspace, membership, role, and capability primitives
   before building advanced projects, automations, business tools, or
   client portals beyond the current owner-centric model.
4. Build the core project engine: projects, milestones, dependencies,
   baselines, health explanations, and deterministic critical path.
5. Add time, people, files, forms, and automation only on those shared
   primitives, then expand client/business and reporting features.
