# Boardly: ultra baby steps for publishing and adding big features

This guide is for the Boardly project you have now: plain HTML, Tailwind CSS,
JavaScript, and Supabase. Read one small section, do it, then come back.
You do **not** need to do everything in one day.

## Part 1 — First, put the mobile fix on GitHub

### What the words mean

- **GitHub** is the online cupboard where your website files live.
- **A commit** is a saved checkpoint with a short note.
- **Push** means send that checkpoint from your computer to GitHub.
- **GitHub Desktop** is the easiest button-based way to do this on Windows.

### The safest way: GitHub Desktop

1. Download and install GitHub Desktop from <https://desktop.github.com/>.
2. Open it and sign in with the same GitHub account that owns your Boardly
   repository.
3. Download `boardly-mobile-fixed.zip` from the earlier message.
4. Right-click the ZIP file and choose **Extract All**. Remember the folder
   where it extracted.
5. In GitHub Desktop click **File** then **Clone repository**.
6. Click the **URL** tab. Paste your Boardly GitHub repository address. It
   normally looks like `https://github.com/YOUR-NAME/boardly.git`.
7. Choose a location you can find again, such as `Documents\GitHub`.
8. Click **Clone**. GitHub Desktop has made a clean, connected copy of your
   website on your computer.
9. Open the extracted update folder in File Explorer. Press `Ctrl + A`, then
   `Ctrl + C`.
10. Open the new cloned `boardly` folder. Press `Ctrl + V`.
11. If Windows asks whether to replace files, click **Replace the files in the
    destination**. Do not delete the hidden `.git` folder in the cloned
    project; it is the part that remembers GitHub.
12. Return to GitHub Desktop. You should now see a list of changed files on
    the left. This is expected.
13. At bottom-left, in **Summary**, type:
    `Fix iPhone layout and ticket controls`
14. Click **Commit to main**.
15. Click **Push origin** at the top of GitHub Desktop.
16. Open your GitHub repository in a browser. Refresh it. You should see your
    commit message near the top.
17. If you use GitHub Pages, wait a few minutes, then open the website on the
    iPhone and refresh it. If it still looks old, open it in a private tab.

That is a complete push. GitHub Desktop can also pull newer online changes
before you push, which helps prevent conflicts.

### Terminal version (only when you feel ready)

Open Git Bash inside the cloned `boardly` folder and run these three lines:

```bash
git add .
git commit -m "Fix iPhone layout and ticket controls"
git push
```

If a command shows red error text, stop and copy the whole message. Do not use
`git reset --hard` or `git push --force`.

## Part 2 — Know what Boardly already has

You already have a strong starting point:

- Boards, Kanban columns, task search, labels/categories, quick add, and bulk selection.
- Calendar view, due dates, browser reminders, recurring tasks, checklists,
  attachments, public sharing, and real-time Supabase sync.
- A task edit screen and natural-language date parsing.

Before building a new feature, first check whether it is already present in
the dashboard or needs the `schema_v2.sql` Supabase update described in
`FEATURES_V2_SETUP.md`.

## Part 3 — Useful ideas to borrow (not copy) from other apps

| App | Good ideas to add to Boardly | Build first? |
| --- | --- | --- |
| Todoist | Inbox, priority levels, filters, natural-language quick add, task projects/sections | Yes: priorities and filters |
| TickTick | Habit tracker, Pomodoro focus timer, calendar timeline, Eisenhower priority view | Yes: habits, then focus timer |
| Microsoft To Do | My Day, simple steps, reminders, shared lists, a calm simple layout | Yes: My Day |
| Habit apps | Daily check-in, streak, weekly goal, gentle “you missed a day” recovery | Yes: daily habits |
| Wix | A website builder and automation host, rather than a task app feature | Only if you want Wix hosting |

Do not try to clone five apps at once. The best order is:

1. **My Day** — choose today’s important tasks.
2. **Priorities** — High, Medium, Low.
3. **Habit tracker** — daily/weekly repeat check-ins and streaks.
4. **Focus timer** — a simple 25-minute timer attached to a task.
5. **Saved filters** — for example “High priority work tasks due this week”.
6. **External syncs** — Todoist, TickTick, Microsoft To Do, calendars.

## Part 4 — Add a My Day view

### The idea

My Day is a short list of tasks you deliberately choose for today. It is not
every task with today’s date. That small difference makes it feel calm.

### The baby-step build plan

1. In Supabase, create a field on tasks called `my_day_date`.
2. Add a “Add to My Day” button to each ticket.
3. When tapped, save today’s date into that field.
4. Add a “My Day” button near the dashboard title.
5. When tapped, show only tasks whose `my_day_date` equals today.
6. At midnight, the view naturally becomes empty; the old tasks remain in
   their original boards, they are simply no longer in today’s shortlist.

Test with one task before moving to the next step.

## Part 5 — Add priorities and filters

### Priority levels

1. Add a `priority` field to tasks. Use only `high`, `medium`, and `low`.
2. Put a small priority selector in the Edit Ticket window.
3. Use one clear visual signal: red/orange for high, violet for medium, grey
   for low. Do not rely on color alone; also show the word in the selector.
4. Add a filter button: **All / High / Medium / Low**.
5. Test: create one task for each level, filter each level, then clear the
   filter.

## Part 6 — Add a real habit tracker

### Keep habits separate from normal tasks

A task is usually completed once. A habit is completed repeatedly. Putting
them in different database tables keeps the code simpler.

### Database shape in plain English

Create two new tables:

```text
habits
  id, user_id, name, color, schedule, target_per_week, created_at

habit_entries
  id, habit_id, completed_on, created_at
```

- `habits` stores the habit itself: “Drink water”.
- `habit_entries` stores each tick: “Drink water was done on 2026-08-05”.

### Build order

1. Make a new `habits.html` page and add a **Habits** link to the menu.
2. Add one input and one button: “New habit” and “Create habit”.
3. Show every habit as a small card with a large **Done today** button.
4. On click, create today’s `habit_entries` row. On a second click, remove
   that same row. This makes it a safe toggle.
5. Count consecutive completed days to display the streak.
6. Add a weekly target after the daily version works.
7. Only then add reminders, charts, and a calendar heatmap.

### What a streak means

Starting today, look backwards one day at a time. Keep counting while an
entry exists. Stop at the first day without an entry. That number is the
streak. A missed day is not failure; show “Start again today” rather than a
punishing message.

## Part 7 — External sync: the important safety rule

Never put a Todoist, TickTick, Microsoft, Google, or WhatsApp secret in
`dashboard.js`, `index.html`, or any file pushed to GitHub. Visitors can view
public browser code. Put secrets in Supabase Edge Function secrets instead.

Your architecture should be:

```text
Boardly browser -> Supabase database -> Edge Function -> external service
external service webhook -> Edge Function -> Supabase database -> Boardly browser
```

Choose **Boardly as the source of truth** first. In other words: Boardly holds
the main task record and saves the external app’s task ID next to it. Without
this rule, two-way sync can create duplicates or overwrite the wrong task.

### Todoist sync

Todoist’s current API supports tasks, projects, OAuth, a fast sync endpoint,
and Quick Add natural language. Start with one-way export first.

1. Make a Todoist developer application and set a redirect URL that points to
   a Supabase Edge Function, not `dashboard.html`.
2. Add a **Connect Todoist** button in Boardly.
3. Sign in to Todoist and approve the connection.
4. Your Edge Function receives the authorization code and exchanges it for a
   token. Store that token securely in the database, protected by row-level
   security; never show it in the browser.
5. Add `todoist_task_id` and `todoist_updated_at` fields to Boardly tasks.
6. First implement **Boardly -> Todoist only**: create/update/complete a
   Todoist task when you act in Boardly.
7. Test with one “Test sync” project.
8. Later add Todoist -> Boardly incremental sync using Todoist’s sync token.

### TickTick sync

TickTick documents an Open API for tasks and lists. Use the same one-way-first
plan as Todoist.

1. Create an app in TickTick Developer Center.
2. Build a server-side “Connect TickTick” OAuth flow.
3. Save TickTick’s task ID in `ticktick_task_id`.
4. Create a task from Boardly in a dedicated TickTick test list.
5. Add completion sync only after create/update works.

Check the live TickTick documentation before each implementation: providers
can change their permission or app-review requirements.

### Microsoft To Do and Outlook sync

Microsoft To Do is accessed through Microsoft Graph. It supports task lists,
tasks, due dates, reminders, importance, recurrence, and checklist items.

1. Go to Microsoft Entra admin center and register an application.
2. Add your Edge Function callback as a Web redirect URI.
3. Add the delegated Microsoft Graph permission `Tasks.ReadWrite`.
4. Build the Microsoft sign-in flow in an Edge Function.
5. Use Graph to list To Do lists, then let the user choose one.
6. Store the selected list ID and each linked Microsoft task ID.
7. Start with Boardly -> Microsoft To Do. Add delta-query importing later.

Outlook tasks surface in Microsoft To Do, but calendar events are a different
Microsoft Graph resource. Treat task sync and calendar sync as two separate
features.

### Google Calendar and iCloud

- **Google Calendar:** needs a Google Cloud project, OAuth consent screen,
  Calendar API, redirect URL, and a server-side token exchange.
- **iCloud:** has no simple public task API equivalent for a beginner static
  app. Start with calendar subscription/import/export (ICS) before attempting
  account-level iCloud synchronization.

## Part 8 — WhatsApp reminders

This needs WhatsApp Business Platform (or a provider such as Twilio), a phone
number, approved templates, explicit user opt-in, and a server-side webhook.
It is not safe or possible to add by placing a WhatsApp key in frontend code.

Start simpler:

1. Keep browser notifications enabled in Boardly.
2. Build email reminders via the existing Supabase/Resend guide.
3. When that works, use the official WhatsApp Business Cloud API to send an
   approved reminder template from an Edge Function.
4. Save the user’s opt-in and WhatsApp number securely.
5. Add an unsubscribe command before sending real reminders.

## Part 9 — Should you use Wix?

Use Wix only if you want Wix to host the marketing pages, members, CMS, or
automations. Your existing Boardly app does not need Wix to work.

If you move to Wix:

1. Create a Wix Studio site.
2. Turn on Velo.
3. Keep secrets in Wix Secrets Manager.
4. Put API calls in Wix backend code/HTTP functions, not browser page code.
5. Publish the Wix site after changing an HTTP function.

This is a different platform from GitHub Pages. For your current project,
GitHub Pages + Supabase is the simpler path. Do not run the same app data in
both Wix and Supabase until you have designed one clear source of truth.

## Part 10 — Your next three sessions

### Session 1 (today)

1. Push the mobile fix using Part 1.
2. On your iPhone, test search, scrolling, adding a ticket, and Mark all.
3. Write down anything that still feels annoying.

### Session 2

1. Run `schema_v2.sql` from the existing guide.
2. Test boards, recurring tasks, checklists, attachments, and sharing.
3. Choose **one** next feature: My Day, priorities, or habits.

### Session 3

1. Build only the simple first version of that feature.
2. Test it with three real tasks/habits.
3. Push a separate commit with a clear name.

## Official reading links

- GitHub Desktop: <https://docs.github.com/en/desktop/overview/getting-started-with-github-desktop>
- Todoist API: <https://developer.todoist.com/api/v1/>
- TickTick API support: <https://help.ticktick.com/articles/7055781495671095296>
- Microsoft To Do API: <https://learn.microsoft.com/en-us/graph/todo-concept-overview>
- Wix third-party integrations: <https://dev.wix.com/docs/develop-websites/articles/get-started/integrate-with-3rd-parties>
- Wix HTTP functions: <https://dev.wix.com/docs/develop-websites/articles/coding-with-velo/integrations/exposing-services/methods-for-http-functions>

When you are ready to build **one** feature, tell me its name. I can then add
the actual HTML, Tailwind CSS, JavaScript, Supabase SQL, and a test checklist
for that feature without making the rest of the project confusing.
