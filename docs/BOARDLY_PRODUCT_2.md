# Boardly 2.0: Product

What Boardly is today, who it is for, and what is real versus planned. For
feature by feature status see `BOARDLY_IMPLEMENTATION_STATUS.md`. For the
per-persona step check see `BOARDLY_94_SUCCESS_CRITERIA_WALKTHROUGH.md`.

## The one sentence

Boardly is one place for getting work, doing work, and getting paid.
Find the work, win the client, do the work, get paid, keep the business
moving.

## Who it is for

Freelancers, small agencies, teachers, dispatch and delivery businesses,
field service businesses, creators, consultants, developers and small
teams, many of them in Nigeria. The underlying system is shared. The
experience adapts through the work type picked at signup and the goals
question that follows it.

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

## Plans

`js/entitlements.js` is the one place that says what a plan unlocks, using
`can("feature")` checks. There are three tiers today (free, pro, pro plus).
A fourth tier is deliberately not added until something genuinely belongs
in it.

## Team, what exists and what does not

Exists: invite members by email, editor and viewer roles, assignments,
task comments with mentions, weekly capacity per member, team workload
view, and an internal approval flow (submit, approve, request changes) with
stored history.

Does not exist yet: a leader role, approval limited to a leader or owner
(today any editor except the submitter can approve), and team chat. Building
these needs a database migration and changes to row level security, so it
should be done with database access and tested.

## Known product gaps

The command center, autopilot, Opportunity Radar, the intelligence graph,
enabled modules and default workflows per persona, contracts, a public
landing page beyond the hero, and payouts beyond the marketplace release
are planned, not built. Boardly does not pretend otherwise.

## Rules the product holds itself to

- Never mark money as received from a button click.
- Nothing is sent to a client without the owner pressing send.
- No fake AI labels, no invented opportunities, no invented trust scores.
- Existing features are improved, not removed.
