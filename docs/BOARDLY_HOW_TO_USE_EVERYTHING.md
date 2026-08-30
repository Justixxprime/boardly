# Boardly — How To Use Everything

This is your complete guide to every feature on your website. It's written in
very simple, step-by-step language, like you've never used the app before.
Read it top to bottom once, then keep it around to check back on anything
you forget.

Boardly has **4 main pages**, all reachable from the menu at the top:

| Page | What it's for |
|---|---|
| **Board** (`dashboard.html`) | Your kanban board — where you manage tasks/tickets |
| **Insights** (`stats.html`) | Charts and numbers about your work |
| **Quick Tools** (`tools.html`) | Personal widgets + developer tools, unrelated to tasks |
| **Settings** (`settings.html`) | App lock, dark mode, log out |

There's also `index.html`, your public marketing homepage — this is the page
people see before they log in.

---

## PART 1 — The Board (your main workspace)

This is the page you'll live in most of the time. It has 3 columns: **To
do**, **In progress**, and **Done**. Every task is a card, called a
**"ticket."**

### 1.1 Adding a new ticket

1. Find the box at the top that says *"Write a new ticket, try 'tomorrow',
   a weekday, or #work…"*
2. Type what you need to do.
3. Press **Enter** or tap **Add task**.

**Shortcuts you can type right into that box** (no need to fill in separate
fields):

- `#work`, `#personal`, `#urgent`, `#general` → sets the category
- `tomorrow`, `next friday`, `monday` → sets the due date
- `@ig`, `@fb`, `@li`, `@tiktok`, `@yt`, `@web`, `@email` → tags which
  platform this is for

**Example:** typing `Post the warehouse tour reel @ig tomorrow #work` creates
a ticket titled "Post the warehouse tour reel", tagged Instagram, due
tomorrow, in the Work category — all in one line.

**Voice instead of typing:** tap the little microphone icon inside that same
box and just speak your ticket out loud.

### 1.2 Opening a ticket to edit it

Tap anywhere on a ticket card to open the full **Edit ticket** window. Every
feature below (reminders, attachments, captions, etc.) lives inside this
window. Tap **Save changes** when you're done, or **Cancel** to discard.

### 1.3 Moving tickets between columns

Press and hold the small grip handle on the left edge of a ticket, then drag
it into **To do**, **In progress**, or **Done**. The rest of the page still
scrolls normally.

### 1.4 Categories

Every ticket has a category: **Work**, **Personal**, **Urgent**, or
**General**. Pick it from the dropdown inside the Edit ticket window. Each
category gets its own color so you can spot things at a glance.

### 1.5 Due dates

1. Open a ticket → tap **Set a date** under "Due date."
2. Pick a day on the calendar that pops up.
3. To remove it, tap the **✕** button next to the date.

### 1.6 Auto-move to Done when it's due (optional)

Right under the due date, there's a checkbox:
*"Auto-move to Done when this due date arrives."*

- **Tick it** → the moment that due date arrives, Boardly moves the ticket
  into Done for you, automatically. No need to come back and do it
  yourself.
- **Leave it unticked** → nothing automatic happens; you move it to Done
  yourself, whenever you're ready.

It only shows up once you've set a due date.

### 1.7 Reminders — one-time

1. Open a ticket → find **"Remind me at"**.
2. Tap **Set a date** and **Set a time**.
3. Boardly will pop up a notification at that exact moment, as long as the
   app is open in a tab or installed on your Home Screen.

### 1.8 Reminders — repeating (the big one)

Right under the reminder time, there's a **Repeats** dropdown:

- **Just once** — normal one-time reminder (the old way)
- **Every day, same time**
- **Every weekday, same time** (skips Saturday/Sunday)
- **Every week, same day & time**

Set the time **once**. The moment it fires, Boardly automatically schedules
the *next* one for you — you never have to reopen the ticket and re-set it.

To turn a repeating reminder off, open the ticket, tap the bell-with-a-line
icon to clear it.

### 1.9 Reminders — by location (instead of by time)

Under the time-based reminder, there's a section: **"Or remind me by
location."**

1. Tap **Use my current location** (you'll be asked to allow location
   access — say yes).
2. Give the place a name, like "Warehouse" or "Client Office."
3. Choose **When I arrive** or **When I leave**.
4. Pick how big an area counts (150m, 300m, 800m, or 1.5km).

This only works while Boardly is open in a browser tab with location
permission turned on — same real-world limit as the time-based reminders.

### 1.10 Timezones — Lagos is always shown

Any time you see a reminder time on a ticket, Boardly shows it in **two or
three timezones at once**, separated by dots — for example:
`8:00 AM WAT · 8:00 AM WAT`. **Africa/Lagos time always leads the list**,
no matter what timezone you actually used when you set the reminder, plus
whichever zone you set it in if that's different.

### 1.11 Platform tag (for social media posts)

1. Open a ticket → find the **Platform** dropdown.
2. Pick Instagram, Facebook, X/Twitter, LinkedIn, TikTok, YouTube, Website,
   or Email.
3. A little tip appears underneath telling you the typical best time to
   post on that platform.

The platform also shows as a small colored badge on the ticket card.

### 1.12 Caption / notes (writing the actual post copy)

Right under Platform is a **Caption / notes** box. This is where you draft
the actual words that'll go out — the caption, the hashtags, whatever.

- A live **character counter** shows how long your text is versus that
  platform's typical limit (e.g. 280 for X, 2,200 for Instagram).
- Tap the little **stack icon** above the box to open your saved snippets
  (reusable captions/CTAs you use often). Tap one to drop it in.
- To save your current text as a reusable snippet: open that same stack
  icon menu → **"Save current text as snippet."**

### 1.13 Preview how a post will look

Tap the **eye icon** next to the caption box. A small mockup pops up
showing your title/caption and cover photo styled like a real post for
whichever platform you picked. It's a rough preview, not pixel-perfect —
just enough to sanity-check before you post for real.

### 1.14 Pipeline stage (for content that needs approval)

If your work goes through stages before it's live, use the **Pipeline
stage** dropdown: Draft → In review → Approved → Scheduled → Published.
This sits *on top of* the normal To do/In progress/Done columns — it
doesn't replace them, just adds more detail.

### 1.15 Published link & performance

Once a post is actually live, scroll to **"Published link & performance"**:

1. Paste the link to the live post.
2. Add a quick note — e.g. "2.4k views, 180 likes."

A small icon appears on the card linking straight to the live post.

### 1.16 Attachments — photos, files, and links

Scroll to the **Attachments** section inside a ticket. You can add as many
as you want, in three ways:

- **Pick a file** — tap the file box, choose a photo from your device.
- **Take a photo** — tap **"Take a photo"**, which opens your camera
  directly.
- **Paste a link** — type or paste any URL (a Canva file, a Google Doc, a
  live post) and tap **Add**. No upload needed.

**Pasting a copied image or file:**
- On a computer: just press **Cmd+V** (Mac) or **Ctrl+V** (Windows)
  anywhere in the window after copying an image.
- On a phone: tap the **"Paste from clipboard"** button — copy an image
  somewhere first, then come back and tap that button.

Each attachment shows in a list with:
- A **download** button (saves the actual file to your device)
- A **remove** (✕) button (deletes just that one)

If a photo is attached, it also becomes the ticket's cover image on the
board.

### 1.17 Subtasks / checklist

Inside the edit window, add smaller steps under the main ticket — check
them off one at a time as you complete each piece.

### 1.18 Repeating due dates

The **Repeat** dropdown near the due date (separate from the reminder
repeat) is for tickets that come back on a schedule — like "submit weekly
report." Choose Doesn't repeat / Every day / Every weekday / Every week.

### 1.19 Bulk actions (working with many tickets at once)

1. Tap **Select** in the toolbar.
2. Tap each ticket you want to include — checkmarks appear.
3. A bar appears at the bottom letting you move, delete, or tag all
   selected tickets together.

### 1.20 Search and filter

Type into the search bar to instantly filter the board by title or
category. Clear it with the ✕ that appears once you've typed something.

### 1.21 Export and import

- **Export** (toolbar) → download your whole board as a CSV (for
  spreadsheets) or JSON (for backups/technical use).
- **Import** (toolbar) → paste in a list of tasks (one per line) and
  Boardly creates a ticket for each line, using the same shortcuts as
  quick-add (`#tag`, `tomorrow`, etc. all still work).

### 1.22 Calendar view

Tap the **calendar icon** in the toolbar to see your tickets laid out by
due date instead of by column. Tap it again (or the Board link) to go
back.

### 1.23 Starting a board from a template

1. Open the board switcher menu (top of the sidebar/menu).
2. Tap **"New board from template."**
3. Choose: **Weekly content batch**, **Product/service launch**, or
   **Logistics update series**.
4. Name your new board — it's created instantly with a set of realistic
   starter tickets already on it, ready to edit.

### 1.24 Multiple boards

You're not limited to one board. Use the board switcher to create a new
blank board, rename the current one, or switch between boards entirely —
useful for separating, say, "Client A" from "Client B," or work from
personal.

### 1.25 Sharing a board

In the board switcher, **"Make public / share"** gives anyone with the
link a read-only view of that board — handy for showing a client progress
without giving them edit access. **"Make private"** turns it back off.

### 1.26 Sharing a single ticket

Inside the Edit ticket window, tap the **share icon** (next to Save/Cancel).
On a phone or Mac, this opens your device's real native share sheet — send
the ticket straight to Messages, Mail, WhatsApp, anywhere. On a browser
without that feature, it copies the ticket's text to your clipboard
instead.

### 1.27 Ask AI / Daily briefing

- **Ask AI** (toolbar) opens a chat panel where you can ask questions
  about your board — "what's overdue," "summarize my week," etc.
- **Daily briefing** (the sun icon near the progress bar) is a one-tap
  version of this: it automatically asks the AI to tell you what to
  prioritize today.

*(Both need a one-time setup step on the Supabase side — see
`AI_SETUP_BABY_STEPS.md` if the AI doesn't respond.)*

### 1.28 QR handoff — open the board on your phone instantly

Tap the **QR code icon** near the progress bar. A QR code appears — scan it
with your phone's camera to open this exact board on your phone in one
step, no typing a URL.

### 1.29 Progress ring & gamification

The circular ring near the top shows what percentage of your tickets are
Done. As you complete tickets you'll also see small celebration animations,
streaks, and level-ups — this is just for fun/motivation, it doesn't
affect your data.

### 1.30 Zen/focus mode on a column

Tap the little expand icon on a column header to focus on just that one
column, hiding the other two temporarily.

### 1.31 Presentation mode

Useful if you're screen-sharing your board in a meeting — hides the extra
toolbar clutter and makes tickets a bit bigger and cleaner-looking.

### 1.32 Keyboard shortcuts / Command palette

On a computer, tap the search bar at the top (or press the shortcut key
shown next to it) to open a command palette — quickly jump to any page or
run common actions without touching your mouse.

---

## PART 2 — Quick Tools page

This page is **not tied to your tasks** — it's a personal toolbox that
lives on your device. Reach it from the **Tools** link in any page's menu.

### 2.1 Focus timer (Pomodoro)

1. Pick a preset: 25 min focus, 5 min break, 15 min break, or 50 min
   focus.
2. Tap **Start**.
3. When it finishes, you get a notification and it counts as one
   completed session for today (shown underneath).

### 2.2 Scratchpad

A plain text box for jotting anything down. It **saves automatically** as
you type — nothing to click.

### 2.3 Countdown to anything

1. Type what's coming up (e.g. "Sarah's birthday").
2. Pick the date underneath.
3. Tap **Add**.

It shows how many days are left, updating live. Tap the ✕ next to any item
to remove it.

### 2.4 Unit converter

Pick a category (Length, Weight, Temperature, or Volume — including
shipping container sizes like 20ft/40ft). Type a number, pick the "from"
and "to" units, and the answer updates instantly.

### 2.5 Decision picker

1. Type your options (add more with **"Add option"**).
2. Tap **Pick for me**.
3. It spins through the choices and lands on one at random.

### 2.6 Calculator

A normal calculator — tap the number pad, get your answer. Nothing fancy,
just always within reach.

---

## PART 3 — Dev Tools (also on the Quick Tools page)

These are built specifically for front-end/full-stack developer work —
everything runs instantly on your device, nothing gets uploaded anywhere.

### 3.1 JSON formatter & validator

Paste any JSON into the box, then tap **Format** (makes it readable) or
**Minify** (squashes it small). If it's broken, you'll see exactly what's
wrong instead of a blank screen. Tap **Copy** to grab the result.

### 3.2 Color & contrast checker

1. Pick or type a text color and a background color (hex codes like
   `#12203A` work, or use the color swatches).
2. The preview box shows what that combination actually looks like.
3. Below it, you'll see the contrast ratio and whether it passes
   accessibility standards (AA / AA large text / AAA) — useful for making
   sure text you design is actually readable.

### 3.3 Base64 encode / decode

Paste text, tap **Encode →** to scramble it into Base64, or **← Decode**
to turn Base64 back into normal text. Common for embedding small data or
working with APIs.

### 3.4 URL encode / decode

Same idea, but for URLs — turns spaces and special characters into the
`%20`-style format browsers need, or reverses it.

### 3.5 Regex tester

1. Type your pattern (e.g. `\d+`) and any flags (like `g` for "find all").
2. Paste in some test text.
3. Matches highlight instantly as you type — no more guessing whether your
   regex actually works.

### 3.6 Lorem Ipsum generator

Pick how many paragraphs, sentences, or words you need, tap **Generate**,
then **Copy** — handy filler text for mockups and layouts.

### 3.7 Code snippet vault

For code you reuse constantly (a fetch wrapper, a config file, whatever):

1. Write or paste the code into the editor box.
2. Give it a name.
3. Tap **"Save current code below."**

It's now saved permanently on this device. Each saved snippet has buttons
to **copy** it, **load it back** into the editor to tweak, or **delete**
it.

---

## PART 4 — Settings page

### 4.1 App Lock

A 4-digit passcode just for this device — separate from your real account
password, and it doesn't sync anywhere.

**To turn it on:**
1. Type a 4-digit code into "New passcode."
2. Type the same code again into "Confirm passcode."
3. Tap **Set passcode**.

Now, every time you (or anyone) opens Boardly on this device, a lock
screen appears first, asking for that code.

**To turn it off:** come back to this same section and tap **Turn off.**

This is meant for privacy (stopping someone who picks up your phone from
seeing your board), not real security — it doesn't encrypt anything.

### 4.2 Dark mode

Tap the toggle switch (sun/moon icon). This applies across the whole site
and is remembered the next time you open Boardly.

### 4.3 Log out

Signs you out of your account entirely.

---

## PART 5 — Insights page

This page turns your board into charts, all computed live from your real
tickets (nothing here is fake demo data):

- **Overall completion stats** — how many tickets total, done, overdue,
  etc.
- **"When you add tasks"** — a chart of which days of the week you're most
  active.
- **"Content by platform, this week vs last"** — only appears once you've
  used the Platform tag on some tickets; shows how much you posted per
  platform, and whether it's up or down from last week.
- **Activity heatmap** — a 12-week grid showing your activity pattern at a
  glance, like a habit tracker.

---

## PART 6 — Installing Boardly as an app on your phone

Boardly can run like a real app on your Home Screen, without going through
an app store.

**On iPhone:**
1. Open Boardly in Safari (not another browser — this only works in
   Safari on iPhone).
2. Tap the **Install** button in the header, or the Share icon at the
   bottom of Safari.
3. Scroll down and tap **"Add to Home Screen."**
4. Tap **Add.**

It now opens full-screen from your Home Screen, exactly like a normal app.

**On Android/Desktop Chrome:** tap the **Install** button in the header —
your browser handles the rest automatically.

### 6.1 Notifications

Once installed, Boardly can send you real notifications — including ones
with **Snooze (10 min)**, **Mark done**, and **Open** buttons right on the
notification itself, so you can act without even opening the app. (Button
support varies by device — it's most reliable on Android and desktop.)

### 6.2 Home Screen shortcuts

Long-press the Boardly icon on your Home Screen for quick shortcuts
straight to **"New ticket"** or **"Quick Tools,"** skipping the main board
entirely.

### 6.3 Sharing something *into* Boardly

If your device supports it, you can select "Boardly" from another app's
share menu (a webpage, a note, a photo's caption) to send that content
straight into Boardly's quick-add box.

---

## A few things worth remembering

- **Everything saves automatically.** There's no separate "save your
  progress" button anywhere except inside the Edit ticket window itself.
- **Reminders, notifications, and location alerts only work while Boardly
  is open somewhere** — a browser tab or the installed app. This is a
  real limitation of how websites work, not a bug.
- **Quick Tools and Dev Tools data stays on your device only** — it's not
  backed up to your account, so it won't follow you to a different
  phone/computer.
- If a feature seems to be **missing entirely** (not just hidden — an
  actual blank space with an info note), it usually means a one-time
  database setup step hasn't been run yet. Check the relevant
  `supabase/schema_v*.sql` file and `FEATURES_V2_SETUP.md` /
  `REMINDERS_BREVO_SETUP.md`.
