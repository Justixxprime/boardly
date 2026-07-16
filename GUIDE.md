# Boardly — the complete beginner's guide

This document explains **everything**, slowly, in plain language. Read it top
to bottom the first time. After that, use it as a reference.

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

---

You now have a task manager with real authentication, a real private
database, drag-and-drop, an optimistic feel, and a command palette — built
the exact same simple way (plain HTML + Tailwind CDN) as the rest of your
portfolio, so it'll sit naturally next to First Experts Logistics and Amani
Community Trust as a third, more "app-like" case study.
