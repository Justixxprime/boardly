BOARDLY — CONTINUATION PROMPT (updated through schema_v56)

Paste this whole thing as your first message in a new conversation, and attach the latest full zip of the Boardly project as an upload alongside it.

═══════════════════════════════════════════════════════════
0. WHO YOU ARE TALKING TO / HOW TO TALK
═══════════════════════════════════════════════════════════

The person you're helping is Charles (GitHub: Justixxprime), based in Lagos, Nigeria. Not a deeply technical engineer by trade — explain everything in ultra-simple, detailed, baby-steps teaching style: plain words, no unexplained jargon, one idea at a time, exact click-by-click steps for anything outside the code itself (Supabase dashboard, provider dashboards, etc).

The vision: Boardly is meant to become something people in Nigeria use every single day to run their actual work and life — not "a Trello clone." Daily usefulness (Good Morning view, offline support, reminders) matters more than any single impressive feature. See docs/PRODUCT_VISION.md for the full writeup. Don't hype outcomes ("this will make you rich") — stay honest and practical about what's actually in Claude's control (a genuinely good, honestly-built product) versus what isn't (whether it takes off).

Standing rules, follow without being asked again:
1. Always deliver complete, full files for download — never diffs or partial snippets. When multiple files change in one turn, bundle them into a single zip of the WHOLE project (not just the changed files) — Charles has explicitly asked for this.
2. Explain all code and technical work in ultra-simple, baby-steps language, assuming no advanced CLI/technical background.
3. ARCHITECTURE PIVOT (read this even if you remember the old rule): Boardly used to be "everything free, single server-side API key, never a paid tier." That was explicitly REVERSED — Boardly now has real Free/Pro/Pro+ tiers with a centralized entitlement system (js/entitlements.js, schema_v49). There is still NO real payment processor wired up for subscriptions (Paystack exists only for Marketplace escrow) — moving someone onto Pro/Pro+ is a manual step through admin.html or the Supabase Table Editor. NEVER build a fake "Upgrade" button that doesn't actually charge anyone.
4. He often describes his real-world workflow in detail and wants a well-built feature inferred from it. Read workflow descriptions as feature specs even when not phrased as one.
5. When picking between technical options, briefly justify why one is "the best" rather than silently picking.
6. He communicates in short messages, often just "Continue" or "Continue building" — pick the next reasonable, well-scoped, buildable item yourself and actually build it (real code, verified), not just plan.
7. No em dashes or en dashes (— or –) anywhere in the site's HTML or in any JS/TS string that produces visible UI text, or in comments either at this point — grep for them on every file touched, every turn.
8. He sometimes sends phone/desktop screenshots showing a real bug. Always investigate deeply for the actual root cause rather than guessing — this session alone found: a missing Supabase JS CDN `<script>` tag on a whole new page (admin.html) causing a silent "supabaseClient is not defined" hang with zero network requests ever firing; a realtime channel's `.on()` handlers being registered in a separate function call AFTER `.subscribe()` had already run (Supabase's client doesn't honor handlers attached that late); a "click outside to close" dropdown relying on `stopPropagation()` timing that turned out fragile; a `min-height`-only CSS chain that collapsed a full-screen video iframe to a tiny box; and THREE separate instances of the same bug (back-to-top button, toast notifications, main content padding) all gated behind a `max-width:639px` media query that didn't match when `body.has-bottom-tabs` actually gets applied — fixed by removing the width-gating entirely rather than trying to find the "correct" breakpoint.
9. Claude now has a Supabase MCP connector available in some sessions (check your tool list) — when present, you can query the live database directly (execute_sql), check real Edge Function logs (query_logs), read/deploy Edge Functions directly, and verify migrations were actually run, instead of guessing blind. Still write every schema change as a normal `.sql` file in the repo for Charles's own records even if you also apply it live — his repo should always match what's actually deployed.

═══════════════════════════════════════════════════════════
1. WHAT BOARDLY IS
═══════════════════════════════════════════════════════════

Boardly is a REAL, already-deployed, working personal/professional/team kanban task manager PWA, NOT a project being built from scratch.

- Repo: https://github.com/Justixxprime/boardly.git
- Live site: https://justixxprime.github.io/boardly/
- Backend: Supabase (Postgres + Auth + Storage + Realtime + Edge Functions)
- Frontend: plain HTML/CSS/JS, Tailwind CDN config per-page, NO build step, NO framework, NO bundler — every <script> is a plain global-scope file loaded directly by the browser. Files sharing global scope means name collisions are a real risk — always grep for a name before introducing it.
- `state` (the shared global object) is declared in js/dashboard.js — any feature file that sets `state.xReady = false` at its own top level MUST load AFTER dashboard.js in the page's script tags, or it throws immediately. Feature files typically also wrap existing functions (openEditModal, switchBoard) rather than editing dashboard.js directly — but see rule 2h below for when that's not actually achievable.
- Design system: Fraunces (display font), General Sans (body font), IBM Plex Mono (code/data font)
- Dark mode: solid, two full token sets

═══════════════════════════════════════════════════════════
2. CRITICAL WORKING METHOD — READ THIS TWICE
═══════════════════════════════════════════════════════════

2a. BEFORE assuming anything is missing, unversioned, or safe to name/number: run fresh, real commands against the actual uploaded zip.
    ls supabase/*.sql | sort -V          (find the REAL latest schema version number — currently v56)
    ls supabase/functions/               (find every real edge function)
    ls docs/setup-guides/                (find what's already documented as built — currently 75+ guides)
    grep -rn "<name you're about to use>" js/*.js *.html
This is not optional — this project has a real history of near-miss naming collisions caught only by checking first.

2b. Work in small, real, verified increments — never a giant rewrite. Pick ONE feature (or a tightly related small cluster), build it completely, verify it, package it, explain it simply, move to the next one.

2c. Full verification checklist, every single file touched, every turn:
    - `node --check <file>.js` on every JS file touched
    - For Edge Functions (Deno/TS): a manual paren/brace balance check: `python3 -c "s=open('f.ts').read(); print(s.count('(')-s.count(')'), s.count('{')-s.count('}'))"`
    - `grep -o 'id="[^"]*"' file.html | sort | uniq -d` — must be empty (no duplicate IDs)
    - Check for nested `<form>` or `<button>` tags (invalid HTML, breaks click handling)
    - `grep -rl '—\|–'` across anything touched — must be empty
    - grep for the exact name of every new global JS function/variable across all of js/*.js — must only appear in the one new file (plus legitimate call sites)
    - Confirm `state.xReady` gating pattern is used for any feature needing a not-yet-run migration
    - For any migration that ADDS a check to an EXISTING working Edge Function (like a plan-gate or a permission check): make sure it fails OPEN (doesn't enforce) when the relevant table/column doesn't exist yet, not closed — otherwise deploying code before running SQL breaks something that currently works for everyone, instantly. This bug class has been caught and fixed at least twice this project's history.

2d. Every new feature needing a schema change gets its own `supabase/schema_vNN_description.sql` file (never edit an old one in place) and its own `docs/setup-guides/FEATURE_NAME_SETUP.md` written in the same baby-steps voice as the existing guides.

2e. `--no-verify-jwt` on an Edge Function deploy is needed ONLY when the function must be callable by someone with NO Boardly login at all (a public roadmap visitor, a guest joining a video call, a stranger submitting a request-portal form). Anything only ever called by an already-signed-in user should NOT have it.

2f. Security pattern for "public but scoped" data (Client Portal, Public Roadmap, Request Portal, Video Workroom guest join): the public HTML page never talks to Supabase directly with the anon key for anyone else's data. It always goes through a dedicated Edge Function using the service role key, which validates a random, single-purpose token itself. Every public link type uses ITS OWN SEPARATE token/column, never reused across features.

2g. Every user-scoped table gets Row Level Security. Audit-style tables (security_events, activity_events, approval_history) get NO update/delete policy at all, on purpose. Board-scoped tables should grant access to BOTH the owner (`user_owns_board(board_id)`) AND accepted editor/viewer members (`user_is_board_member(board_id, [true for editor-only])`) — schema_v50 exists specifically because several tables added between v18 and v48 were found to only check ownership, silently locking out invited collaborators from milestones and automation rules. Audit any NEW board-scoped table against this same pattern before shipping it.

2h. Some features genuinely can't be built as a clean external wrapper (e.g. anything that needs to inject a value into the MIDDLE of an existing function's payload object, like Auto-Publish-Checklist or Task Estimates reading from inside saveEditedTask). When that's genuinely the case, it's fine to directly edit dashboard.js — just say so and keep the edit as small and clearly-commented as possible.

2i. The plan/capability system (js/entitlements.js): the single source of truth for what Free/Pro/Pro+ each unlock is the `PLAN_CAPABILITIES` object in that one file. A feature gates itself with `can("capability_key")`, never a direct `state.userPlan` check. The REAL enforcement for anything security-relevant must live server-side (an Edge Function checking `user_plan`, not just the browser) — the client-side `can()` check is only ever a fast, friendly early exit. Currently gated: board collaboration (inviting anyone onto a board) requires Pro. See docs/PRODUCT_VISION.md for the full proposed tier mapping across all ~75 features — most of it is NOT implemented yet, deliberately (gating everything at once wasn't safe to ship blind).

═══════════════════════════════════════════════════════════
3. WHAT'S ALREADY BUILT (verify with `ls supabase/*.sql | sort -V` — don't trust this list blindly)
═══════════════════════════════════════════════════════════

Everything through schema_v48 from the previous continuation prompt (reminders, Timely+, dev features, multi-vertical work types, real collaboration, Client Portal, Memory Vault, Marketplace+payments, Video Workrooms, Security Center, Notification Center, Idea Vault, Task Templates, Timesheets, Milestones, Playbooks, Public Roadmap+Voting, Public Request Portal, Task Assignment, Boardly Autopilot, Activity Log) — all still there and working.

Since then (this session), roughly in order:

- Activity Log EXPANDED from 4 event types to ~12 (moves, deletes, edits, milestones, automation runs, client comments/decisions) — no schema change needed, event_type was always a free-text column.
- "Do It For Me" — a Plan-mode AI request proposes a batch of new tickets, shown for review (checkboxes, edit before creating) rather than applied immediately like every other AI action.
- Boardly Intelligence Graph v1 — the AI assistant's task payload now includes blocked_by/blocks/milestone/assignee/client_status fields when relevant, and its system prompt is told to reason from them instead of guessing on "why is X delayed" style questions.
- Public Request Portal finished — board name now shown on the public form (get-request-portal-info function), an Unpublish option, and a Notification Center entry when a request comes in.
- THE BIG PIVOT: Free/Pro/Pro+ capability system (schema_v49, js/entitlements.js) — see rule 3 and 2i above. admin.html + admin-list-users/admin-set-plan functions let an allowlisted admin (ADMIN_EMAILS secret) manage everyone's plan.
- Phase 1 security/reliability audit: RLS gaps fixed for automation_rules/automation_runs/milestones (schema_v50); two "undo" code paths that silently didn't check for save errors, fixed; the realtime-subscription-ordering bug (see rule 8); Share Link Settings modal's missing scroll container (Save button was getting physically clipped off once enough rows existed).
- Auto-Complete Checklist on Published (schema_v51) — opt-in board setting.
- Copy-image-from-attachment, and the AI can now attach a pasted-in image to a ticket it creates/updates, not just describe it.
- Video Workroom fixed to be a true `position:fixed` full-viewport call screen, not relying on a min-height flex chain that was collapsing it to a tiny box.
- PHASE 2 (core work engine) — Task Links (schema_v52: blocks/relates_to/duplicates/precedes/parent_of, alongside the older single blocked_by_id, both read by the AI); Critical Path (js/critical-path.js — longest dependency chain by ticket-count since Boardly has no per-task duration data, honestly framed as such); Project Baseline (schema_v53 — snapshot-and-compare, JSONB blob per baseline).
- PHASE 3 (time + people) — Task Estimates (schema_v54, paired with the existing Actual-time tracker inside Dev Fields); Team Workload (schema_v55 + set-my-capacity function — each person sets their OWN weekly capacity via an Edge Function since board_members' RLS deliberately blocks self-editing any other column, like role); internal Approval Workflow (schema_v56 — separate from the Client Portal's external client-facing approval).
- PHASE 4 (files + communication) started — File Versioning (no schema change, extends the existing attachments JSONB column with an optional `versions` array; replace a file without losing the old one, restore is a two-way swap not a delete).
- Three real UI bugs fixed: invite-member popup closing when you tried to type in it (rewrote to check event.target directly instead of relying on stopPropagation timing); back-to-top button AND toast notifications AND main content padding all covering/covered-by the bottom tab bar (same root cause, same fix, in three places).

Edge Functions (verify with `ls supabase/functions/`): admin-list-users, admin-set-plan, auto-advance, board-assistant, client-portal-action, daily-digest, delete-account, generate-embedding, get-public-roadmap, get-request-portal-info, get-shared-board, google-oauth-callback, invite-member, marketplace-booking-status, marketplace-create-booking, marketplace-payment-webhook, marketplace-release-payment, marketplace-setup-payout, notify-assignment, notify-mention, roadmap-vote, send-critical-sms, send-push, send-reminders, set-my-capacity, slack-slash-command, submit-request, sync-task-to-google-calendar, video-workroom, zapier-create-task.

Board Health, Silent Sentinel, Reality Mode, and Boardly Autopilot are unchanged from the previous prompt and still working as described there.

═══════════════════════════════════════════════════════════
4. WHERE TO PICK UP
═══════════════════════════════════════════════════════════

Per the master build spec's own phase order: Phases 1-3 are done. Phase 4 (Files + Communication) is IN PROGRESS — File Versioning is done; still missing per the spec: Proofing (place a comment pin at an exact x/y coordinate on an image — genuinely bigger scope, needs a canvas/overlay UI) and a separate FILE-level approval status (Approved/Needs changes/Rejected on an individual attachment, distinct from the ticket-level approval workflow already built in Phase 3 — could likely reuse the approval_history table's shape).

After Phase 4: Phase 5 is Forms + Automation (Boardly already has a request-portal "form" and Autopilot; check what's genuinely still missing before building — likely a general-purpose custom form builder, which doesn't exist yet). Phase 6 is Client/Business (Client Portal, Marketplace already substantially exist — audit before assuming a gap).

Also still open from the Free/Pro/Pro+ pivot: docs/PRODUCT_VISION.md has a full proposed tier mapping that's NOT implemented yet beyond collaboration itself — Charles may want to keep wiring these in feature-by-feature, or may want to prioritize differently. Ask him rather than assuming.

═══════════════════════════════════════════════════════════
5. BEFORE YOU START: ASK CHARLES THIS
═══════════════════════════════════════════════════════════

A large batch of migrations and Edge Function deploys accumulated across the session that produced this prompt (v49 through v56, plus several Edge Function updates). Ask Charles directly which of these he's actually run/deployed so far — don't assume. Offer to produce one consolidated, correctly-ordered checklist of every outstanding SQL file and `supabase functions deploy` command if he hasn't gotten through them yet.
