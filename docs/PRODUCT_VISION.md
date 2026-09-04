# Boardly: Vision & Plan Tiers

Written down properly, September 2026, so it doesn't just live in one
person's head across dozens of chat sessions.

## The vision, in plain words

Boardly is not trying to be "a Trello clone." The goal is for it to
become something people in Nigeria genuinely use every single day to
run their actual work and life - a dispatch rider tracking deliveries,
a teacher managing a classroom, a freelancer juggling clients, a small
business owner keeping the whole operation in one place - the kind of
tool that becomes part of someone's daily routine, not just another
app they downloaded once and forgot.

A few things that follow from that, worth keeping in mind every time a
new feature gets added:

- **It has to work on real Nigerian conditions** - patchy data,
  expensive data, older phones. That's exactly why offline support and
  the PWA install already exist and matter more here than they would
  for a Silicon Valley SaaS clone.
- **Daily usefulness beats impressive-looking features.** Good Morning
  view, Quick Resume, Routines, reminders - these aren't flashy, but
  they're what makes someone open the app first thing every morning
  without thinking about it. That habit is worth more long-term than
  any single "wow" feature.
- **Free has to be real, not a demo.** Someone using Boardly free,
  solo, every day for their own work should feel like they're already
  getting something excellent - not staring at locked buttons. Free is
  what gets someone using Boardly daily and telling other people about
  it, which matters more early on than squeezing revenue out of every
  account. Pro exists for the moment someone needs to work *with*
  other people, not to make Free feel deliberately limited.
- **Nothing fake.** No pretend "Upgrade" button that doesn't charge
  anyone (see `PLAN_GATING_SETUP.md`), no locked feature dressed up to
  look finished. If something isn't real yet, it should be honestly
  absent, not faked.

None of this is a promise that Boardly will make anyone rich - that
part depends on a lot of things outside what gets built. What this
doc *can* do is make sure the product itself deserves to succeed:
genuinely useful every day, honestly built, and clear about what's
free versus what's worth paying for once it's actually working for
you or your team.

## How the tiers should think about it

**Free** = everything a single person needs to run their own work
brilliantly, every day, indefinitely. Not a trial. Not a teaser.

**Pro** = the moment work stops being just yours - other people are
now involved, and Boardly needs to help coordinate them, not just you.

**Pro+** = running something bigger: a real business with clients,
money moving through the platform, or a specialized operation at
scale (a whole classroom, a whole dispatch fleet, a whole care
facility) rather than one person's slice of it.

This is a **proposal** below, not something already built. Only board
collaboration is actually gated behind Pro right now (see
`PLAN_GATING_SETUP.md`). Wiring up dozens of features at once, without
being able to test each one, isn't the right way to do this - each row
below becomes its own small, testable change over time, the same way
collaboration was done.

## FREE - the daily driver

Everything here should feel complete on its own, forever, for one
person working solo.

- The core board itself: unlimited boards, unlimited tickets, drag and
  drop, categories, due dates, attachments
- Ask AI - the assistant, Do It For Me, Emergency Mode, Capture, the
  Intelligence Graph reasoning. AI is what makes Boardly feel
  intelligent day to day - gating that away would make Free feel like
  a stripped demo, exactly what the vision above says to avoid
- Daily-habit features: Good Morning view, Quick Resume, Routines /
  Morning Routines, Quiet Hours, reminders
- Personal accountability tools: Commitment Guardian, Decision Ledger,
  Waiting Room, Silent Sentinel
- Personal insight tools: Project/Board Health, Task DNA, Execution
  Score, Friction Detector, Workload Thermostat
- Idea Vault, Playbooks, Task Templates, Custom Templates - a
  person's own knowledge and reusable setups
- Memory Vault (semantic search over your own tasks)
- Notification Center, Done Archive, offline support, PWA install
- The solo version of every vertical dashboard - Control Tower,
  Classroom, Dispatch, Care Rounds, Content Calendar, Client Work, Dev
  Board - one person running their own version of any of these, free,
  full stop

## PRO - once other people are involved

The line drawn here is simple: the moment a board has more than one
real person on it, or needs to run itself automatically, that's Pro.

- **Board collaboration / Task Assignment** (already built and gated -
  inviting anyone else onto a board)
- Timesheets (team time tracking is a "coordinating people" feature,
  not a solo one)
- Activity Log across collaborators, security features that matter
  more with more than one person having access (Security Center)
- Boardly Autopilot (automation rules) - most valuable once there's a
  team whose handoffs need automating
- Google Calendar, Slack, and Zapier integrations - genuinely
  business/team tooling, and each one is real ongoing complexity to
  support
- Public Roadmap + voting, Public Request Portal - an external-facing
  presence for a real, established operation

## PRO+ - running an actual business at scale

- **Client Portal** - a real client-facing surface, the kind of thing
  a paying client relationship justifies
- **Marketplace**, including real payments/escrow through Paystack -
  this tier should probably take a cut of what flows through it rather
  than (or alongside) a flat fee, since real money is moving
- **Video Workrooms** - Daily.co has a real per-minute cost behind it,
  so this has to be a paid, metered feature or it loses money on every
  use
- The **team-scale** version of the vertical dashboards: a whole
  classroom's rosters and grading (not just your own), a whole
  dispatch fleet, a whole care facility's rounds, content calendar
  sharing/previews with outside clients
- Memory Vault's embeddings specifically (the semantic search itself
  can likely stay free/Pro, but generating embeddings has a real
  per-use AI cost worth accounting for here)

## What this doc is NOT

- Not a finished implementation - see `PLAN_GATING_SETUP.md` for
  what's actually gated in code today (just collaboration).
- Not a billing system - there's still no real payment processor wired
  up for subscriptions. Moving someone onto Pro/Pro+ today is a manual
  step through `admin.html` (see `PLAN_GATING_SETUP.md`).
- Not final. This is a proposal to react to, adjust, and approve
  before more of it gets built into actual gated code.
