# Boardly 2.0: Product

What Boardly is today, who it is for, and what is real versus planned. For
feature by feature status see `BOARDLY_IMPLEMENTATION_STATUS.md`. For the
per-persona step check see `BOARDLY_94_SUCCESS_CRITERIA_WALKTHROUGH.md`. For
how it is built see `BOARDLY_ARCHITECTURE_2.md`, and for how it is protected
see `BOARDLY_SECURITY_2.md`.

Last updated: 21 Sep 2026.

## The one sentence

Boardly is one place for getting work, doing work, and getting paid.
Find the work, win the client, do the work, get paid, keep the business
moving.

## Who it is for

Freelancers, small agencies, teachers, dispatch and delivery businesses,
field service businesses, creators, consultants, developers and small
teams, many of them in Nigeria. The underlying system is shared. The
experience adapts through the work type picked at signup and the goals
question that follows it. There is one codebase, not one per persona.

## The shape of the product

| Area | What is there |
|---|---|
| Home | Attention, Today, Money, Work, Clients, Momentum. Every number is a plain query or arithmetic. |
| Work | Boards, tasks, calendar, timeline, time tracking, health and baseline tools, proposals, documents. |
| Clients | Client list with a lead pipeline, follow-up drafts, client portal, custom forms. |
| Money | Invoices, payments through Paystack, expenses, ledger, retainers, profitability, CSV export. |
| Operations | Boards grouped by work type (classroom, dispatch, care, content, dev and more). |
| Discover | Marketplace: profiles, bookings with held payment, job board, reviews, disputes. |
| Insights | Stats page. Reality checks (plan versus actual) live in the project tools on the dashboard. |

Navigation on a phone is the menu button in the header. The fixed bottom tab
bar was removed on 21 Sep 2026 because it covered menus and modals and only
linked to four pages.

## The two loops

Daily: open Boardly, see what matters, fix the important thing, do the
work, update the client, get paid, prepare tomorrow.

Business: discover, lead, client, proposal, payment, project, work,
approval, invoice, payment, review, retainer, repeat.

## What is AI and what is not

Only these use AI: the board assistant, "Write with AI" on proposals and
the CV builder, and "Fill with AI" on lead, client, invoice, expense and
retainer forms. In every case AI proposes a draft and the person reviews it
and saves it. Nothing is sent to a client or saved by AI alone.

Everything else is deterministic and is not called AI: overdue detection,
Sentinel signals, profitability margins, reality percentages, follow-up
ages, sorting.

## Money, in plain terms

- Invoices, a transaction ledger, expenses, retainers and per-project
  profitability are real and stored in the database.
- A payment is only marked received after Paystack confirms it to the
  server (a signed webhook, or a server-side verify call). A button click
  never marks money as received.
- Paystack is in Test Mode today. Marketplace bookings hold the buyer's
  payment, and the buyer releases it when the work is done.
- Releasing the money to the provider uses Paystack Transfers. Paystack has
  to approve the business for Transfers first. Until then the release fails
  safely: the payment stays held, the buyer sees a plain message saying so,
  and nothing is lost or sent twice.
- Boardly does not run its own escrow or custody. Held payments sit in the
  Paystack account. Going live with real payouts needs a review of the
  payment provider and local rules first.

## Plans

`js/entitlements.js` is the one place that says what a plan unlocks, using
`can("feature")` checks. There are three tiers today (free, pro, pro plus).
A fourth tier is deliberately not added until something genuinely belongs
in it.

## Team, what exists and what does not

Exists:

- Invite people by email with three roles: can edit, team leader, view only.
- The owner sees everyone invited, pending or accepted, and can remove
  anyone or cancel a pending invite. Removing a person un-assigns their
  tasks on that board. Their comments and messages stay.
- Assignments, task comments with mentions, weekly capacity per member, and
  a team workload view.
- An internal approval flow (submit, approve, request changes) with stored
  history, and a per-board switch that limits approving to team leaders.
- Team chat per board (members only, live).
- Notifications with mark as read, delete one, and clear all.

Not there yet: sending someone a copy of the invite by email from Boardly
itself (a person without an account gets access the moment they sign up with
the invited address), and a member leaving a board on their own.

## Known product gaps

The command center, autopilot, Opportunity Radar, the intelligence graph,
enabled modules and default workflows per persona, contracts, a public
landing page beyond the hero, sign-in with a second factor, private file
storage, and payouts beyond the marketplace release are planned, not built.
Boardly does not pretend otherwise.

## What to do next, in order

1. Try the whole payment flow in a real browser with two accounts and fix
   what turns up.
2. Move task attachments to a private storage bucket with signed links
   (finding F5 in the security document).
3. Add sign-in with a second factor, with server-side enforcement (F6).
4. Rebuild the rest of the public landing page, then the Operations hub and
   Insights, following the brief.

## Rules the product holds itself to

- Never mark money as received from a button click.
- Nothing is sent to a client without the owner pressing send.
- No fake AI labels, no invented opportunities, no invented trust scores.
- Existing features are improved, not removed, unless a clear replacement
  exists or the feature was actively getting in the way.
- Claim only what has been tested. A screen existing is not a feature
  working.
