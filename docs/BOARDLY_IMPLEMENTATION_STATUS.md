# Boardly 2.0: Implementation Status

Per brief Section 93. Never marks a feature "Production Ready" just
because a UI exists. Updated as each slice actually ships.

| Feature | Status | Backend | Frontend | Tested | Production Ready |
|---|---|---|---|---|---|
| Phase 0, Audit (`BOARDLY_2_IMPLEMENTATION_MAP.md`) | Existing | n/a | n/a | n/a | Yes |
| Font decision (General Sans, then Synonym, then Geist Sans, chosen live by Charles) | Existing | n/a | Yes (all 28 pages) | Scripted verification only | Yes |
| Design tokens: spacing/radius scales, money/client/work colors | Existing | n/a | Yes (`css/style.css`) | Not visually audited yet | No |
| `.modal-backdrop`/`.modal-panel`/`.sheet`/`.table`/`.loading-state`/`.error-state` | Existing | n/a | Yes; `.modal-panel`/`.table` now used live by Money Center | Used in money.html, not cross-browser audited | No |
| `docs/BOARDLY_DESIGN_SYSTEM.md` / `docs/BOARDLY_IMPLEMENTATION_STATUS.md` | Existing | n/a | n/a | n/a | Yes (docs themselves complete) |
| Existing 24-modal inventory migrated to `.modal-panel` | Planned | n/a | No | No | No |
| **Money Foundation, invoices table and transactions ledger** (`schema_v62_money_foundation.sql`) | Existing | Applied and confirmed live (both tables present, RLS enabled, owner-only policies confirmed) | n/a | Confirmed via `list_tables` and a column check; not yet exercised by a real invoice | No |
| **Invoice payments state machine** (`schema_v63_invoice_payments.sql`, adds `transactions.status`) | Existing | Applied and confirmed live (`status` column present, default `confirmed`, existing manual-entry behavior unchanged) | n/a | Confirmed via a column check | No |
| **`get-invoice-info` edge function** | Existing | Deployed live (version 2), now filters to confirmed transactions and returns balance/payable | n/a | Not tested end to end against a real invoice yet | No |
| **`create-invoice-payment` edge function** (starts a real Paystack checkout) | Existing | Deployed live, mirrors `marketplace-create-booking`'s proven pattern: server-computed balance, pending transaction row, Paystack initialize call | n/a | Not tested end to end. Needs `PAYSTACK_SECRET_KEY` configured to actually work | No |
| **`payment-webhook` edge function** (combined router, one URL for both Marketplace and Money) | Existing | Deployed live, solves the one-webhook-per-Paystack-account limit by checking the payment reference against both `marketplace_bookings.id` and `transactions.idempotency_key`, safe since those id spaces never overlap | n/a | Not tested against a real Paystack webhook yet. This is the URL to register in Paystack now, not the two older single-purpose ones | No |
| `invoice-payment-webhook` edge function (still deployed, superseded by `payment-webhook` above) | Existing | Deployed live but no longer the one to register in Paystack | n/a | Not tested | No |
| **`invoice.html` / `js/invoice-page.js`** (public client view, now with a real Pay now button) | Building | n/a | Yes | Not tested against live data yet | No |
| **`money.html` / `js/money.js`** (Invoices/Expenses/Ledger/Profitability, owner side) | Building | n/a | Yes; ledger and summary strip now correctly exclude pending/failed gateway attempts from totals; overdue detection now real (deterministic due-date and balance check on every load, not AI, see Section 83); Ledger tab entries can now be deleted directly (useful for cleaning up test data); money figures switched from the monospace/terminal look to a cleaner sans-serif with tabular numbers, per feedback that the mono style read as too "coder tool" | Not tested against live data yet | No |
| Money Foundation, profitability view (Section 10) | Existing | `schema_v65_profitability.sql` applied and confirmed live (adds `boards.hourly_rate`, nullable, no default so nothing is silently costed at zero) | n/a | Confirmed via a column check | No |
| **Profitability tab in `money.html`** (revenue, expenses, tracked time, labour cost, profit, margin per project) | Building | n/a | Yes; pulls from invoices, confirmed transactions, and the existing `time_entries` table; margin banding uses fixed 40%/15% thresholds, not AI, per Section 83 | Not tested against live data yet | No |
| **Client CRM foundation** (`schema_v64_clients.sql`, `clients` table, `invoices.client_id`) | Existing | Applied and confirmed live (table and column both present, RLS enabled, owner-only policy) | n/a | Confirmed via a schema check | No |
| **`clients.html` / `js/clients.js`** (client list, add/edit, computed billed/received/outstanding per client) | Building | n/a | Yes; Clients added to top nav across all pages | Not tested against live data yet | No |
| **Invoice builder client picker** (link an invoice to a saved client, auto-fill name/email) | Building | n/a | Yes; guarded so invoice saving still works even if `schema_v64` isn't run yet | Not tested against live data yet | No |
| **Navigation rebuild, Phase 2** (Home/Work/Clients/Money/Discover/Insights) | Existing | n/a | 6 of the brief's 7 sections now have a real destination and appear consistently in both desktop and mobile nav across every hub page (home, dashboard, clients, money, marketplace, stats, settings, tools): Home, Work (dashboard), Clients, Money, Discover (marketplace), Insights (stats), plus Settings. Fixed a pre-existing naming collision where "Home" already meant the public marketing page (`index.html`) in every mobile menu; that link is now labeled "Marketing site" and Home means the new authenticated `home.html`. **Operations is deliberately NOT added** as a top-level destination: per the Phase 0 audit, the vertical workflows (Classroom, Dispatch, Care Rounds, Content Calendar, Dev Board) are board *types* selected inside Work, not separate pages or a standalone module system (that's Phase 7's persona/module work, not built yet), so a top-level "Operations" link would have nowhere real to point without either duplicating Work's board-switcher or being a fake placeholder | Confirmed via scripted duplicate-ID and div-balance checks on every touched file | No |
| **Home, Phase 3** (`home.html`/`js/home.js`, Section 6) | Existing | n/a | Attention/Today/Money/Work/Clients/Momentum sections, every number a plain query or plain arithmetic over tasks, invoices, transactions, and clients, none of it AI, matching Section 83. Sections degrade gracefully to "n/a" rather than erroring if Money's or Clients' schema files aren't run yet. Now the genuine post-login landing page: `js/auth.js` (sign-in and post-signup redirect) and `js/supabase-client.js` (`redirectIfLoggedIn`, the already-logged-in bounce from login/signup) all changed from `dashboard.html` to `home.html`, and the Boardly logo link on every page (previously pointing to `dashboard.html`) now points to `home.html` too, the standard "logo goes home" convention. The old Good Morning modal (`js/morning.js`) is kept as-is per Charles's explicit choice, both exist for different purposes | Not tested against a real login flow yet | No |
| Command Center (natural language to structured plan to approval) | Planned | No | No | No | No |
| **Lead pipeline, Section 14** (`schema_v66_lead_pipeline.sql`, `clients.pipeline_stage`) | Existing | Applied and confirmed live. A lead is modeled as a client row whose stage isn't yet 'active_client', not a separate table, avoiding the lead-to-client hand-off conversion problem Section 14 itself warns about. Existing clients defaulted to 'active_client' (not 'new'), since they were already real relationships before this migration | n/a | Confirmed via a column check | No |
| **Clients page pipeline UI** (Active/Leads/All tabs, inline stage editor, Add lead button, stage badge in detail view) | Building | n/a | Yes; guarded by `pipelineReady` so the page still works if `schema_v66` isn't run yet (shows everyone as Active client) | Not tested against live data yet | No |
| **Follow-up engine, Section 15** (invoice aging, drafted follow-ups) | Building | n/a (no schema change needed, reuses existing invoice fields) | Yes; a Follow-ups tab on `clients.html` surfaces any sent/viewed/unpaid invoice aged 5+ days (a fixed, stated threshold, not AI), each with a "Draft follow-up" button producing an editable, copyable message. Nothing is ever sent automatically, matching the brief's explicit warning against auto-spamming clients. Scoped to invoices only this pass, proposals don't yet link to a saved client (`client_name` is free text there), extending that is real future work | Not tested against live data yet | No |
| Marketplace trust and dispute layer | Planned | Partial (payments only) | Partial | No | No |
| Persona/vertical module system (`workspace_type`) | Planned | No | No | No | No |
| Intelligence layer (Sentinel/Reality/Radar/Graph as named systems) | Planned | Partial (building blocks exist) | No | No | No |
| Onboarding persona selection | Planned | No | No | No | No |

**Status key:** Existing (was already true, or is now confirmed live, as of
this session) / Building (in progress this session) / Blocked / Planned
(not started) / Tested / Production Ready.

**What "real Paystack payments" needs to actually go live, beyond the code:**
1. `PAYSTACK_SECRET_KEY` must be set as a secret on the Supabase project
   (the same key Marketplace already uses works here too).
2. The `payment-webhook` function's URL (a single combined router that
   now handles both Marketplace and Money) needs to be added in
   Paystack's dashboard (Settings, API Keys and Webhooks). This replaces
   the earlier plan of needing two separate URLs registered.
3. A real end to end test (create an invoice, send it, pay a small real
   amount, confirm the webhook flips it to paid) has not been run yet.

See `docs/BOARDLY_2_IMPLEMENTATION_MAP.md` for the full Phase 0 audit this
table extends, and `docs/BOARDLY_DESIGN_SYSTEM.md` for the Phase 1 decision
record.
