# Setting up the new features (do these in order)

Everything in the front end (multi-board switcher, checklists, swipe
gestures, offline queue, share links, the AI panel) is already built and
already in the code you're getting. But six of the ten new features
depend on database or server-side pieces that only you can turn on,
because they need your own Supabase project and, for the AI features,
your own API key. This is the same pattern as Web3Forms: the code is
ready and waiting, it just needs a key or a one-time setup step plugged
in.

Do these five steps roughly in order. None of them require touching
your website's actual files except step 5.

---

## Step 1: run the database migration (required for everything below)

1. Go to your Supabase project, https://supabase.com/dashboard
2. Open your `boardly` project, click **SQL Editor** in the left sidebar.
3. Click **New query**.
4. Open `supabase/schema_v2.sql` (included in this update) in a text
   editor, copy the entire contents.
5. Paste it into the SQL editor, click **Run**.
6. You should see "Success. No rows returned." That's it, this created
   a `boards` table, added new columns to `tasks`, and automatically put
   all of your existing tasks onto one board called "My board" so
   nothing you already have disappears or breaks.

**What this unlocks immediately, with zero further setup:** multi-board
workspaces, realtime sync, checklists/subtasks, recurring tasks, swipe
gestures, the offline queue, and public share links. That's 7 of the 10,
done, just from this one paste.

---

## Step 2: create the file-attachments storage bucket

This one can't be done with SQL, it's a couple of clicks in the
dashboard.

1. In your Supabase project, click **Storage** in the left sidebar.
2. Click **New bucket**.
3. Name it exactly: `task-attachments`
4. Toggle **Public bucket** ON.
5. Click **Create bucket**.

That's the whole thing. File attachments now work, upload a file from
any ticket's edit screen and it'll show a paperclip icon on the card.

---

## Step 3: get a free Groq API key (needed for the AI assistant and the daily digest)

1. Go to https://console.groq.com and sign up or log in, no card
   required.
2. Left sidebar, click **API Keys**, click **Create API Key**, give it
   any name, copy the key (starts with `gsk_`).
3. That's it, genuinely free within generous rate limits, no billing
   step at all.

Full click-by-click version of this whole section, including
deployment: `AI_SETUP_BABY_STEPS.md`.

Keep that key somewhere safe for step 4.

---

## Step 4: deploy the two Edge Functions (AI assistant + daily digest)

Edge Functions are small pieces of server code that live on Supabase's
servers, not in your website's files, this is the one part of this
whole update that needs a terminal and the Supabase CLI rather than just
pasting into a dashboard.

### 4a. Install the Supabase CLI (one-time)

In the same terminal from `GITHUB_PUSH_GUIDE.md`, run:

```
npm install -g supabase
```

(If you don't have `npm`, that means Node.js isn't installed, grab it
from https://nodejs.org first, the "LTS" version, then retry the command
above.)

### 4b. Log in and link your project

```
supabase login
```

This opens a browser tab to authorize, approve it.

```
cd path/to/your/boardly/folder
supabase link --project-ref YOUR_PROJECT_REF
```

Your project ref is the random string in your Supabase project's URL,
e.g. if your dashboard URL is
`https://supabase.com/dashboard/project/cafhqxzjujvxmarvkbxd`, your ref
is `cafhqxzjujvxmarvkbxd`.

### 4c. Set your secrets

```
supabase secrets set GROQ_API_KEY=gsk_your-key-here
```

(For the daily digest, also do step 4e's Resend key before deploying
that one, or come back and add it after.)

### 4d. Deploy the AI assistant

```
supabase functions deploy board-assistant
```

**Already did this once before?** Run that same command again any time
the assistant's code changes (like when it learns a new capability) -
it's the same one-line deploy, just rerun it, no need to repeat steps
4a-4c.

That's the whole thing, the "Ask AI" panel on your dashboard will now
work. Open your board, click **Ask AI** in the toolbar, and try "what's
overdue".

### 4e. Set up the daily digest email (optional, more involved)

This one sends you a real email every morning summarizing what's due.
It needs a second free account:

1. Go to https://resend.com, sign up (free tier is generous for
   personal use).
2. Verify a sending domain, or use their default test domain to start.
3. Get an API key from their dashboard (starts with `re_`).
4. Back in your terminal:
   ```
   supabase secrets set RESEND_API_KEY=re_your_key_here
   supabase functions deploy daily-digest
   ```
5. Open `supabase/functions/daily-digest/index.ts`, find this line near
   the bottom:
   ```
   from: "Boardly <digest@yourdomain.com>",
   ```
   Change `yourdomain.com` to a domain you verified in Resend, then
   redeploy: `supabase functions deploy daily-digest`

6. **Schedule it to run every morning:** in your Supabase dashboard, go
   to **Edge Functions, daily-digest, Cron**, and add a schedule like
   `0 7 * * *` (7am every day, in UTC, adjust for your timezone). If you
   don't see a Cron tab, Supabase also supports scheduling through the
   `pg_cron` extension from the SQL editor, their docs at
   https://supabase.com/docs/guides/functions/schedule-functions walk
   through both options.

If you skip this whole step, everything else still works fine, the
board's own "due-today" browser notification already covers the same
need without any server setup at all.

---

## Step 5: push it all to GitHub

Once steps 1-4 are done (or you've decided to skip the optional email
digest), follow `GITHUB_PUSH_GUIDE.md` exactly like before: `git add .`,
`git commit -m "..."`, `git push`.

---

## A quick note on what needs what

| Feature | Needs step 1 | Needs step 2 | Needs steps 3-4 |
|---|---|---|---|
| Multiple boards | Yes | | |
| Realtime sync | Yes | | |
| Checklists / subtasks | Yes | | |
| Recurring tasks | Yes | | |
| Swipe gestures | | | |
| Offline queue | | | |
| Public share links | Yes | | |
| File attachments | Yes | Yes | |
| AI board assistant | Yes | | Yes (4d) |
| AI daily digest email | Yes | | Yes (4e) |

So realistically: run step 1, you get 7 features immediately. Step 2
adds attachments. Steps 3-4d add the AI chat panel. Step 4e (the email
digest) is the one genuinely optional, more involved piece, skip it if
you want, everything else stands on its own.
