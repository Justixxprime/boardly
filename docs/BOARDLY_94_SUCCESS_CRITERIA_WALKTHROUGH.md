# Section 94: success-criteria walkthrough

**Method note, read this first:** this is a code-level trace (reading the
actual files, functions, and edge functions involved in each step), not
a live click-through in a real browser. I don't have a browser tool in
this environment to actually sign up, click buttons, and watch what
happens. Every "real" below means the mechanism genuinely exists and is
wired up in the code I read. A real end-to-end browser test is still a
separate, needed step, this doc tells you where to expect it to work and
where it will visibly break or fall short.

Status key: ✅ real and wired up · ⚠️ partially real (works, but not the
way the brief describes) · ❌ gap, doesn't exist yet.

---

## Freelancer walkthrough

| # | Step | Status | Notes |
|---|------|--------|-------|
| 1 | Sign up | ✅ | Existing auth (signup.html), predates this effort. |
| 2 | Choose Freelancer | ✅ | Signup asks a real question right after account creation ("What are you organizing?", js/auth.js's SIGNUP_WORK_TYPES, persisted to user_settings.workspace_type), and a second, optional question was added in a later session ("What do you want help with?", user_settings.goals per schema_v74), which now reorders Home's Money/Work/Clients sections by relevance rather than just sitting unused. Still narrower than the brief's own persona list (framed around board terminology like Logistics/Freelance/Teaching, not business personas like Agency or Consultant), and the goals answer only reorders Home, it doesn't yet gate default_dashboard/enabled_modules more broadly per Section 63's fuller vision. |
| 3 | Create profile | ✅ | Marketplace profile (display name, headline, bio, skills, rate range, location, portfolio link, availability). |
| 4 | Add service | ❌ | There's no discrete "service" concept, a profile has one skills field and one rate range, not a list of individually priced services someone could add one at a time. |
| 5 | Find an opportunity | ⚠️ | The brief describes a job board (clients post jobs, professionals browse and apply). What's actually built is a searchable directory of professional profiles, a client finds and contacts a freelancer, not the other way around. A freelancer can't currently browse open opportunities. |
| 6 | Apply | ❌ | Follows directly from #5, there's nothing to apply to. |
| 7 | Win client | ⚠️ | Works, but the flow is inverted from the brief: a client sends an inquiry to a freelancer's public profile, the freelancer responds. |
| 8 | Send proposal | ✅ | Proposals feature, now with the richer document layout and Write with AI (this session's work). |
| 9 | Receive payment | ✅ | Two real paths: marketplace booking payment (Paystack, escrow-style release) or a Money invoice payment link. |
| 10 | Start project | ✅ | Boards, core feature. |
| 11 | Create tasks | ✅ | Core feature. |
| 12 | Deliver work | ⚠️ | File attachments on tasks are real, but there's no formal "submit this as the deliverable" action tied to a booking, a freelancer just tells the client out of band that the work is done. |
| 13 | Receive approval | ✅ | For a marketplace booking specifically: the client's "Confirm the work is done & release payment" button on booking-status.html. For non-marketplace client work there's no formal approval step beyond conversation. |
| 14 | Send final invoice | ✅ | Money invoices. |
| 15 | Receive final payment | ✅ | Paystack invoice payment. |
| 16 | Ask for review | ✅ | marketplace-submit-review, only after a booking is released, one review per booking. |
| 17 | Offer retainer | ✅ | Retainers (brief Section 12), built in a later session: Money's Retainers tab, a recurring amount/client/billing day, "due this period" detection, and a one-click "Generate this month's invoice" that produces a normal, pre-filled invoice linked back to it. |
| 18 | Manage repeat work | ✅ | Clients CRM tracks every project per client, lifetime value, project count. |

**Freelancer summary:** the money and delivery mechanics (proposals,
payments, invoices, reviews) are genuinely solid, and Retainers has since
been built (see the implementation status doc). Onboarding now asks both
of the brief's questions, the remaining weak link is narrower: no
per-service listing, and the marketplace is a directory a client browses,
not a job
board a freelancer applies to.

---

## Teacher walkthrough

| # | Step | Status | Notes |
|---|------|--------|-------|
| 1 | Create course | ⚠️ | No dedicated "course" object, a teaching-mode board stands in for a course/class. |
| 2 | Create class | ⚠️ | Same as above, one board per class is the working pattern. |
| 3 | Add students | ✅ | Classroom's roster (addRosterStudent), name and email per student, archivable. |
| 4 | Charge students | ❌ | No enrollment or per-student billing link exists. A teacher could create a Money invoice per student manually, but nothing connects a roster entry to an invoice. |
| 5 | Teach | ✅ | Lessons are just tasks on the teaching board (activeLessons), nothing fake here, it's the same real task system every board uses. |
| 6 | Assign work | ✅ | Same, tasks with due dates. |
| 7 | Grade | ✅ | A real rubric builder (saveRubric, custom rows) and per-student grading (populateGradeRows, saveGradesAndComplete), plus a gradebook CSV export. This is one of the more fully-built vertical workflows in the app. |
| 8 | Track progress | ✅ | classAveragePct and the gradebook view. |
| 9 | Communicate | ⚠️ | Task comments and mentions exist (core feature) but there's no parent-facing communication surface, no dedicated messaging built for this vertical. |
| 10 | Renew enrollment | ❌ | No enrollment concept exists, so nothing to renew. |

**Teacher summary:** grading and rosters are genuinely well built, better
than I expected before checking. The gap is entirely on the business
side: no enrollment, no per-student payment link, no renewal reminder.

---

## Dispatch walkthrough

| # | Step | Status | Notes |
|---|------|--------|-------|
| 1 | Add customer | ⚠️ | A delivery task carries `customer_name` and `delivery_address` as metadata fields, there's no separate customer record (no link to the Clients CRM). |
| 2 | Create delivery | ✅ | A task on a logistics-type board, with the customer/address metadata above. |
| 3 | Assign rider | ✅ | Ordinary task assignment, Control Tower groups the board by assignee ("driver"). |
| 4 | Track status | ✅ | Control Tower's live view: active count, overdue count, completed today, grouped by driver. |
| 5 | Capture proof | ✅ | markDelivered accepts an optional proof-of-delivery note (e.g. "signed by," "left at door"), this is real and specific to this vertical. |
| 6 | Complete delivery | ✅ | Same markDelivered flow. |
| 7 | Collect payment | ⚠️ | A delivery task now has a real price field (metadata.price), entered the same way every other vertical field is. It records the amount, it doesn't itself process a payment, that would still go through a separate Money invoice or a marketplace booking if one applies. |
| 8 | See daily revenue | ✅ | Control Tower's stats line now sums today's completed deliveries' prices into a real "collected today" total, matching the brief's own worked example. |

**Dispatch summary:** the operational half (assign, track, prove
delivery) is real and solid, and the money half now has a real number
to work from too (a price per delivery, summed into a daily total),
built in a later session. It stops short of actually collecting the
payment, that's still a separate step through Money or a marketplace
booking.

---

## Small agency walkthrough

| # | Step | Status | Notes |
|---|------|--------|-------|
| 1 | Capture lead | ✅ | Clients CRM, a lead is a client at an earlier pipeline stage. |
| 2 | Send proposal | ✅ | Proposals, now with the richer layout and AI draft. |
| 3 | Get deposit | ✅ | A payment-stage line in a proposal (this session's work) states the deposit percentage, but doesn't itself charge it, the actual deposit still needs a separate Money invoice or marketplace booking payment. Nothing fake, just a manual link between the two. |
| 4 | Create project | ✅ | Boards. |
| 5 | Assign team | ✅ | Board members/roles, core feature. |
| 6 | Track work | ✅ | Boards/tasks. |
| 7 | Track expenses | ✅ | Money's Expenses tab. |
| 8 | Track profit | ✅ | Money's Profitability tabs, revenue minus expenses minus tracked-time labor cost. |
| 9 | Invoice | ✅ | Money invoices. |
| 10 | Retain client | ✅ | The Clients CRM's Follow-ups tab (5+ days unpaid) and client health were already real, and Retainers (built in a later session) now gives an agency an actual product to offer for retention. |

**Agency summary:** this is the most complete of the four, every core
step is real.

---

## What's actually worth building next, ranked

1. ~~Retainers~~ (brief Section 12): done in a later session, see the
   implementation status doc.
2. ~~Onboarding second question~~ (brief Section 62/63): done in a
   later session, see the implementation status doc. Still narrower
   than the brief's full persona vision, the goals answer only
   reorders Home's sections, it doesn't gate default_dashboard or
   enabled_modules more broadly.
3. ~~Delivery pricing~~ (dispatch): done in a later session, see the
   implementation status doc.
4. **Marketplace as a job board vs. a directory**: this is a bigger,
   genuinely architectural decision (the brief describes a job-board
   model, what's built is a directory-and-inquiry model), worth
   flagging to Charles directly rather than just building toward one
   side of it.

See `docs/BOARDLY_IMPLEMENTATION_STATUS.md` for the full feature-by-
feature status table this walkthrough draws on.
