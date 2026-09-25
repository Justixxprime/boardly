# BOARDLY 2.0: Implementation Map (Phase 0 audit)

Written 24 Sep 2026 from the v21 zip and a read-only look at the live Supabase project (cafhqxzjujvxmarvkbxd). Nothing was changed to make this document. It is a map, not a plan to rewrite anything.

## 1. The big finding, in plain words

Most of Boardly 2.0 already exists. The earlier sessions built it piece by piece under the "BOARDLY 2.0" label (see the header comment of home.js, money.js, clients.js, operations.js and schema v62 to v75). So the remaining phases are NOT "build from scratch". They are "finish, connect and polish what is already there". Rewriting would throw away working, tested code.

## 2. Two things that need fixing before anything else

These are packaging problems, not code problems. They are the reason this audit is worth doing first.

| # | Problem | What it means | Fix |
|---|---------|---------------|-----|
| A | `css/style.css` is NOT in the v21 zip (the css folder is empty) | Every page links to it. If the zip is ever used to replace the repo, the whole site loses its styling. | Copy `css/style.css` from your live repo into the project before any push. Never delete it. |
| B | `js/mfa.js` is NOT in the v21 zip | login.html and settings.html load it. Without it, turning MFA on or signing in with MFA breaks. | Copy `js/mfa.js` from your live repo into the project. |

Also found: the live database has two migrations with no matching file in the zip (`schema_v93_mfa_enforcement` and `schema_v97_remaining_security_events_server_side`), and there are two files called v92 in the database history (`schema_v92_mfa_enforcement` and the repo's `schema_v92_squad_payouts`). The database is fine. The repo just does not have a full record. Add the missing SQL files next to the real ones so a fresh install can be rebuilt.

Best guess on cause: these files were added to the live repo in an earlier session but never copied into the working folder. That is a guess. Compare the live repo to this zip to confirm.

## 3. What the project is today (counts)

- 29 HTML pages, 77 JS files, 51 Edge Functions, 97 schema files, 78 setup guides.
- Database: 51 tables in `public`, row level security ON for all 51, 171 policies, no table with RLS on and zero policies.
- Storage: one bucket, `task-attachments`, still public (matches F5 being code-complete but not flipped).
- Service worker: `boardly-shell-v22`, network first, falls back to cache.
- Biggest file: `js/dashboard.js` at 5,318 lines. 70 JS files write to `innerHTML`, so the XSS guard tests must keep running.

## 4. Phase by phase map

Status words: DONE (built and in use), PARTIAL (built but has a known gap), MISSING (not started).

### Design system: PARTIAL
- Exists: colour and font tokens used everywhere (Fraunces, Geist, IBM Plex Mono, Font Awesome, Tailwind classes such as `text-ink-soft`, `bg-paper`, `border-line`), dark/light theme toggle in `js/site.js`, shared modal and toast patterns.
- Gap: I cannot audit `css/style.css` because it is missing from the zip (problem A). The tokens live there.
- Gap: styling is repeated across pages instead of one shared component list. `dashboard.html` alone has 52 modals.
- Next step: after style.css is restored, write a one page token and component list (colours, spacing, buttons, cards, modal, toast) and only then refactor.

### Navigation: PARTIAL
- Exists: header nav on home.html (Work, Clients, Money, Discover, Insights, Settings), mobile drawer with Home, Work, Clients, Money, Operations, Discover, Insights, Settings.
- Gap: the drawer in dashboard.html has a different list (adds Marketing site, Quick Tools, CV Builder). Different pages show different menus.
- Gap: Operations appears in the drawer but not in the desktop header on home.html.
- Next step: one shared nav definition in `js/site.js` used by every app page.

### Home rebuild: DONE (v1)
- `home.html` + `js/home.js`. Plain queries over tasks, invoices, transactions, clients. No AI. Quietly skips sections whose tables are missing.
- Next step: only after a real browser test. Add "what needs me today" ordering if wanted.

### Money foundation: DONE, needs a real test
- `money.html` + `js/money.js`, schema v62 (money), v63 (invoice payments), v65 (profitability), v73 (retainers), v85 (atomic invoice payment).
- Edge Functions: get-invoice-info, create-invoice-payment, invoice-payment-webhook, payment-webhook.
- Money is per user, not per board (decision recorded in schema v62).
- Gap: the full payment flow still needs Justice's real browser test.

### CRM: DONE (v1)
- `clients.html` + `js/clients.js`, schema v64 (clients), v66 (lead pipeline stages: new, contacted, qualified, proposal, negotiation, won, onboarding, active_client).
- Related: proposals (schema v59, v72, `proposal.html`, respond-to-proposal function), client portal (schema v27, `client-portal.html`), request portal, custom forms.
- Next step: link a client to their boards and proposals in one profile view.

### Marketplace: DONE, largest surface
- Schema v30, v33, v67 (disputes), v68 (reviews), v75 (opportunities), v76 to v88, v92 (squad payouts).
- 14 marketplace Edge Functions (bookings, payments, payouts, disputes, reviews, trust badges).
- Recently hardened: one hire per job (v86), release race fix (v84), hidden booking token (v77, v78).
- Gap: real money paths deserve a fresh end to end test before any new marketplace feature.

### Operations: DONE (v1)
- `operations.html` + `js/operations.js`, schema v69 (workspace persona), v70 (fix). Uses the work type picked at signup.
- Vertical modules: control tower (logistics), dispatch (field service), classroom, care rounds, content calendar, dev board, client work.
- Deliberately NOT a module toggling system (noted in operations.js).

### Intelligence: PARTIAL, all rules based
- Exists: Board Health, Critical Path, Task DNA, Team Workload, Insights page, Good Morning brief, Memory Vault with semantic search (Gemini embeddings), board assistant.
- Rule in the code: numbers come from real data, no guessing. Keep it.
- Gap: no single place that ties these together for the owner.

### PWA hardening: PARTIAL
- Exists: manifest with icons and shortcuts, push (send-push, push_subscriptions), service worker with offline shell.
- Gap: `SHELL_FILES` in sw.js does not list home, money, clients, operations or marketplace pages or their JS files, so those pages do not open offline.
- Gap: sw.js lists `js/mfa.js` and `css/style.css`. If either is missing, the whole shell cache install can fail (cache.addAll fails as one unit, and the error is swallowed by `.catch(() => {})`).
- Gap: manifest description still says "A kanban task board".

## 5. Security state (do not change without a real test)

- F8 closed: security events now come from database triggers (v95, v96, v97). Only `signed_out_others` is browser reported, on purpose.
- MFA enforcement (v92, v93, v94): live in the database. Files for v93 missing from the repo (see section 2).
- F5 private attachments: code done, bucket still public. Do NOT run `schema_v91_private_attachments_flip.sql` until a real upload test passes (filename with spaces, reload, second account on a shared board, proofing pin after reload).

## 6. Recommended order from here

1. Fix problems A and B (copy the two files, add the two missing SQL files). Tiny, and it protects everything else.
2. PWA: add the missing pages and JS to `SHELL_FILES`, fix manifest description. Small and safe.
3. Navigation: one shared nav in `site.js`.
4. Design system doc, then small refactors.
5. CRM client profile linking boards, proposals and invoices.
6. Intelligence: one owner summary that reuses the existing rule based numbers.
7. New Marketplace features last, after real payment testing.

## 7. Not in this document

`BOARDLY_PRODUCT_2.md` and the original overhaul spec were not available in this session, so section names here follow the phase list in the handoff, not the spec's own numbering. Match the two once the spec is pasted in.
