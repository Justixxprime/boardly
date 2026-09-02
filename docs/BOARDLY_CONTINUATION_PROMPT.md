BOARDLY — CONTINUATION PROMPT (updated through schema_v48)

Paste this whole thing as your first message in a new conversation, and attach the latest full zip of the Boardly project as an upload alongside it.

═══════════════════════════════════════════════════════════
0. WHO YOU ARE TALKING TO / HOW TO TALK
═══════════════════════════════════════════════════════════

The person you're helping is Charles (GitHub: Justixxprime), a frontend developer and social media manager based in Lagos, Nigeria, with a biochemistry/medical lab background. Not a deeply technical engineer by trade — explain everything in ultra-simple, detailed, baby-steps teaching style: plain words, no unexplained jargon, one idea at a time, exact click-by-click steps for anything outside the code itself (Supabase dashboard, provider dashboards, etc).

Standing rules, follow without being asked again:
1. Always deliver complete, full files for download — never diffs or partial snippets.
2. Explain all code and technical work in ultra-simple, baby-steps language, assuming no advanced CLI/technical background.
3. Everything added should be FREE where at all possible. Charles explicitly rejected Puter.js because it requires end users to have their own third-party paid account — Boardly's architecture is "Charles holds one API key server-side," never "each user pays a third party." Keep that architecture for anything new.
4. He often describes his real-world workflow in detail and wants a well-built feature inferred from it. Read workflow descriptions as feature specs even when not phrased as one.
5. When picking between technical options, briefly justify why one is "the best" rather than silently picking.
6. He communicates in short messages, often just "Continue" or "Continue building" — pick the next reasonable, well-scoped, buildable item yourself and actually build it (real code, verified), not just plan.
7. No em dashes or en dashes (— or –) anywhere in the site's HTML or in any JS string that produces visible UI text. Plain hyphens in code/CSS/IDs are fine. This was a deliberate, explicit, one-time full sweep already completed — keep it that way in anything new.
8. He sometimes sends phone/desktop screenshots showing a real bug, or HAR files, or Supabase Edge Function logs. Always investigate deeply for the actual root cause rather than guessing. This project's history includes several real bugs only found this way: a missing `--no-verify-jwt` deploy flag that silently broke Client Portal AND (separately) Video Workroom's auth; an edge function throwing an uncaught exception because a sub-call wasn't wrapped in try/catch; an AI error message rendered in the same bubble style as a real answer, making a provider error look like the AI actually said something nonsensical.

═══════════════════════════════════════════════════════════
1. WHAT BOARDLY IS
═══════════════════════════════════════════════════════════

Boardly is a REAL, already-deployed, working personal/professional kanban task manager PWA, NOT a project being built from scratch.

- Repo: https://github.com/Justixxprime/boardly.git
- Live site: https://justixxprime.github.io/boardly/
- Backend: Supabase (Postgres + Auth + Storage + Realtime + Edge Functions)
- Frontend: plain HTML/CSS/JS, Tailwind CDN config per-page, NO build step, NO framework, NO bundler — every <script> is a plain global-scope file loaded directly by the browser. Files sharing global scope means name collisions are a real risk — always grep for a name before introducing it.
- Design system: Fraunces (display font), General Sans (body font), IBM Plex Mono (code/data font)
- Dark mode: solid, two full token sets

═══════════════════════════════════════════════════════════
2. CRITICAL WORKING METHOD — READ THIS TWICE
═══════════════════════════════════════════════════════════

2a. BEFORE assuming anything is missing, unversioned, or safe to name/number: run fresh, real commands against the actual uploaded zip.
    ls supabase/*.sql | sort -V          (find the REAL latest schema version number)
    ls supabase/functions/               (find every real edge function)
    ls docs/setup-guides/                (find what's already documented as built)
    grep -rn "<name you're about to use>" js/*.html *.html
This is not optional. In the session that produced this prompt, a new migration was written and numbered "v47" without checking first — an unrelated "v47_automation.sql" (Boardly Autopilot) already existed, created earlier in the same overall project. The collision was caught before shipping and the new file renumbered to v48, but only because of a manual double-check. Do this check FIRST, every time, before writing a filename or a new global function/variable name.

2b. Work in small, real, verified increments — never a giant rewrite. Pick ONE feature (or a tightly related small cluster), build it completely, verify it, package it, explain it simply, move to the next one.

2c. Full verification checklist, every single file touched, every turn:
    - `node --check <file>.js` on every JS file touched (works fine for plain scripts even without a build step)
    - For Edge Functions (Deno/TS): a manual paren/brace balance check, since Deno types aren't available to type-check locally: `python3 -c "s=open('f.ts').read(); print(s.count('(')-s.count(')'), s.count('{')-s.count('}'))"`
    - `grep -o 'id="[^"]*"' file.html | sort | uniq -d` — must be empty (no duplicate IDs)
    - Check for nested `<form>` or `<button>` tags (invalid HTML, breaks click handling) — this project has had a real bug from a `<button>` accidentally nested inside another `<button>`, caught and fixed the same session.
    - `grep -rl '—\|–'` across anything touched — must be empty
    - grep for the exact name of every new global JS function/variable across all of js/*.js — must only appear in the one new file (plus legitimate call sites)
    - Confirm `state.xReady` gating pattern is used for any feature needing a not-yet-run migration (see any recent *.js file for the pattern: `checkXReady()` tries a light `.select().limit(1)`, sets `state.xReady`, UI shows a "run this migration" note instead of erroring if false)

2d. Every new feature needing a schema change gets its own `supabase/schema_vNN_description.sql` file (never edit an old one in place) and its own `docs/setup-guides/FEATURE_NAME_SETUP.md` written in the same baby-steps voice as the existing guides, with exact step-by-step instructions (SQL Editor steps, `supabase functions deploy` commands including whether `--no-verify-jwt` is needed and why, git push, and a numbered "test it" section).

2e. `--no-verify-jwt` on an Edge Function deploy is needed ONLY when the function must be callable by someone with NO Boardly login at all (a public roadmap visitor, a guest joining a video call, a stranger submitting a request-portal form). Anything only ever called by an already-signed-in user (assigning a task, publishing a roadmap) should NOT have it — Supabase's own JWT check is the right gate there.

2f. Security pattern for "public but scoped" data (Client Portal, Public Roadmap, Request Portal, Video Workroom guest join): the public HTML page never talks to Supabase directly with the anon key for anyone else's data — there's no RLS policy allowing that, on purpose. It always goes through a dedicated Edge Function using the service role key, which validates a random, single-purpose token itself before returning or changing anything. CRITICAL: every one of these public link types (board share link, Client Portal link, Public Roadmap link, Request Portal link) uses ITS OWN SEPARATE random token/column, never reused across features — a roadmap link is meant to be handed out far more widely than a Client Portal link, so they must never be able to unlock each other.

2g. Every user-scoped table gets Row Level Security: select/insert/update/delete policies keyed to `user_id = auth.uid()` (or board ownership/membership for collaborative tables). Audit-style tables (security_events, activity_events) get NO update/delete policy at all, on purpose — a log that can be quietly edited after the fact isn't a real log.

═══════════════════════════════════════════════════════════
3. WHAT'S ALREADY BUILT (verify with `ls supabase/*.sql | sort -V` — don't trust this list blindly, it can go stale)
═══════════════════════════════════════════════════════════

Migrations run from schema.sql / schema_v2 through schema_v48, covering (in rough order): reminders, Timely/Timely+, visual polish, reminder repeats, social platform tags, Pro features, multi-attachments, dev features (priority/environment/time-tracking/git links/dependencies), multi-vertical work types + per-vertical fields, notification channel preference, per-board AI brief, real multi-user collaboration (with an RLS-recursion fix), custom board templates, task updated_at tracking, share-link hardening (expiry + password), Google Calendar sync, Slack + Zapier, Waiting Room, Commitment Guardian, Decision Ledger, Friction Detector, Client Portal v1, per-task type override, Memory Vault semantic search (Gemini embeddings), Marketplace v1, Quick Resume (session log), Classroom v2 (real rosters/gradebook), Marketplace payments+booking+escrow (Paystack), Daily Video Workrooms, Security Center (audit log + sign-out-everywhere), Notification Center (in-app bell), Idea Vault, Task Templates, Timesheets (real time-entry ledger under the existing timer), Milestones (progress computed live from linked tickets, never manual), Quiet Hours, Playbooks (SOPs), Memory Vault extended to cover Ideas + Playbooks, Public Roadmap + Voting (own separate public token), Public Request Portal (own separate public token), Task Assignment/Delegation (+ workload-by-person added to Board Health), Boardly Autopilot (WHEN status changes leads to THEN move/assign/notify, with loop prevention and run history), and an Activity/Event Log (foundation piece, logs ticket created/completed/reopened/assigned so far).

Edge Functions (verify with `ls supabase/functions/`): board-assistant, client-portal-action, daily-digest, delete-account, generate-embedding, get-public-roadmap, get-shared-board, google-oauth-callback, invite-member, marketplace-booking-status, marketplace-create-booking, marketplace-payment-webhook, marketplace-release-payment, marketplace-setup-payout, notify-assignment, notify-mention, roadmap-vote, send-critical-sms, send-push, send-reminders, slack-slash-command, submit-request, sync-task-to-google-calendar, video-workroom, zapier-create-task, auto-advance. (auto-advance, notify-mention, and send-push exist but weren't touched in the session that wrote this prompt — check their setup docs / code directly before assuming what they do.)

The AI assistant (board-assistant Edge Function) already supports natural-language board commands (move/delete/create by status, natural language task creation), has a Groq-primary + two-model OpenRouter free-tier fallback chain, sends only active (non-done) tasks capped at 200 to control token size, and shows real provider errors in a visually distinct red-bordered bubble rather than pretending they're AI answers.

Board Health (js/project-health.js) is the deterministic risk engine: overdue, blocked (via existing blocked_by_id dependency), stale (in-progress, no status change in 7 days), forgotten (still in To Do, created 7+ days ago, unassigned), client-waiting (shared with client, no response in 7 days), due-soon, no-due-date. It has a live SVG ring gauge, click-to-open-the-actual-ticket evidence chips, a Reality Mode score (naive completion percent vs a risk-adjusted "actual" percent), a Silent Sentinel ambient badge on the board name itself (quiet until something needs a look, click opens Board Health directly), and a workload-by-person breakdown once tasks have assignees.

═══════════════════════════════════════════════════════════
4. THE "SEVEN FEATURES" — Charles clarified these with a detailed doc mid-session. Status:
═══════════════════════════════════════════════════════════

Charles's own doc's recommended build order: data relationships (already solid) leads to Activity/Event log (done, see above, deliberately kept small, only 4 event types logged so far) leads to Intelligence Graph (relationship reasoning ON TOP of the existing relational schema, not a separate graph database) leads to Silent Sentinel (done) leads to Reality Mode (done) leads to Autopilot (done) leads to One-Tap templates leads to Do It For Me leads to Opportunity Radar leads to connecting everything.

DONE:
- Silent Sentinel — ambient badge + 2 new detection signals on top of existing Board Health, not a duplicate system.
- Reality Mode — inside Board Health, naive percent vs risk-adjusted percent.
- Boardly Autopilot — WHEN/IF/THEN rules, v1 scope: trigger = ticket moved to a status, condition = category (optional), actions = move again / assign / notify. Loop-capped at 3 chained hops.

ALREADY EXISTED, DOESN'T NEED BUILDING:
- One-Tap Business — substantially covered by existing Board Templates ("New board from template," js/board-templates-custom.js). Worth a closer look at whether Charles wants MORE template types (New Client, New Campaign, New Invoice-style one-tap flows per his doc's examples) as a follow-up, but the core mechanism already exists — don't rebuild it from scratch.

NOT YET BUILT — pick up here:
- Opportunity Radar — needs real historical data to find patterns (repeated client requests, high-performing content types, etc.). The Activity Log is the raw material for this per Charles's own doc, but it's brand new and has almost no history yet. Reasonable approach: extend Activity Log's event types first (more coverage means more signal), then build pattern-detection rules on top once there's enough data to be meaningful. Don't build a hollow version that has nothing real to say yet.
- Do It For Me — significant overlap with the EXISTING board-assistant AI assistant (natural language commands, structured action proposals, confirmation before bulk actions already exist there). Before building anything new here: read js/dashboard.js's AI action-handling code and supabase/functions/board-assistant/index.ts closely first. This is very likely an EXTENSION of the existing assistant (e.g., a "generate a whole task list from one request, review before creating" mode) rather than a new separate system — building a second AI chat surface would be exactly the "duplicate functionality" Charles's master spec warns against.
- Boardly Intelligence Graph — the most technically ambitious one. Per Charles's own doc: don't build a literal graph database. The existing relational schema (task_dependencies via blocked_by_id, board_members, milestones to tasks, client_comments to tasks, activity_events to tasks) already IS the graph's data. What's missing is a reasoning/traversal LAYER on top, e.g. answering "why is X delayed?" by actually walking blocked_by_id chains and dependency relationships, not guessing. This is naturally an extension of the AI assistant once Do It For Me is scoped, not a separate build.

═══════════════════════════════════════════════════════════
5. BEFORE YOU START: ASK CHARLES THIS
═══════════════════════════════════════════════════════════

A large batch of migrations and Edge Function deploys accumulated across the session that produced this prompt. Do NOT assume any specific one has been run/deployed on the live Supabase project — ask Charles directly which of the setup guides in docs/setup-guides/ he's actually completed so far, especially anything from MILESTONES_SETUP.md onward through ACTIVITY_LOG_SETUP.md. Offer to produce one consolidated, correctly-ordered checklist of every outstanding SQL file and `supabase functions deploy` command if he hasn't gotten through them yet.
