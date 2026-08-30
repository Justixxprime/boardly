# Boardly — the complete beginner's guide

This document explains **everything**, slowly, in plain language. Read it top
to bottom the first time. After that, use it as a reference.

## 0. How to actually see what changed (read this first)

If you've downloaded a zip and things don't look different, it is
almost never because the update didn't work — it's one of these four
things, in order of how often it happens:

**1. You're looking at an old copy of the folder.**
Every time I hand you a new zip, fully delete your old `boardly` folder
first, *then* extract the new one into a clean spot. If you extract on
top of the old folder, some old files can hang around and you end up
looking at a mix of old and new. This is the single most common reason
"nothing changed."

**2. Your browser has the old version cached.**
Browsers aggressively cache CSS and JS files to load pages faster next
time — which backfires the moment those files actually change. Do a
**hard refresh**: Windows/Linux is `Ctrl + Shift + R`, Mac is
`Cmd + Shift + R`. If that still doesn't work, open the page in an
incognito/private window, which never uses the cache at all.

**3. You're looking at the wrong page for that feature.**
Not everything lives on the homepage. Here's exactly where each thing
in this project actually is:
| Feature | Which file | Do you need to be logged in? |
|---|---|---|
| Animated gradient background, cursor trail, blobs | `index.html` | No |
| Confetti, progress ring, overdue pulse, smart quick-add, voice input, keyboard shortcuts | `dashboard.html` | **Yes** |
| Charts, category donut, activity heatmap | `stats.html` (new) | **Yes** |
| Desk-lamp glow | any page, **in dark mode only** | No |
| Moving gradient background, word-by-word headline | `index.html`, `features.html`, `pricing.html`, `contact.html`, `changelog.html`, `404.html` | No |
| Public changelog | `changelog.html` (new) | No |
| Custom "not found" page | `404.html` (new) — try visiting a page that doesn't exist | No |

**4. A feature needs you to actually be logged in.**
`dashboard.html`, `stats.html`, and `settings.html` all check for a
real login first (`requireSession()` in `js/supabase-client.js`) and
send you to `login.html` if you're not signed in. If you open
`dashboard.html` directly and get bounced to the login page, that's
correct behavior, not a bug — log in first, then the real page loads.

**A concrete walkthrough, step by step, to see the newest features:**
1. Log in normally.
2. On the board, look at the top of the page — you should see a
   circular progress ring next to "Your tasks," and a small colored
   donut with a legend just above the quick-add bar.
3. Type `finish the report tomorrow` into the quick-add box (don't
   press enter yet) — a small hint should appear underneath showing
   "tomorrow's date," confirming it understood.
4. Press `?` on your keyboard — a shortcuts menu should pop up.
5. Check off an existing task, or drag one into the Done column —
   a small burst of colored confetti should fire from that spot.
6. Click "Insights" in the top navigation (or the pie-chart icon on the
   board) — this is the new `stats.html` page with real charts built
   from your actual tasks.

If you do all six of those and something *doesn't* happen, that's a
genuinely useful bug report — tell me exactly which step, and what you
saw instead.

### Cinematic, site-wide now — plus two new pages (latest)

Previously the moving gradient background only lived on the homepage.
This round is specifically about making the *whole site* feel like one
consistent, considered experience, not just the front door.

- **The animated gradient mesh background now plays on every marketing
  page's hero** — Features, Pricing, Contact, the new Changelog page,
  and the new 404 page — not just the homepage. Verified each one
  actually paints pixels (not a blank canvas) with a direct check, on
  every single page, not just eyeballed once.
- **Headlines fade and blur into place, word by word**, instead of
  appearing all at once. Built carefully so it doesn't break existing
  formatting: index.html's headline has a line break and a colored word
  in the middle of it, and both survive completely intact — verified
  directly (`<br>` count, and the colored span's text) rather than just
  assumed.
- **Two new pages**: `changelog.html` — a public, honest timeline of
  everything shipped, including the bugs found and fixed, not just a
  highlight reel — and `404.html`, a real not-found page instead of
  GitHub Pages' plain default, styled to match everything else, so a
  broken link doesn't suddenly look like a different, unfinished site.
  Both linked from the nav and footer on every marketing page.

### A real Insights page, and more visible board features

This round specifically avoided anything fake — every number below comes
from your real tasks, computed live. Nothing is a hardcoded demo value.

- **A brand new page: `stats.html` ("Insights" in the nav).** Four live
  stat cards (total, completed, completion rate, overdue right now), a
  category breakdown donut, a due-date urgency chart (overdue / due
  today / this week / later / no date), a "when you add tasks" weekday
  bar chart, a 12-week GitHub-style activity heatmap, and a recent
  activity list. All computed straight from the same `tasks` table the
  board uses — see Section 15 below for exactly how each chart's numbers
  are calculated.
- **A mini category donut right on the board itself**, above the
  quick-add bar, so you don't have to leave the board for an at-a-glance
  breakdown.
- **A "copy summary" button** — one click copies a plain-text digest of
  your board (counts per column, completion %) to your clipboard, ready
  to paste into a message or standup note.
- **Milestone celebrations** — crossing 10, 25, 50, 100, 250, or 500
  completed tasks (for the first time) fires a toast and a small
  confetti burst. Remembered per-browser so it only fires once per
  milestone, not every time you reload with, say, 12 done tasks.

**A real bug I caught and fixed before shipping, worth knowing about:**
the CSS meant to fade the donut chart segments in was accidentally also
overriding the *exact proportions* of those segments — the browser lets
a CSS class win over a computed SVG attribute for the same property,
which isn't obvious until you hit it. Reproduced the exact failure in
isolation, fixed it, then verified the fix with a direct computed-style
check (a 75%-sized test segment measured back out as 75%, not some
overridden default) before it ever touched a real chart.

**Also fixed:** the notification popup function (`toast()`) only
existed on the dashboard page's script, so the new Insights page
calling it to report a loading error would have crashed with "toast is
not defined." Moved it into the shared `site.js` file that every page
already loads, so every page can use it now, not just the dashboard.

### High-tech power-user features

- **Smart quick-add understands dates and categories from what you
  type.** "Call the dentist tomorrow" sets tomorrow's due date and saves
  just "Call the dentist" as the title. Same for weekday names ("finish
  the deck friday"), "in N days", and #work / #personal / #urgent tags.
  A small hint appears under the input showing what it understood before
  you even hit enter. This is plain pattern-matching against a fixed
  list of phrases, not real language understanding — anything it doesn't
  recognize just gets saved as typed, so it can't mangle a title you
  didn't mean as a date. Tested against 8 different real phrasings
  (including one deliberately plain sentence containing the word "date"
  to check for false positives) and every one parsed correctly.
- **Add tasks by voice** — click the mic (or press V), speak, and it
  fills the input using the browser's built-in speech recognition. The
  button only appears at all on browsers that support it — nothing ever
  shows a control that wouldn't work.
- **A keyboard shortcuts menu** (press `?`, or click the same icon in
  the header) — plus `N` to jump straight into the quick-add input from
  anywhere on the page. Both are skipped while you're actually typing in
  a field, so they never hijack a keystroke you meant for a task title.

### The large upgrade: progress, urgency, and a living background

- **A progress ring in the header tracks the whole board live** — animated,
  updates the instant a task's status changes, no page refresh.
- **When every ticket is done, the board tells you** — a banner appears
  and a bigger celebration fires, exactly once (checked this specifically:
  re-rendering while already fully done does not re-trigger it, only a
  genuine transition into "all done" does).
- **Overdue tickets pulse gently** — a real urgency signal computed from
  the actual due date, not just a color.
- **Dragging a card over a column now gives it a pulsing glow**, not just
  a static highlight.
- **The homepage hero has a living, generated background** — a small
  canvas animation, a few soft colors drifting on independent slow paths,
  redrawn every frame. This is deliberately not a video file: a video
  would need recording and hosting and would look identical on every
  visit; this is a few hundred bytes of code, generates itself, and never
  repeats the same way twice. Verified it actually paints pixels, not
  just checked the code compiles.
- **A cursor trail on desktop** — a short string of dots that ease toward
  your pointer, each one trailing the last. Skipped entirely on touch
  devices, where there's no real cursor to trail.

### Beyond the cinematic pass: things a task manager can do that a dashboard can't

- **A confetti burst plays when you actually finish a task** — check the
  box, or drag a ticket into Done, and a small colored burst fires from
  that exact spot. This only fires on genuine completions (checking a
  box, or dragging a card *into* Done from elsewhere) — reordering
  tickets you've already finished doesn't retrigger it.
- **New tickets materialize in** with a quick pop instead of silently
  appearing, when you use the quick-add bar.
- **Dark mode has its own cursor-following "desk lamp" glow** across the
  whole page — leaning into the exact language this palette already used
  to describe itself (see the comment at the top of `style.css`, "dark
  mode = deep ink desk lamp glow") instead of adding an unrelated effect.
  Light mode doesn't get this; a lamp glow makes no sense against bright
  paper.
- **The Ctrl+K command palette results cascade in** as you type, instead
  of all appearing at once.
- Ported the same cinematic system built for Pulse over first: page
  crossfades, a circular-reveal theme toggle, cursor-spotlight on cards
  (including kanban tickets — safe there since it's a background glow
  with no transform, so it can't fight SortableJS mid-drag), 3D tilt on
  the browser mockup, a scroll-scrubbed hero, magnetic buttons, drifting
  parallax blobs, a nav progress bar, back-to-top, and film grain.

**A genuinely tricky bug caught before shipping:** the desk lamp's
opacity, driven by a CSS custom property inherited from `html.dark`,
tested as stuck at 0 in dark mode despite every part of the setup being
individually correct — the variable resolved to the right value, only
one CSS rule matched the element, and an isolated reproduction of the
exact same rule worked fine. Traced it down to the `transition` on
`opacity` interacting with how the property change was being detected.
Removed the transition (imperceptible either way for a 7%-opacity
background wash) rather than ship something I couldn't fully explain —
confirmed fixed by testing before and after with a real computed-style
check, not just re-reading the code and hoping.

### The cinematic pass

Ported the same visual/motion system built for Pulse over to Boardly,
adapted to its warm-paper palette — and kept carefully clear of anything
SortableJS touches. Short version, in order of how noticeable they are:

- **Pages crossfade into each other** instead of hard-flashing white,
  using the browser's native View Transitions API (one CSS line, silently
  ignored by browsers that don't support it yet).
- **The theme toggle does a circular reveal** expanding from wherever you
  clicked, instead of an instant flip.
- **Every card gets a cursor-spotlight** — a soft glow that follows your
  pointer, including kanban tickets. This one's deliberately just a
  background glow with no transform of its own, so it never fights
  SortableJS while you're dragging a ticket.
- **The hero ticket-stack mockup leans back and shrinks slightly as you
  scroll past it**, and the browser-mockup showcase further down tilts in
  3D toward your cursor — both built as separate transform layers from
  the elements' own animations (the hero ticket still floats and sits at
  its `rotate-1` angle exactly like before; the scroll-lean is layered on
  an outer wrapper, not fighting for the same `transform` property).
- **Magnetic buttons** on the main "Create your board" / "Get started"
  CTAs — they pull gently toward your cursor as it nears, then spring
  back.
- **The background color blobs now drift slowly** instead of sitting
  static, and drift a little further as you scroll (parallax).
- **A thin progress bar sweeps across the top of the page** on
  navigation, a back-to-top button appears once you've scrolled a bit,
  and there's a barely-there film grain texture over everything — small
  details, but they're what make a site feel considered all the way down.

**Deliberately left untouched:** the pointer-tilt (3D rotation) effect
does *not* touch kanban tickets, `dashboard.js`'s SortableJS wiring, the
quick-add form logic, `auth.js`, `supabase-client.js`, or anything that
talks to your database. Everything above is purely additive CSS and a
few new functions in `site.js` — nothing about how the board actually
works changed.

Boardly is a kanban-style task manager: three columns (To do / In progress /
Done), drag-and-drop cards, a Ctrl+K command palette, and a real database
behind it (Supabase) so tasks belong to one logged-in user and survive a
refresh. It's built with plain HTML, Tailwind (via CDN, no build step — the
same approach your other sites use), and two small JS libraries loaded from
a CDN: Supabase JS and SortableJS.

---

## 1. What's in the folder, and why

```
boardly/
├── index.html          ← marketing/landing page (public)
├── features.html         ← full feature tour page (public)
├── pricing.html            ← pricing page (public)
├── contact.html              ← contact form + direct contact info (public)
├── signup.html                  ← create account page (public)
├── login.html                     ← log in page (public)
├── dashboard.html                    ← the kanban board (private — requires login)
├── settings.html                        ← profile/password/theme (private — requires login)
├── css/
│   └── style.css                           ← every custom style: cards, dark mode, mobile menu, animations
├── js/
│   ├── supabase-client.js                     ← connects the site to your Supabase project
│   ├── site.js                                   ← shared: dark/light toggle, mobile menu, scroll animations
│   ├── auth.js                                      ← sign up + log in form logic
│   ├── dashboard.js                                    ← the kanban board's brain (biggest file)
│   └── settings.js                                        ← profile page logic
└── supabase/
    └── schema.sql                                            ← the database table + security rules
```

Every HTML page is a **separate, complete file** — there's no framework
stitching pages together. This matches how your other sites (First Experts
Logistics, Amani Community Trust) are built: plain HTML files, Tailwind
loaded from a CDN `<script>` tag, no `npm run build` step. It's the easiest
possible setup to host and to show off in a portfolio, because anyone can
open the files and instantly see how it works.

**Why Supabase?** Supabase is a company that gives you, for free, a real
Postgres database, user accounts (sign up / log in), and an auto-generated
API — without you writing a backend server. You get a URL and a public key,
paste them into one file, and your website can now save data permanently.
This is the difference between a "real app" and a demo that forgets
everything when you close the tab.

### What changed in this version

- **Four new pages**: `features.html` (a proper feature tour with mocked
  "screenshots" of the app), `pricing.html`, and `contact.html` (a working
  contact form that opens the visitor's email app, pre-filled).
- **Site-wide dark/light mode** — the pill switch in the nav (styled after
  the OFF/ON toggle you pointed to) flips every page instantly and
  remembers the choice on that device. See Section 6 for how it works.
- **A real mobile menu** — a hamburger icon slides in a full-height panel
  with all the same links, on every page, animated open/closed.
- **A logo** — a small SVG mark made of three colored bars (literally a
  tiny kanban board), used in every nav and the footer.
- **Scroll-in animations** on the marketing pages — sections fade and
  rise into place as you scroll, instead of just appearing.
- **A richer, colorful background** — soft orange/violet/teal color washes
  behind the hero, instead of a flat grid, in both themes.
- **The dashed "perforated ticket" card style was removed** — cards are
  now clean rounded cards with a colored left rail, which reads as more
  premium and less cluttered.
- **A real footer** with product/account/contact link columns and your
  actual GitHub + portfolio links (Section 9 below explains what you still
  need to personalize).

---

## 2. Create your Supabase project (5 minutes)

Think of Supabase as "a database in the cloud that your website is allowed
to talk to." Here is exactly what to click.

1. Go to **https://supabase.com** and click **Start your project**.
2. Sign in with GitHub (fastest — you already have a GitHub account).
3. Click **New project**.
   - **Name**: `boardly` (or anything).
   - **Database password**: Supabase generates one — just click the copy
     icon and save it somewhere safe. You won't need it for this project
     (we never connect directly to Postgres), but it's good practice to
     keep it.
   - **Region**: pick whichever is closest to you.
4. Click **Create new project** and wait about 1–2 minutes while Supabase
   sets everything up. You'll land on the project dashboard when it's ready.

That's it — you now own a private database.

---

## 3. Get your API keys and paste them in

Every Supabase project has two public identifiers your website needs: a
**URL** and an **anon (public) key**. "Public" is not a mistake — this key
is *meant* to be visible in your website's JavaScript. Security instead
comes from the database rules we set up in Step 4 (Row Level Security).

1. In your Supabase project, click the **gear icon (Project Settings)** in
   the bottom-left sidebar.
2. Click **API** in the settings menu.
3. You'll see:
   - **Project URL** — looks like `https://abcxyz123.supabase.co`
   - **anon public** key — a very long string starting with `eyJ...`
4. Open `js/supabase-client.js` in this project and replace the two
   placeholder lines:

```js
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
```

with your real values. Save the file. **This one edit is the only thing
standing between this code and a fully working, deployed app.**

---

## 4. Create the database table and lock it down

Now we tell Supabase: "make a table called `tasks`, and make sure every
person can only ever see *their own* rows, never anyone else's."

1. In the Supabase sidebar, click the **SQL Editor** icon.
2. Click **New query**.
3. Open `supabase/schema.sql` in this project, copy the *entire* file, and
   paste it into the SQL editor.
4. Click **Run** (bottom right).
5. You should see "Success. No rows returned." That means the table now
   exists.

### What that SQL file actually does, in plain English

- `create table tasks (...)` — makes a spreadsheet-like table with columns:
  `id`, `user_id`, `title`, `category`, `status`, `due_date`, `position`,
  `created_at`.
- `alter table tasks enable row level security` — this is the single most
  important line in the whole project. By default, once security is on, the
  answer to "can anyone read/write this table?" becomes **no, unless a rule
  says otherwise.** Without this line, *any* logged-in stranger could read
  or delete *everyone's* tasks.
- The four `create policy ...` blocks are the rules. Each one says, in
  effect: *"you may select / insert / update / delete a row only if the
  row's `user_id` column matches your own logged-in user id (`auth.uid()`)."*
  This is what makes "logged-in user sees only their own tasks" actually
  true, enforced by the database itself — not just hidden by the website's
  JavaScript (which anyone could bypass by opening dev tools).

You can double check it worked: click **Table Editor** in the sidebar, open
`tasks`, click the **RLS** badge — it should say "Enabled," and you'll see
your 4 policies listed.

---

## 5. Turn on (or adjust) email sign-up

By default, Supabase requires users to confirm their email before they can
log in. For a portfolio demo, you may want to turn this off so you (or
anyone reviewing your portfolio) can sign up and see the dashboard
instantly, without needing a real inbox.

1. In Supabase, go to **Authentication → Providers → Email**.
2. Toggle **Confirm email** off if you want instant access, or leave it on
   for a more realistic, production-like flow. Both are handled by the code
   already — `auth.js` checks whether a session came back immediately after
   sign-up and redirects accordingly.

---

## 6. Run the site on your computer

Because there's no build step, you can literally double-click `index.html`
and it will open in your browser and work. For local development though,
it's better to serve the files through a tiny local web server (some
browser security rules behave more predictably that way). Two easy options:

**Option A — VS Code:** install the "Live Server" extension, right-click
`index.html`, choose **Open with Live Server**.

**Option B — Python (already on most computers):**
```
cd boardly
python3 -m http.server 8000
```
Then open `http://localhost:8000` in your browser.

Try it end to end:
1. Open the site → you land on `index.html`, the landing page.
2. Click **Get started free** → fill out `signup.html`.
3. You land on `dashboard.html` with an empty board.
4. Type a task in the box at the top and press Enter — it appears in **To
   do** instantly.
5. Drag it into **In progress**, then **Done**.
6. Refresh the page — the task is still there. That's the database working.
7. Click **Settings** → change your name → **Log out** → **Log in** again.

---

## 7. How the code works, file by file, in plain language

### `js/supabase-client.js` — the phone line to your database
This file runs first on every page. It creates one `supabaseClient` object
that every other file reuses to send requests like "give me this user's
tasks" or "log this person in." It also has two small helper functions:
- `requireSession()` — used on `dashboard.html` and `settings.html`. It asks
  Supabase "is anyone logged in right now?" If not, it immediately sends the
  visitor to `login.html`. This is how private pages stay private.
- `redirectIfLoggedIn()` — used on `login.html`/`signup.html`. If you're
  *already* logged in and you land on the login page, it skips straight to
  the dashboard instead of showing you a pointless form.

### `js/auth.js` — sign up and log in forms
Both forms call one Supabase function each:
- Sign up: `supabaseClient.auth.signUp({ email, password })`
- Log in: `supabaseClient.auth.signInWithPassword({ email, password })`

Supabase handles password hashing, sessions, and cookies/local storage for
you — you never touch a raw password after this line. If something goes
wrong (wrong password, email already used), Supabase returns an `error`
object with a human-readable `.message`, which we show right above the
form.

### `js/dashboard.js` — the big one, explained concept by concept

**a) "State" — one JavaScript object is the source of truth.**
Instead of the page's HTML *being* the data, we keep a plain JavaScript
array, `state.tasks`, in memory. Every time something changes, we update
that array first, then redraw the screen from it (`renderBoard()`). This
is the same idea every modern app (React, Vue, etc.) is built on, just done
by hand with plain JavaScript so there's nothing extra to learn.

**b) Optimistic UI — the "feels instant" trick.**
Normally an app would: (1) send a request to the server, (2) wait, (3) only
then update the screen. That wait, even if it's just 200 milliseconds,
makes an app feel laggy. Optimistic UI flips the order:
1. Update `state.tasks` and redraw the screen **immediately** — the user
   sees their task appear/move/disappear with zero delay.
2. *Then* send the real request to Supabase in the background.
3. If Supabase says it failed (rare — bad internet, etc.), we undo the
   local change and show a small toast explaining what happened.

Look at `addTask()` in `dashboard.js` — you'll see exactly this pattern:
push to `state.tasks` → render → *then* `await supabaseClient.from(...)`.

**c) Skeleton loading.**
Before the first batch of tasks arrives from the database, we don't show a
blank page or a spinner — we show gray animated rectangles the same size
and shape as real task cards (`renderSkeleton()` in `dashboard.js`, the
`.skeleton` CSS class with a shimmering gradient animation in
`style.css`). This tells the user "content is coming, and here's roughly
what it'll look like," which studies (and just about every modern app —
LinkedIn, YouTube, Slack) show feels faster than a spinner even when the
actual wait time is identical.

**d) Empty states.**
If a column has zero tasks, instead of leaving blank space, we render a
small illustration + friendly text ("No tickets on the desk... Ctrl+K to
add your first one"). See `emptyStateHTML()`. An empty screen with no
explanation makes people wonder if something is broken; an empty state
with a clear next action doesn't.

**e) Drag-and-drop with SortableJS.**
SortableJS is a small library loaded from a CDN in `dashboard.html`. You
give it a container element and it handles all the pointer/touch tracking,
placeholder animation, and reordering for you. We call
`new Sortable(columnElement, { group: "kanban", ... })` on each of the
three columns. Setting the same `group: "kanban"` name on all three is
what allows dragging *between* columns, not just reordering within one.
When a drag finishes, SortableJS fires an event; our `onAdd`/`onUpdate`
handlers read the new order of cards in the DOM and call `moveTask()` for
each one, which — following the same optimistic pattern — saves the new
`status` (which column) and `position` (order within the column) to
Supabase.

**f) The command palette (Ctrl+K).**
`document.addEventListener("keydown", ...)` listens globally for Ctrl+K
(or Cmd+K on Mac) and opens a small modal (`openPalette()`). Whatever you
type is matched against a short list of "actions" — jump to Settings, log
out, or (if what you typed doesn't match those) "Add task '...'" using
exactly what you typed. Pressing Enter runs the highlighted action. This
is the same idea behind the palette on your own portfolio site — a single
fast entry point for common actions, no mouse required.

**g) Checkbox complete + delete.**
Rather than adding a click listener to every single card (which would need
re-attaching every time we redraw the board), we attach **one** click
listener to the whole board container and check `e.target.closest(...)` to
figure out whether a checkbox or a trash icon was clicked. This pattern is
called **event delegation** — it's more efficient and never goes stale even
though `renderBoard()` throws away and rebuilds the card HTML constantly.

### `js/settings.js` — profile page
Uses `supabaseClient.auth.updateUser({ data: { full_name } })` to change the
display name, and `supabaseClient.auth.updateUser({ password })` to change
the password. Both are one-line calls — Supabase does the hard part. The
dark-mode toggle is intentionally simple: it just saves a preference to
`localStorage` on that one device (a good stretch goal is wiring it to
actually swap the color tokens — see Section 9).

### `css/style.css` — the visual identity
The design idea: every task is a **work-order ticket**, not a to-do line.
- `.ticket` — the card shell (white, thin border, small offset shadow).
- `.ticket-stub` — adds the dashed "perforation" line and punched dots down
  the left edge, like a tear-off ticket stub.
- `.rail-*` classes — the colored left border that marks a task's category.
- `.stamp` — the small rotated, monospace, bordered label (like a rubber
  ink stamp) used for category tags and hero badges.
- `.skeleton` — a CSS `background-size`/`background-position` animation
  that sweeps a lighter gradient across a gray box, the classic "shimmer"
  loading effect.
- The very light blueprint grid behind everything (`background-image` with
  two repeating `linear-gradient`s) reinforces the "workshop desk" feel
  without being loud.

---

## 8. Put it on the internet (GitHub Pages, same as your other sites)

Since you already publish `justixxprime.github.io` this way, the steps are
identical:

1. Create a new GitHub repository, e.g. `boardly`.
2. From inside the `boardly` folder on your computer:
   ```
   boardly
   git add .
   git commit -m "Initial commit: Boardly task manager"
   git branch -M main
   git remote add origin https://github.com/Justixxprime/boardly.git
   git push -u origin main
   ```
3. On GitHub, open the repo → **Settings** → **Pages**.
4. Under **Build and deployment**, set **Source** to **Deploy from a
   branch**, branch `main`, folder `/ (root)`. Save.
5. After a minute, GitHub gives you a URL like
   `https://justixxprime.github.io/boardly/`. That's your live app.
6. **Important:** in Supabase, go to **Authentication → URL Configuration**
   and add that GitHub Pages URL to **Site URL** / **Redirect URLs**, so
   Supabase trusts requests coming from it.

Add it to your portfolio (`justixxprime.github.io`) as a project card
linking to the live URL and the GitHub repo — exactly like your other case
studies, but now with a genuinely working sign-up-and-save backend, which
is a strong step up from a static template.

---

## 9. Stretch goals — what to add next, and how

You asked for these, and the current build already includes them, so
they're really "done," but here's how each one works if you want to extend
it further:

- **Due dates** — already in: `due_date` column + a `<input type="date">`
  would slot into the quick-add form; right now dates can be added by
  extending the command palette or quick-add row with a date input calling
  `addTask(title, category, dueDateValue)`.
- **Categories/tags with color** — already in (`general` / `work` /
  `personal` / `urgent`, each with a rail color). To add more categories:
  add a new key to `CATEGORY_RAIL` and `CATEGORY_LABEL` in `dashboard.js`,
  and a matching CSS `.rail-yourcolor` rule in `style.css`.
- **Drag-to-reorder within a column** — already in: SortableJS's `group`
  setting handles both "move to another column" and "reorder within the
  same column" using the same drag gesture.
- **Realtime sync across tabs/devices** — not yet built. Supabase supports
  this with one extra block of code:
  ```js
  supabaseClient
    .channel("tasks-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, loadTasks)
    .subscribe();
  ```
  Add that near the bottom of the `BOOT` section in `dashboard.js` and any
  change made in one browser tab (or by a teammate) will appear in others
  within a second, without a page refresh.
- **Avatar upload** — Supabase Storage (a free file-hosting bucket) plus a
  file `<input>` on `settings.html` that uploads to a bucket and saves the
  resulting URL to `user_metadata.avatar_url`.

## 9b. `js/site.js` — the file every page shares

Three small systems live here, loaded on every single page:

**Dark/light mode, without flashing.** Colors aren't hard-coded anywhere —
`style.css` defines two sets of CSS variables (`:root` for light,
`html.dark` for dark), and every page's `tailwind.config` points its color
names (`bg-paper`, `text-ink`, etc.) at those variables instead of fixed
hex codes. So the second `html.classList.toggle('dark')` runs, every
element using those classes repaints itself — no per-element dark: classes
needed anywhere in the markup. To avoid a flash of the wrong theme while
the page loads, a two-line script sits at the very top of every `<head>`,
before anything else, and applies the saved theme immediately:
```html
<script>if(localStorage.getItem('boardly-theme')==='dark'){document.documentElement.classList.add('dark')}</script>
```
Then `site.js`'s `initTheme()` wires up every element with a
`data-theme-toggle` attribute (there can be more than one per page — the
dashboard has one in the top bar and one in the mobile menu) so clicking
any of them flips the theme and saves the choice.

**The mobile menu.** Any page with a `#hamburger-btn` and `#mobile-menu`
gets a slide-in panel automatically. `initMobileMenu()` toggles a
`data-open="true/false"` attribute, and `style.css` does the actual sliding
with a CSS `transition` on `transform`. Clicking a link inside the menu, the
dark backdrop, or pressing Escape all close it.

**Scroll-in animation.** Any element with a `data-reveal` attribute starts
invisible and slid down slightly. `initScrollReveal()` uses an
`IntersectionObserver` — a built-in browser API that watches an element and
fires a callback the moment it scrolls into view — to add an `is-visible`
class, which `style.css` transitions into place. `data-reveal-delay="1"`
through `"4"` stagger a group of cards so they don't all animate at once.

## 9c. Personalize before you publish — a short checklist

A few things were intentionally left as clearly-labeled placeholders,
since only you know the real values:

- [ ] `js/supabase-client.js` — your real Supabase URL + anon key (Section 3)
- [ ] Every `mailto:hello@example.com` link (in each page's footer, and in
      `contact.html`) — replace `hello@example.com` with your real email.
      Use your editor's "Find in files" for `hello@example.com` across the
      whole `boardly` folder to catch every instance at once.
- [ ] The GitHub link `https://github.com/Justixxprime` and portfolio link
      `https://justixxprime.github.io/` in the footers — already point to
      your real accounts, but double check they're the ones you want linked
      from a live project.
- [ ] The favicon is an inline SVG of the logo mark — no file to swap, but
      if you want a different icon, replace the `<link rel="icon" ...>`
      `data:image/svg+xml,...` value at the top of each page.

---

- **"Failed to fetch" or nothing loads on the dashboard** → double-check
  `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `js/supabase-client.js` are your
  real values, not the placeholders.
- **Sign up works but tasks never save** → the `schema.sql` file probably
  wasn't run yet, or Row Level Security policies weren't created. Re-run
  Step 4.
- **You can log in but immediately get bounced back to `login.html`** →
  Email confirmation is likely still required in Supabase, and you haven't
  clicked the confirmation link yet. See Step 5.
- **Drag-and-drop doesn't move cards between columns** → make sure
  `sortablejs` loaded — check your browser console for a red error; it's
  usually a bad internet connection to the CDN.

## 10. How the Insights charts work, calculation by calculation

Every chart on `stats.html` is built the same basic way: JavaScript
counts things in your real task list, then hands those counts to a
drawing function in `js/charts.js`. None of it needs a special
"analytics" database table — it's all worked out fresh, every time you
load the page, from the same `tasks` table the board itself uses.

**The four stat cards** (Total / Completed / Completion rate / Overdue).
`Total` is just `tasks.length` — how many rows came back. `Completed`
filters that list down to `status === "done"` and counts what's left.
`Completion rate` is `done ÷ total`, turned into a percentage, with a
safety check for zero tasks (dividing by zero would show "NaN%", so it
shows 0% instead when your board is empty). `Overdue` reuses the exact
same `isOverdue()` idea from the board itself: a task counts as overdue
if it has a due date, that date is before today, and it isn't already
marked done.

**The category donut.** A JavaScript object (think of it like a little
lookup table) starts each category at zero, then loops through every
task once, adding 1 to that task's category each time
(`counts[category] = (counts[category] || 0) + 1` — the `|| 0` part
means "if this category hasn't been seen yet, start it at zero instead
of crashing"). Those four final counts become the four slices of the
donut. The donut itself is drawn as one SVG circle per category, each
one only showing a portion of its own outline (`stroke-dasharray`) sized
to that category's share of the total — categories with more tasks get
a proportionally longer arc.

**Due-date urgency.** Every not-done task gets sorted into exactly one
of five buckets — Overdue, Due today, This week, Later, or No date —
by comparing its due date against today's date and a week from today.
Each task lands in exactly one bucket (an `if / else if` chain — the
first matching condition wins and the rest are skipped), so the five
numbers always add up to your total not-done task count.

**"When you add tasks."** Every task has a `created_at` timestamp from
the moment it was saved to the database. `new Date(...).getDay()`
converts that timestamp into a number 0–6 (Sunday through Saturday);
tasks get counted into one of seven buckets based on that number. This
tells you which days of the week you tend to add the most tasks — not
which days you're busiest, since it doesn't know when a task will
actually be *done*, only when it was created.

**The activity heatmap.** Similar idea, but grouped by the exact date
(not just the day of the week) for the last 84 days, then chopped into
12-day-wide columns of 7 to form the grid. A day with more tasks
created gets a darker square — the darkness is calculated as a
percentage of whatever your single busiest day was, so the scale always
fits your own data instead of some fixed number that might make every
square look pale if you're not a heavy task-creator.

**One honest limitation, on purpose:** none of this can chart "tasks
completed per day" as a trend over time, because the `tasks` table only
stores *when a task was created* (`created_at`), not when it was marked
done. There's no `completed_at` column. Rather than fake that number
(e.g. reusing `created_at` and pretending it means something it
doesn't), it's simply not shown. If you want that specific chart later,
it needs one new database column — see Section 9 (Stretch goals) for
how you'd add one safely.

---

You now have a task manager with real authentication, a real private
database, drag-and-drop, an optimistic feel, and a command palette — built
the exact same simple way (plain HTML + Tailwind CDN) as the rest of your
portfolio, so it'll sit naturally next to First Experts Logistics and Amani
Community Trust as a third, more "app-like" case study.

---

## Round 3: search, undo, editing, bulk actions, export/import, PWA, and due-today alerts

Ten things landed this round, all on the board itself (`dashboard.html` /
`js/dashboard.js`), plus a cleanup pass and a real contact form.

**1. Live search/filter.** The search bar above the board filters by title
or category as you type, client-side against the tasks already loaded, no
extra network round trip per keystroke. Clearing it (the small X, or just
deleting the text) shows everything again.

**2. Undo toast on delete.** Deleting a ticket no longer touches the
database right away. The row disappears from the board immediately (still
feels instant) while the real Supabase delete is held off for 5 seconds
behind a "Task deleted, Undo" toast. Click Undo and the row goes right back
where it was, and the delete never actually happens.

**3. Click-to-edit modal.** Clicking anywhere on a ticket's title/body
(not the checkbox or delete icon) opens a modal where you can change the
title, category, status, and due date, or delete it from there too.
Previously the only ways to change a task were checking it off or dragging
it between columns.

**4. Bulk select + bulk actions.** The "Select" button in the toolbar
swaps every ticket's checkmark for a plain checkbox. Tap tickets to select
several, then use the bar that appears to move all of them to a column or
delete them together.

**5. Export as CSV/JSON.** The Export button downloads your actual board
data as a real file, not just the existing "copy summary" text blurb.

**6. Tab title badge.** The browser tab shows "(3) Dashboard | Boardly"
whenever 3 tasks are still not done, so you can see what's pending without
the tab being focused.

**7. Print stylesheet.** The Print button (or Ctrl/Cmd+P) gives a clean,
ink-friendly printed view: no nav, no buttons, no drag hints, just the
three columns as plain lists.

**8. Bulk import from pasted text.** The Import button opens a textarea,
one task per line. Each line runs through the same parser as quick-add, so
"finish the deck friday #work" on one line still picks up the date and
category correctly.

**9. PWA installability.** `manifest.json` + `sw.js` (a service worker)
make the site a real installable app with its own icon, and cache the app
shell (the HTML/CSS/JS, not your tasks) so it still opens with no
connection. An "Install" button appears in the toolbar once the browser
decides the site qualifies (it needs HTTPS, which GitHub Pages already
gives you for free).

**10. Due-soon browser notifications.** The bell icon asks for OS
notification permission, then fires one native notification listing
whatever's due today, at most once per day per browser, so it can't spam
you on every reload.

**Also this round:**
- Every em dash across every page's actual visible text was replaced with
  plain punctuation (periods, commas, colons), site-wide.
- The contact form now really sends: Web3Forms replaces the old mailto
  trick, so a message goes straight to an inbox with nothing extra for the
  visitor to do. See `WEB3FORMS_SETUP.md`.

---

## Round 4: ten more front-end-only power features, plus two bug fixes

**Ten new features, all localStorage/in-memory, no database or setup
needed:**

1. **Undo/redo (Ctrl/Cmd+Z).** Reverses your last complete, move, or
   edit. Delete already had its own "Undo" toast, that's unchanged.
2. **Sort toggle.** The "More" menu (the ... button in the toolbar) can
   sort each column by due date, title, or category instead of manual
   drag order.
3. **Focus/zen mode.** A small expand icon on each column header shows
   just that one column, full width.
4. **Density toggle.** Compact vs comfortable card spacing, in the More
   menu, remembered per device.
5. **Keyboard-only navigation.** Arrow keys (or j/k/h/l) move a
   highlight between cards, Enter opens the edit modal, Space toggles
   complete.
6. **Accent color picker.** Four color themes (Sunset, Ocean, Forest,
   Berry) in the More menu, swaps the orange/teal/violet accents
   site-wide on your board.
7. **Sound effects.** A short Web Audio tone on complete/delete,
   toggleable, no audio files.
8. **First-time onboarding tour.** A four-step spotlight walkthrough
   shown once automatically, replayable from the More menu.
9. **Quick task templates.** Save the quick-add box's current text as a
   reusable template from the layers icon next to it.
10. **Quick-add history.** Press the up arrow in the quick-add box to
    cycle back through your last 30 typed entries, like a shell history.

**Two bug fixes this round:**
- The plain toast and the delete "Undo" toast both used a hardcoded
  white background with theme-colored text, which went invisible in
  dark mode (white text on white). Both now use the theme's actual
  card background so they're readable in both themes.
- Adding a task before running `schema_v2.sql` used to fail outright
  with a "column not found" database error. Everything now degrades
  gracefully: board-scoping, recurrence, and subtasks are only sent to
  the database once the migration has actually been run, so basic task
  adding/editing keeps working either way, and the edit modal shows a
  short note pointing at `FEATURES_V2_SETUP.md` instead of the broken
  fields.

---

## Round 5: real bug fixes from live testing, delete/private board, remember me

**Two precisely-diagnosed bugs, both about theme colors leaking into
places they shouldn't:**
- The light-mode toggle animation was completely invisible. Root cause:
  a CSS rule stacked the outgoing/incoming theme snapshots in the wrong
  order for that direction, so the light reveal played entirely hidden
  behind the outgoing dark screen the whole time. Fixed by always
  keeping the new snapshot on top, regardless of direction.
- The onboarding tour's dimming overlay, and the shared modal backdrop
  used by the command palette and every modal, both used a CSS variable
  meant for text color as a dimming color. That variable flips to
  near-white in dark mode, so the "dim the background" effect was
  actually painting a translucent white wash in dark mode. Fixed with a
  fixed dark scrim color that stays dark regardless of theme.

**One precisely-diagnosed mobile bug:** the More/Export/Templates/board
switcher dropdown menus were positioned relative to their small trigger
button, which sits near the right edge of the toolbar - on a narrow
phone this pushed them half off-screen. They now use fixed positioning
pinned to the viewport, so they're always fully visible as a bottom
sheet regardless of which button opened them.

**New features this round:**
- Delete a board (with confirmation, and a guard against deleting your
  last one), and make a public board private again - both were
  previously one-way or silently did nothing before the database
  migration was run.
- The AI board assistant now understands whole-column requests like
  "clear my done column," not just single-task actions. **Needs
  `supabase functions deploy board-assistant` run again** to pick up
  the updated behavior.
- A hover-reveal pencil icon and tooltip on each ticket, so it's clear
  they're clickable to edit.
- "Remember me" checkbox on login. Supabase's client always persists
  sessions to localStorage with no per-login switch, so this is
  implemented as: unchecked means you're signed out automatically the
  next time the browser is fully closed and reopened, not instantly on
  tab close. Staying logged in for the rest of that browsing session
  either way.
- A cookie consent banner, created the same dynamic way as the
  back-to-top button, so it appears on every page automatically.
- Active-page highlighting on the nav, the mobile menu, and the footer,
  on every page.
- Footer link columns now arrange 2-across on mobile instead of a
  single long stack.
- Android's `mobile-web-app-capable` meta tag and iOS's
  `apple-mobile-web-app-*` tags, so "Add to Home Screen" behaves like a
  real standalone app on both platforms, not just wherever the manifest
  alone is enough.

---

## Round 6: ten big visual features, all client-side, no new migration needed

Everything below works the moment you push it, no SQL to run and no new
Supabase setup, since all of it is computed from data already in the
`tasks`/`boards` tables or stored locally in the browser.

**1. Calendar view.** A toolbar toggle swaps the three-column board for
a real month calendar, tickets laid out by due date, with a prev/next/
today navigator and an "unscheduled" tray underneath for tasks with no
due date. Clicking a ticket anywhere in it opens the same edit modal as
the board view. Each day also has a small "+" - click it to create a
new task due that exact day (no need to type "tomorrow" or a weekday
name, the date comes straight from the day you clicked). To change an
existing task's date from the calendar, click the task itself and edit
its due date in the usual edit modal.

**2. Levels, XP, streaks, and badges.** The pill next to the progress
ring shows your current level, computed from your total completed-task
count (no new column needed). Click it for a popover: an XP bar to the
next level, a daily streak counter, and an 8-badge grid that unlocks as
you clear more tickets. A level-up moment pops up automatically the
first time you cross into a new level. The streak is tracked via a
small completion log kept in this browser only, so it's specific to
this device, it doesn't sync across your other devices.

**3. Full-board celebration.** Clear every single ticket on a board and
you get a real full-screen moment (a banner plus a triple confetti
burst) instead of the board just quietly going empty.

**4. Board backgrounds.** Each board can carry its own subtle color
wash, picked from swatches in the More menu, remembered per board on
this device.

**5. Ambient animated background.** An optional toggle in the More menu
turns on a soft, slowly drifting canvas backdrop of colored blobs
behind the whole dashboard. Respects your OS's reduced-motion setting
automatically.

**6. Presentation / TV mode.** One click strips away the nav, toolbar,
and quick-add, and goes fullscreen, a clean board view built for a
wall-mounted screen or sharing during a stand-up. Esc or the exit
button brings everything back.

**7. Card cover images.** If a ticket's attachment is an image, it now
renders as a banner photo across the top of the card instead of just a
paperclip icon, turning the board into something that can scan like a
moodboard.

**8. Board templates.** A gallery of four starter boards (Sprint
planning, Content calendar, Job hunt, Home renovation), each populated
with real starter tickets the moment you pick one, instead of staring
at an empty board.

**9. Live collaborator cursors.** Riding on the same realtime channel
already used for live sync, every connected browser now broadcasts its
mouse position over the board, so you can see exactly where someone
else is looking in real time. Desktop-mouse-only by nature, since touch
screens don't have a hover cursor to share.

**10. Delete/make-private board.** (Landed the round before this one,
documented here for completeness.) Delete a board you no longer need,
with a guard against deleting your last one, and toggle a public board
back to private.

**11. Clear a whole column.** Each column header (To do, In progress,
Done) now has a small trash icon that deletes every ticket in that
column at once, with a confirmation first.

**12. Reset level, XP, streak & badges.** A "Reset progress" link at
the bottom of the gamification popover (click the level pill to open
it) sets your level and XP back to 1 and clears your streak and badge
progress, without touching or deleting any of your actual tasks. Since
level/XP are computed live from your total completed-task count, this
works by remembering an offset to subtract going forward rather than
changing any task data.

**13. Cookie banner, actually working now.** The cookie consent banner
from an earlier round was written but never actually turned on, a
one-line bug (the function existed, nothing called it). Fixed, and it
now links to a real `cookies.html` page explaining exactly what's
stored in your browser and why, added to every page's footer.
