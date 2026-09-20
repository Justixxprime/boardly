# Boardly 2.0: Security

Last reviewed: 19 September 2026, by reading the code in the GitHub repo.
Where a line says "live", it was checked or deployed against the real Boardly
Supabase project on 19 September 2026. Everything else was read from code.
This document is a factual map of what protects Boardly and what does not
yet. It does not claim Boardly is "secure". Where something is fixed in
code but not yet live, it says so.

## 1. How access control works

- The browser only ever holds the public anon key. Every table has row
  level security (RLS) turned on, and RLS is the main guard between one
  user's data and another's. `supabase/tests/rls_policy_audit.sql` checks
  this and can be re-run any time.
- Anything that needs to act across users, or for someone without a login,
  runs in an Edge Function using the service role key. That key never
  reaches the browser.
- Public pages (invoice, proposal, booking status, request portal, custom
  forms, shared boards, public roadmap) do not read tables directly. They
  call an Edge Function with a long random token from the link, and the
  function checks the token.
- Admin actions (`admin-list-users`, `admin-set-plan`, `admin-delete-user`,
  `admin-system-health`) need a real login, and the caller's email must be
  in the `ADMIN_EMAILS` secret. The check happens on the server. A frontend
  "is admin" flag is never trusted.

## 2. Money, what is enforced in code

- The amount to pay is computed on the server from the ledger
  (`create-invoice-payment`). A price sent by the browser is ignored.
- Each payment attempt writes a `pending` transaction first, with its own
  idempotency key, and only a verified Paystack event can make it
  `confirmed`. A button click in the browser never marks anything paid.
- Paystack webhooks (`payment-webhook`, plus the two older single-purpose
  ones) verify an HMAC SHA-512 signature with a timing-safe compare, check
  the amount, and (since this pass) check the currency. A replayed webhook
  changes nothing.
- The marketplace has a fallback that asks Paystack directly
  (`marketplace-verify-payment`), for when the webhook never arrives. It
  applies the same amount check.
- Deleting a booking is only allowed for `pending_payment` and `cancelled`
  (`marketplace-delete-booking`). Bookings with real payment history are
  never deletable.

## 3. Public endpoints (deployed with `--no-verify-jwt`)

How each caller proves itself, taken from each function's own header
comment and a keyword scan. A full line by line review of each one is
still open.

| Function | Caller | Proof |
|---|---|---|
| `payment-webhook`, `invoice-payment-webhook`, `marketplace-payment-webhook` | Paystack | HMAC signature |
| `slack-slash-command` | Slack | Slack signing secret |
| `zapier-create-task` | Zapier | API key |
| `send-reminders` | Scheduler | `CRON_SECRET` bearer |
| `get-invoice-info`, `create-invoice-payment` | Invoice client | Invoice `public_token` |
| `get-proposal-info`, `respond-to-proposal` | Proposal client | Proposal `public_token` |
| `get-shared-board`, `client-portal-action` | Board viewer | `share_token` |
| `get-public-roadmap`, `roadmap-vote` | Public | `public_token` |
| `get-request-portal-info`, `submit-request` | Public | `portal_token` |
| `get-custom-form-info`, `submit-custom-form` | Public | `public_token` |
| `marketplace-pay-application` | Signed-in job poster | Login token, then the database confirms this user posted the job. Amount is read from the accepted application, never sent by the browser |
| `marketplace-booking-status`, `-release-payment`, `-file-dispute`, `-submit-review`, `-verify-payment` | Paying client | Booking id plus `access_token` |
| `marketplace-find-bookings-by-email` | Anyone | None. It returns nothing sensitive, it emails the links (see F2) |
| `marketplace-get-trust-badges` | Public | None, public by design, booleans and counts only |
| `google-oauth-callback`, `video-workroom` | Google, video room | Not re-audited in this pass |

## 4. Findings

Severity is my judgement of the damage if abused. "Fixed in code" means the
fix is written and tested here but is not live until deployed.

| ID | Severity | Finding | Status |
|---|---|---|---|
| F1 | High | A provider could read a booking's `access_token` from their own bookings (schema_v33 policy plus `select *`). That token is the client's key to release held money, so a provider could release the payment to themselves. | Fixed and live. `schema_v77_hide_booking_token_from_provider.sql` plus an explicit column list in `js/marketplace.js`. Re-checked on the live database on 20 Sep 2026: signed-in users cannot read `marketplace_bookings.access_token`. |
| F2 | High | "Find my booking" returned the token to anyone who typed the email. | Fixed and deployed (live, version 2). It emails the links and always gives the same neutral reply. Needs `BREVO_API_KEY` and `BREVO_SENDER_EMAIL` to be set as secrets. Until the frontend is pushed, the old lookup form shows an error instead of the neutral message. |
| F3 | High | Invoices in a currency other than NGN were sent to Paystack without a currency, so they were charged in NGN, and the webhook only compared the number. A 500 USD invoice could be "paid" with 500 NGN. | Fixed and deployed (live). On the live database there were no non-NGN invoices and no non-NGN transactions, so the bug had not been triggered yet. Any old pending non-NGN attempt would now correctly refuse to confirm. |
| F4 | Medium | `generate-proposal-draft` and `generate-cv-draft` accepted the public anon key and had no limit, so anyone could spend the free AI quota. | Fixed and deployed (live). A real signed-in user is required, plus a small hourly limit. |
| F5 | Medium | The `task-attachments` storage bucket is public (the setup guide says to turn Public on). Anyone with a file's URL can open it. Uploads are limited to a user's own folder, reads are not. | Open. Needs a private bucket, signed URLs, and a frontend change. |
| F6 | Medium | No multi-factor sign-in in Boardly. Supabase Auth supports it, it is not wired up. | Open. |
| F7 | Medium | Confirming a payment is several separate updates (transaction, then invoice status), not one database transaction. If the second fails, the ledger is right and the invoice status is stale until the next payment. | Open. Fix is a Postgres function called through `rpc`. |
| F8 | Low | `security_events` rows are written by the browser, so a user can insert their own. It is an activity trail, not a tamper-proof audit log. Server side money actions are not in it. | Open. |
| F9 | Low | No rate limiting on public endpoints such as `submit-request`, `submit-custom-form`, `roadmap-vote`. | Open. |
| F10 | Low | There are about 343 `innerHTML` uses in `js/`. Some paths escape, and this pass did not audit them for XSS. | Open. |
| F11 | High | `schema_v76` is live (it is missing from GitHub). It stores the client's booking token on `marketplace_applications.booking_access_token`, and the applicant, the freelancer who would be paid, could read it. Confirmed on the live database. Same hole as F1, second door. No application had a token yet, so nothing was exposed so far. | Fixed and live. `schema_v78_hide_application_booking_token.sql` hides the column and gives the poster a checked function, `get_application_booking_link`. Re-checked live on 20 Sep 2026: the column is not readable. The missing v76 SQL is now in the repo as `schema_v76_application_booking_link.sql`. |
| F12 | Info | Every function sends `Access-Control-Allow-Origin: *`. That is acceptable here because auth uses tokens and bearer headers, not cookies. | Accepted. |
| F13 | Medium | `board-assistant` is live with JWT verification off and never checks who is calling, so anyone on the internet can use it to spend the free AI quota. The gateway check alone would not help, because the public anon key is a valid token. | Open. Fix: the same signed-in-user check the two AI writers now have. |
| F14 | Low | `create-invoice-payment` builds Paystack's return link from an `origin` sent by the browser. A crafted request could send a payer back to a look-alike site after paying. | Fixed and live. `create-invoice-payment` and `marketplace-create-booking` both use a fixed site address (`PUBLIC_APP_URL`, defaulting to the GitHub Pages address) and ignore any browser-sent origin. The new `marketplace-pay-application` does the same. Side effect: the invoice return link used to drop the `/boardly` folder and would have 404ed on GitHub Pages, now it lands correctly. |
| F15 | Low | Not a security issue, but found while testing: an applicant who applies to the same job a second time gets a row level security error, because only the poster has an UPDATE policy. | Fixed and live (`schema_v80`). An applicant may now edit their own application while it is still waiting for a reply. |
| F16 | High | Found while fixing F15. The INSERT policy on `marketplace_applications` only checked the applicant id. A signed-in user could insert their own application already marked `accepted`, or with `booking_id` and `booking_access_token` filled in, and the poster would see an acceptance they never gave. | Fixed and live (`schema_v80`). Column privileges limit what a browser can write, and a trigger forces new applications to `submitted`, blocks applying to your own or a closed job, lets only the poster accept or decline (once, and only with a price on the application), and lets only Edge Functions write the booking link. Ten cases tested in a rolled-back transaction on the live database. |
| F17 | Medium | `marketplace-release-payment` checks the booking is `paid_held`, sends the Paystack transfer, and only then marks it `released`. Two requests at the same moment could both pass the check and send the money twice. | Fixed (schema_v84, live). The function now claims the booking with a conditional update from `paid_held` to a new `releasing` status before calling Paystack. Only one concurrent request can win that update; the other is told the payment is already being released and never calls Paystack. If the Paystack call fails after the claim, the booking is put back to `paid_held` so it can be retried. booking-status.html/js show a "sending the payment" state while a booking sits at `releasing`. Not yet exercised with a real double-click or two real browser tabs, that needs Paystack live mode or a manual race test. |
| F18 | Low | A job with money held could be deleted by its poster, which would delete the application that holds the link needed to release the money. | Fixed and live (`schema_v82`). A signed-in poster cannot delete a job while any of its bookings is paid and held, waiting for payment under 24 hours, or in an open dispute. They can close it instead. |

Limits added this pass (`ai-fill-form`, the two AI writers, the booking
lookup) live in the memory of one function instance. They slow abuse down.
They are not a hard guarantee.

## 5. Not built, so not claimed

Multi-factor sign-in, a server side audit log for payments, refunds and
permission changes, upload malware scanning, a content security policy
(GitHub Pages cannot set headers), cross-tenant penetration testing, a
payment reconciliation job.

## 6. Re-running the checks

```
node supabase/tests/payment-webhook.test.mjs        # needs: npm i esbuild
node supabase/tests/payment-webhook.test.mjs supabase/functions/invoice-payment-webhook/index.ts
node supabase/tests/find-bookings-by-email.test.mjs
node supabase/tests/ai-writers-auth.test.mjs
node supabase/tests/ai-fill-form.test.mjs
node supabase/tests/ai-fill-ui.test.mjs             # needs: npm i jsdom
```

Also run `supabase/tests/rls_policy_audit.sql` in the Supabase SQL Editor,
and after v77 run the two `has_column_privilege` lines at the bottom of that
file. `can_read_token` should say false.

## 7. Deploy state of this pass (19 September 2026)

Live now (deployed to the Boardly project, checked in the function list):
`ai-fill-form` (new), `payment-webhook`, `invoice-payment-webhook`,
`create-invoice-payment`, `generate-proposal-draft`, `generate-cv-draft`,
`marketplace-find-bookings-by-email`. JWT verification is unchanged for the
existing ones, and on for `ai-fill-form`.

Waiting for one step from you:
1. Push the frontend files to GitHub (`js/marketplace.js`, `js/marketplace-public.js`,
   `js/booking-status.js`, `booking-status.html`, `js/ai-fill.js`, `js/clients.js`,
   `js/money.js`, `clients.html`, `money.html`).
2. Then run `schema_v77` and `schema_v78`. Both were tested on the live database
   inside a transaction that was rolled back. They are not applied.

Also needed: the Brevo secrets (`BREVO_API_KEY`, `BREVO_SENDER_EMAIL`) must exist
for "Find my booking" to send email. The tools available here cannot read secrets,
so this is not confirmed.
