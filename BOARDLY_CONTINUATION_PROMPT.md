BOARDLY — CONTINUATION PROMPT
Paste this whole thing as your first message in a new conversation, and attach the latest full zip of the project (boardly-full-updated-v23.zip or newer) as an upload.

═══════════════════════════════════════════════════════════
0. WHO YOU ARE TALKING TO / HOW TO TALK
═══════════════════════════════════════════════════════════

The person you're helping is Charles (username Justixxprime), a frontend developer and social media manager based in Lagos, Nigeria, with a biochemistry background. He is not a deeply technical engineer by trade — he understands concepts but wants everything explained in ultra simple, detailed, baby-steps teaching style: plain words, no unexplained jargon, one idea at a time, exact click-by-click steps for anything outside the code itself (Supabase dashboard, Google AI Studio, etc).

Standing rules, follow without being asked again:
1. Always deliver complete, full files for download — never diffs or partial snippets.
2. Explain all code and technical work in ultra-simple, detailed, baby-steps language, assuming no advanced CLI/technical background.
3. Everything Charles is asked to add should be FREE where at all possible. He explicitly rejected Puter.js because it requires end users to have their own third-party paid account — Boardly's whole architecture is "Charles holds one API key server-side," never "each user pays a third party." Keep that architecture for anything new.
4. He often describes his actual real-world workflow in detail and wants Claude to infer a well-built feature from it (e.g. his "keep snoozing the same coding ticket" habit became Quick Resume). Read his workflow descriptions carefully — they are feature specs, even when not phrased as one.
5. When picking between technical options, briefly justify why one is "the best" rather than silently picking — he's asked for this explicitly.

He communicates in short messages, often just "Continue" or "Continue building" — he trusts you to keep working down the list yourself. Pick the next reasonable, well-scoped, buildable item and build it. Don't just plan — actually write and verify real code every turn. He also sometimes sends phone screenshots showing a real bug — always investigate deeply and find the ACTUAL root cause (in this project's history, screenshot bug reports have twice revealed genuine, previously-unnoticed bugs: a missing `--no-verify-jwt` deploy flag that broke the entire Client Portal, and a missing modal-hide call that caused two modals to render stacked on top of each other). Take his bug reports seriously and dig.

═══════════════════════════════════════════════════════════
1. WHAT BOARDLY IS
═══════════════════════════════════════════════════════════

Boardly is a REAL, already-deployed, working personal/professional kanban task manager PWA (Progressive Web App), NOT a project being built from scratch.

- Repo: https://github.com/Justixxprime/boardly.git
- Live site: https://justixxprime.github.io/boardly/
- Backend: Supabase (Postgres + Auth + Storage + Realtime + Edge Functions)
- Frontend: plain HTML/CSS/JS, Tailwind CDN config per-page, NO build step, NO framework, NO bundler — every <script> is a plain global-scope file loaded directly by the browser
- Design system: Fraunces (display font), General Sans (body font), IBM Plex Mono (code/data font)
- Dark mode: solid, two full token sets

Charles has a long-running "master plan" document listing dozens of aspirational upgrades. By this point in the project, the overwhelming majority of concretely-scoped items from that plan have been built (see Section 3). What's left is either genuinely large product surfaces needing external provider decisions (payments, video), or vague named ideas with no real definition yet (see Section 4). Treat "Continue" / "continue master plan" as "keep working down what's left, pick the next sensible item yourself" — but do NOT guess wildly at vague, undefined feature names. If something is ambiguous or needs a provider decision, say so plainly and either build the honest buildable core (see how Memory Vault and Marketplace were scoped) or ask.

═══════════════════════════════════════════════════════════
2. CRITICAL WORKING METHOD — READ THIS TWICE
═══════════════════════════════════════════════════════════

2a. Audit before assuming anything is missing. Grep/view the actual current codebase first. Do not duplicate existing systems. This project has bitten a previous Claude instance twice by having a feature exist under a different name than expected (a `post-preview-modal` for the edit form's live preview already existed before the Content Calendar's own preview modal was built — the second one had to be renamed to `cc-preview-modal` to avoid colliding).

2b. Work in small, real, verified increments — never a giant rewrite. Pick ONE feature (or a tightly related small cluster), build it completely, verify it, package it, explain it simply, move to the next one.

2c. THE VERIFICATION CHECKLIST — RUN THIS EVERY SINGLE TIME, NO EXCEPTIONS. This has caught real, ship-blocking bugs dozens of times across this project — trust it, don't skip it.

1. Syntax-check every JS file you touched:
   for f in js/*.js; do node --check "$f" || echo "FAIL: $f"; done

2. Structural balance check on any edge function (.ts) you touched:
   python3 -c "
   content = open('supabase/functions/NAME/index.ts').read()
   print('braces:', content.count('{') - content.count('}'))
   print('parens:', content.count('(') - content.count(')'))
   "

3. THE NESTED-FORM CHECK on every .html file touched:
   python3 -c "
   import re
   content = open('dashboard.html').read()
   content = re.sub(r'<!--.*?-->', '', content, flags=re.S)
   depth = 0
   for i, line in enumerate(content.split(chr(10)), 1):
       opens = len(re.findall(r'<form\b', line)); closes = len(re.findall(r'</form>', line))
       for _ in range(opens):
           if depth > 0: print(f'NESTED FORM at line {i}')
           depth += 1
       for _ in range(closes): depth -= 1
   print('form nesting depth (should be 0):', depth)
   "
   Run on every .html file touched (dashboard.html, share.html, client-portal.html, marketplace.html).

4. Duplicate ID check on any HTML file touched:
   grep -oE 'id="[a-zA-Z0-9_-]+"' dashboard.html | sort | uniq -c | sort -rn | awk '$1>1'

5. THE FULL CROSS-SESSION COLLISION SWEEP — this project now has ~18 separate add-on JS modules all sharing the global scope on dashboard.html. Before shipping ANYTHING, run:
   for f in js/done-archive.js js/people.js js/task-dna.js js/client-portal-owner.js js/control-tower.js js/classroom.js js/dispatch.js js/care-rounds.js js/content-calendar.js js/client-work.js js/views-menu.js js/dev-board.js js/routines.js js/memory-vault.js js/resume-queue.js js/marketplace.js; do
     grep -oE '^(const|function|async function|let) [A-Za-z_][A-Za-z0-9_]*' "$f" | awk -v f="$f" '{print $NF, f}'
   done > /tmp/all_names.txt
   while read -r name file; do
     count=$(grep -c "^\(const\|async function\|function\|let\) $name\b" js/*.js | awk -F: '{sum+=$2} END{print sum}')
     if [ "$count" != "1" ]; then echo "COLLISION: $name (from $file): $count declarations"; fi
   done < /tmp/all_names.txt
   Add any new file you create to this list going forward. This exact check has caught real collisions (e.g. a duplicate `isOverdue`, a duplicate `post-preview-modal` id/function) before they shipped.

6. Confirm every element ID you reference in JS actually exists in the HTML, exactly once.

If any check fails, FIX IT before presenting anything. When you catch a mistake this way, tell Charles plainly what you caught and fixed — he responds well to that honesty.

2d. The z-index systemic bug — still applies. EVERY new full-screen modal must be added to the shared CSS rule in css/style.css (search for `z-index:70` — it's one long comma-separated selector list covering every modal in the project). Forgetting this makes a new modal's bottom content hide behind the mobile bottom tab bar. This has been forgotten and caught multiple times — check it every time.

2e. Script loading order matters. dashboard.js loads sync first, then dashboard-extras.js/dashboard-behaviors.js/dashboard-onboarding.js sync, then every add-on module — most load sync in a long block at the bottom of dashboard.html, a few (timely.js, routines.js, resume-queue.js and anything needing Timely) load with `defer`. When a new module depends on another's globals, place its <script> tag after that module's.

2f. The "wrap the existing function" pattern — used constantly in this project for hooking into shared behavior without editing dashboard.js's core functions:
   const _originalXForY = window.someSharedFunction;
   if (typeof _originalXForY === "function") {
     window.someSharedFunction = function (...args) {
       const result = _originalXForY.apply(this, args);
       myExtraLogic();
       return result;
     };
   }
   Give the local variable a UNIQUE name per file. `renderBoard` and `applyTerminology` both now have MANY files wrapping them (every vertical view wraps both, to keep its toolbar button's visibility current). This chains safely as long as each wrap has a unique local variable name.

2g. Every drop-in module follows this exact shape:
   - A comment block explaining what it is, what migration (if any) it needs, and WHY any non-obvious design choice was made (this project's comments explain reasoning, not just mechanics — keep that up).
   - state.xReady flags for anything gated behind a migration, probed via a harmless select().limit(1) in the main boot sequence in dashboard.js (search for "state.taskTypeReady" or similar to find the pattern and add new probes near the existing ones).
   - load/render/add functions following the same shape as existing modules.
   - A DOMContentLoaded listener at the bottom wiring up buttons/forms/modal open-close.
   - A companion FEATURE_NAME_SETUP.md in plain baby-steps language.

2h. Vertical-gating discipline. Charles has twice now flagged features/fields showing up on boards where they don't belong (Environment/Git fields showing on non-Software boards; a task-type field once leaked across verticals before the fix). Any time you add a field, button, or section that's only meaningful for one kind of work, gate its visibility on `effectiveWorkType(task)` (defined in dashboard.js) — never assume "if the feature is enabled at all, show it everywhere." There is STILL ONE KNOWN INSTANCE of this bug not yet fixed — see Section 4.

═══════════════════════════════════════════════════════════
3. WHAT HAS ALREADY BEEN BUILT (do not rebuild any of this)
═══════════════════════════════════════════════════════════

Everything from the previous continuation prompt's "already built" list (boards, tasks, subtasks, recurring tasks, reminders/Timely, AI board assistant, gamification, PWA, realtime sync, offline queue, multi-user collaboration with RLS, comments/@mentions, Timeline/Gantt, custom templates, advanced analytics, Google Calendar/Slack/Zapier integrations, Waiting Room, Commitment Guardian, Emergency Mode, Second Brain Inbox, Decision Ledger, Workload Thermostat, Friction Detector, Good Morning view) — ALL STILL PRESENT AND WORKING. Built during THIS most recent session, all real, all verified, all with setup docs:

**Done Archive** — js/done-archive.js. Done column caps at 6 visible cards, "+N more" opens a full searchable archive grouped by date, restore/delete individually or bulk-clear by age.

**Task DNA** — js/task-dna.js. A quiet badge on any card that's been pushed back or reopened, turning orange past Friction Detector's own severity threshold. A "Task DNA" strip in the edit modal showing time-to-done/time-open plus push/reopen counts, only when non-zero.

**People (Relationship Engine v1)** — js/people.js. Aggregates Commitments + Waiting Room by person (normalized name matching), shows what you owe/are owed, a "kept on time" track record once there's enough history. schema_v27 comment explicitly calls this "Boardly's future Relationship Engine." Later extended with "Clear this person's resolved history" and "Clear all resolved" bulk actions (delete only settled items, never open ones, always confirm-with-count first).

**Client Portal** — schema_v27_client_portal.sql, get-shared-board (extended) + new client-portal-action Edge Functions, client-portal.html + js/client-portal.js (public-facing), js/client-portal-owner.js (dashboard-side: a "Show to client" checkbox per task, a feedback strip with reply, a "Copy client portal link" button). A client can view tasks marked client_visible, comment, approve, or request changes — no login needed, same password/expiry protection as the existing public share link. **CRITICAL BUG FIXED**: the original deploy instructions were missing `--no-verify-jwt` on both functions, causing every request to be silently rejected — this is now fixed in the function headers and setup docs, and the client-side JS was hardened to show a real error instead of an infinite "Loading…" spinner if anything's ever misconfigured again.

**Seven vertical dashboards**, all sharing one consistent shape (search box, grouped-by-a-relevant-person/repo/platform, stats line with a "completed/shipped/published/delivered today" count, mark-complete-with-optional-note flow), all gated on `effectiveWorkType(task)` so mixed boards work correctly, all consolidated into ONE "Views" dropdown menu (js/views-menu.js) instead of separate toolbar buttons, since a mixed board can now show several at once:
   - **Control Tower** (js/control-tower.js) — Logistics, groups by driver.
   - **Classroom** (js/classroom.js) — Teaching, groups by class, grade-and-complete flow.
   - **Dispatch** (js/dispatch.js) — Field Service, groups by technician (added after v1 shipped without one).
   - **Care Rounds** (js/care-rounds.js) — Healthcare, groups by caregiver (same technician-style addition after v1).
   - **Content Calendar** (js/content-calendar.js) — Social Media, groups by platform, reuses the existing published_url/performance_note "Pro" fields for "Mark published." Later heavily extended: real Preview (platform-styled mockup with live character-limit count) and Share (tries the real Web Share API first — hands the actual attached file to the OS share sheet on mobile — falls back to real web-intent links for X/WhatsApp/Telegram always, Facebook/LinkedIn always too now, see the recent fix below). Social Media vertical fields expanded: Campaign, Content pillar, Format, Caption (copyable textarea), Hashtags (copyable textarea).
   - **Client Work** (js/client-work.js) — Freelance, groups by client. v2: now ALSO shows any task marked client_visible regardless of vertical (not just Freelance-typed ones), with a small badge naming the real vertical, so "what am I delivering to clients" is a true cross-vertical view.
   - **Dev Board** (js/dev-board.js) — new Software/Web Dev vertical (Backlog → Building → Shipped), fields: Repository (copyable), Tech stack, Staging link (copyable). Groups by repository. Deliberately does NOT duplicate the existing generic git_branch/git_pr_url "Pro" fields (those are per-unit-of-work; Repository/Tech stack are per-project).

**Per-task type override (mixed boards)** — schema_v28_task_type_override.sql. Every task's edit modal has a "Type" dropdown (default: inherit the board's type). `effectiveWorkType(task)` in dashboard.js is the ONE function everything reads through. All 7 vertical view buttons show if EITHER the board's default matches OR at least one task is individually overridden to that type — and update live (both `applyTerminology` and `renderBoard` are wrapped by every vertical file) without needing a board switch.

**AI vertical-field awareness** — supabase/functions/board-assistant/index.ts + js/dashboard.js. The AI assistant is now told the board's work type and the full VERTICAL_FIELDS schema for every type, and can set task_type + metadata fields via natural language ("add a delivery for the Johnson order, driver is Mike"). Metadata updates MERGE into existing data, never replace wholesale (same rule as subtask updates).

**Attachments upgrade** — video/PDF/Word/RTF/ODT now accepted (was images-only), 50MB cap (was 15MB), type-aware icons + real image thumbnails in the attachment list.

**Environment/Git fields vertical-gating fix** — these now only show for tasks whose real type is Software (were showing on every task regardless of vertical before — Charles caught this himself). Priority, time tracking, and blocked-by stayed universal since those genuinely apply everywhere.

**Memory Vault** — v1: js/memory-vault.js, honest keyword (ILIKE) search across tasks/decisions/client comments/commitments/waiting items, cross-board. v2: schema_v29_memory_vault_embeddings.sql (pgvector + a `search_memory_vault` SQL function, NOT security-definer, respects RLS) + new generate-embedding Edge Function (Google Gemini's free-forever embeddings API — chosen specifically because it needs no third-party account for end users, unlike Puter.js) + a "Build search index" button (manual, not automatic-on-save, on purpose). Falls back to keyword search silently on ANY failure — the search box can never break.

**Routines** — schema_v7_reminder_repeat.sql (already existed) surfaced properly for the first time: js/routines.js gives recurring reminders (like "wake me up weekdays") their own distinctive panel — pulsing bell icon, big monospace time readout, color-coded by repeat pattern — instead of sitting in the To-do column looking like an ordinary unfinished task. Later integrated into the Good Morning view (js/morning.js) as a "Today's routines" section.

**Quick Resume + Resume Queue** — schema_v31_session_log.sql. Built directly from Charles's real workflow: coding on a ticket, snoozing a reminder to come back in a few hours, doing that repeatedly across multiple tickets for different sites/apps. Every task's edit modal now has one-tap Quick Snooze buttons (+1h/+2h/+4h/Tomorrow 9am) with an optional "where did you leave off" note that builds a timestamped session log. js/resume-queue.js is a new cross-board view of everything currently snoozed, soonest first, showing the last left-off note. **CRITICAL BUG FIXED while building this**: `reminder_email_sent_at` (which stops a one-off reminder from emailing twice) was never being cleared when a NEW reminder time was set on the same task — meaning any task re-snoozed more than once would silently stop emailing forever. Fixed in every code path that sets reminder_at (main edit form, notification-triggered snooze, Quick Snooze).

**Marketplace v1** — schema_v30_marketplace.sql (two tables, RLS-only, no Edge Function needed — a profile is either published or it isn't, a plain condition). js/marketplace.js (in-app profile editor + inquiries inbox) + marketplace.html/js/marketplace-public.js (public directory, search, profile detail, contact form). Explicitly scoped honestly: no payment, no booking, no reputation score — those need a real payment-provider decision first. This is the discoverability core underneath all of that.

**Content Calendar fixes** (most recent, from Charles's screenshots): the action-button row was overflowing outside its card (fixed: wraps properly, secondary actions are icon-only); LinkedIn/Facebook share options were being hidden without a live post URL (fixed: always shown now, just without a pre-filled preview if no URL); Preview was rendering stacked on top of the still-open Content Calendar modal, looking cut-off and jumbled (real bug — Preview never actually closed Content Calendar first; fixed, and closing Preview now correctly restores it).

═══════════════════════════════════════════════════════════
4. WHAT'S LEFT / KNOWN OPEN ITEMS
═══════════════════════════════════════════════════════════

**A real, known, NOT-YET-FIXED bug** (Charles flagged it, explicitly said "do this later"): the OLDER post-preview-modal — the live preview inside the task edit form itself (function `openPostPreview()` in dashboard.js, separate from Content Calendar's own `cc-preview-modal`/`openContentCalendarPreview()`) — has: (a) a visual layering bug with what looks like two overlapping close buttons, (b) content that can't be scrolled/no visible download option, (c) no copy button on its caption text, (d) is showing up on boards/tasks where it isn't relevant (same class of bug as the Environment/Git fields fix in Section 2h/3 — needs the same `effectiveWorkType(task) === "social_media"` style gating). This needs real investigation — view the function and its modal HTML fresh, don't assume the fix is identical to the Content Calendar one since it's a genuinely different, older piece of code.

**Genuinely large, needs real scoping/a provider decision:**
- Marketplace payment/booking/escrow — needs Charles to choose a payment provider (Stripe/Paystack/Flutterwave), a conversation of its own.
- Video Workroom — needs a real video provider (Zoom/Twilio/Daily.co), not discussed yet.
- Boardly Classroom (full version: rosters, real assignments, grading rubrics) — Classroom v1 (Section 3) is a first honest step, not the whole idea.
- Vague, undefined master-plan names never elaborated on: Silent Sentinel, Reality Mode, Boardly Autopilot, Opportunity Radar, One Tap Business, Do It For Me, Boardly Intelligence Graph. DO NOT guess wildly at these — if Charles brings one up, ask him what he actually means before building, since guessing wrong risks building something misaligned with zero real spec to go on.

**Smaller, worth checking proactively:**
- Charles mentioned wanting OpenRouter as a possible second/backup provider for the AI board assistant chat (currently Groq) — discussed, not built. If he brings it back up, it's a straightforward swap (OpenAI-compatible API, same shape Groq already uses) — free tier, rate-limited to 20 RPM, no third-party end-user accounts needed, fits the same architecture.
- Two things Charles has NOT yet confirmed doing on his own side, from much earlier in the project: Google Calendar OAuth app creation, and Slack/Zapier app setup. Don't assume done.
- SMS provider (Termii) — was told to check Sender ID approval / wallet balance / webhook URL before switching providers; deferred as "not urgent" a long time ago, likely still unresolved.

═══════════════════════════════════════════════════════════
5. HOW TO CONTINUE FROM HERE
═══════════════════════════════════════════════════════════

1. Read the uploaded zip — it is the current, real, up-to-date state of the project, every fix and feature above is already in it.
2. If Charles says "Continue" — pick the next well-scoped, self-contained item yourself. Prefer things needing no external provider decision. The known bug in Section 4 (old post-preview-modal) is a strong, well-justified next pick if nothing else is specified — it's a real, already-flagged bug, not a guess.
3. Always run the FULL verification checklist from Section 2c before presenting a zip — especially the cross-session collision sweep, which has caught real bugs in this exact codebase multiple times.
4. Always rebuild the FULL project zip:
   cd /path/to/project && zip -r /mnt/user-data/outputs/boardly-full-updated-vNEXT.zip . -x "*.DS_Store"
   (increment the version number from whatever the uploaded zip was named)
5. Explain what you built in plain, warm, ultra-simple language — say exactly what to paste into Supabase and what command to run to deploy, in that order.
6. If you catch a mistake via verification, tell Charles plainly what happened and what you fixed — this has gone over well every single time, never hide it.
7. Everything new should be free where at all possible (Section 0, rule 3) — flag clearly if something genuinely can't be (e.g. a payment provider will eventually need real fees, that's unavoidable and fine to say so).
