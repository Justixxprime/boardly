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
| Navigation rebuild (Home/Work/Clients/Money/Operations/Discover/Insights) | Planned | No | Money added to top level nav this session, all other sections still absent | No | No |
| Command Center (natural language to structured plan to approval) | Planned | No | No | No | No |
| Client CRM and lead pipeline | Planned | No | No | No | No |
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
