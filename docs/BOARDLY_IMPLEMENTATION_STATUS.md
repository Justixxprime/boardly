# Boardly 2.0: Implementation Status

Per brief Section 93. Never marks a feature "Production Ready" just
because a UI exists. Updated as each slice actually ships.

| Feature | Status | Backend | Frontend | Tested | Production Ready |
|---|---|---|---|---|---|
| Phase 0, Audit (`BOARDLY_2_IMPLEMENTATION_MAP.md`) | Existing | n/a | n/a | n/a | Yes |
| Font decision (General Sans replaced with Synonym) | Existing | n/a | Yes (all 24 pages) | Scripted verification only | Yes |
| Design tokens: spacing/radius scales, money/client/work colors | Existing | n/a | Yes (`css/style.css`) | Not visually audited yet | No |
| `.modal-backdrop`/`.modal-panel`/`.sheet`/`.table`/`.loading-state`/`.error-state` | Existing | n/a | Yes; `.modal-panel`/`.table` now used live by Money Center | Used in money.html, not cross-browser audited | No |
| `docs/BOARDLY_DESIGN_SYSTEM.md` / `docs/BOARDLY_IMPLEMENTATION_STATUS.md` | Existing | n/a | n/a | n/a | Yes (docs themselves complete) |
| Existing 24-modal inventory migrated to `.modal-panel` | Planned | n/a | No | No | No |
| **Money Foundation, invoices table and transactions ledger** (`schema_v62_money_foundation.sql`) | Existing | Applied and confirmed live (both tables present, RLS enabled, owner-only policies confirmed) | n/a | Confirmed via `list_tables` and a column check; not yet exercised by a real invoice | No |
| **Invoice payments state machine** (`schema_v63_invoice_payments.sql`, adds `transactions.status`) | Existing | Applied and confirmed live (`status` column present, default `confirmed`, existing manual-entry behavior unchanged) | n/a | Confirmed via a column check | No |
| **`get-invoice-info` edge function** | Existing | Deployed live (version 2), now filters to confirmed transactions and returns balance/payable | n/a | Not tested end to end against a real invoice yet | No |
| **`create-invoice-payment` edge function** (starts a real Paystack checkout) | Existing | Deployed live, mirrors `marketplace-create-booking`'s proven pattern: server-computed balance, pending transaction row, Paystack initialize call | n/a | Not tested end to end. Needs `PAYSTACK_SECRET_KEY` configured to actually work | No |
| **`invoice-payment-webhook` edge function** (confirms real payments) | Existing | Deployed live, mirrors `marketplace-payment-webhook`'s HMAC signature verification and idempotent no-op pattern exactly | n/a | Not tested against a real Paystack webhook yet. Needs the webhook URL pasted into Paystack's dashboard | No |
| **`invoice.html` / `js/invoice-page.js`** (public client view, now with a real Pay now button) | Building | n/a | Yes | Not tested against live data yet | No |
| **`money.html` / `js/money.js`** (Invoices/Expenses/Ledger, owner side) | Building | n/a | Yes; ledger and summary strip now correctly exclude pending/failed gateway attempts from totals; overdue detection now real (deterministic due-date and balance check on every load, not AI, see Section 83) | Not tested against live data yet | No |
| Money Foundation, profitability view (Section 10) | Planned | No | No | No | No |
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
2. The `invoice-payment-webhook` function's URL needs to be added in
   Paystack's dashboard (Settings, API Keys and Webhooks). Marketplace's
   webhook and this one are separate URLs; both need to be registered if
   both features should work.
3. A real end to end test (create an invoice, send it, pay a small real
   amount, confirm the webhook flips it to paid) has not been run yet.

See `docs/BOARDLY_2_IMPLEMENTATION_MAP.md` for the full Phase 0 audit this
table extends, and `docs/BOARDLY_DESIGN_SYSTEM.md` for the Phase 1 decision
record.
