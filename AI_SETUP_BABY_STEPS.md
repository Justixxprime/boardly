# Setting up the AI stuff, in ultra baby steps

This covers just the two AI features: the "Ask AI" panel on your board,
and the optional daily digest email. Do "Part A" first, always, it's
required for both. "Part B" is the AI chat panel. "Part C" (the email)
is optional and more involved, do it last, or skip it entirely.

You need the database migration from `FEATURES_V2_SETUP.md` Step 1
already done before starting this. If you haven't run that yet, go do
that first, then come back here.

---

## Part A: get a free Groq API key

Groq (not to be confused with a similarly-named social network) runs
open AI models fast, and their API has a genuinely free tier, no credit
card required.

1. Go to https://console.groq.com in your browser.
2. Click **Sign up** (or log in with Google/GitHub, whichever is
   fastest for you). No card, no payment info anywhere in this flow.
3. Once logged in, look at the left sidebar, click **API Keys**.
4. Click **Create API Key**.
5. Give it any name, e.g. `boardly`, click **Submit**.
6. A key appears on screen, starting with `gsk_`. **Copy it right now**
   and paste it into a Notes app or anywhere temporary, you can't see it
   again after leaving this page.
7. That's it, no billing step, no card, genuinely free within their
   generous rate limits, which are far more than one person's board
   will ever use.

You now have a key that looks like `gsk_abc123...`. Keep that tab open
or the text saved somewhere, you'll paste it in Part B.

---

## Part B: turn on the "Ask AI" panel

This part needs a terminal (the same black/white text window from
`GITHUB_PUSH_GUIDE.md`). If you closed it, reopen Git Bash (Windows) or
Terminal (Mac).

### B1. Install one more tool: the Supabase CLI

Type this and press Enter:

```
npm install -g supabase
```

Wait for it to finish, it'll print a bunch of text then return you to a
normal prompt. If it says `command not found: npm`, that means Node.js
isn't installed, go to https://nodejs.org, download the button that
says **LTS**, install it with all default options, close and reopen
your terminal, then try the `npm install` line again.

### B2. Get into your project folder

Same as always:

```
cd 
```
(type `cd` with a space after it, then drag your `boardly` folder into
the terminal window, then press Enter)

### B3. Log in to Supabase from the terminal

```
supabase login
```

Your browser will open asking you to authorize. Click **Authorize**. Come
back to the terminal, it should say you're logged in.

### B4. Connect the terminal to your specific Supabase project

You need your project's "reference ID" first:

1. Go to https://supabase.com/dashboard and open your `boardly` project.
2. Look at the address bar at the top of your browser. It looks like:
   `https://supabase.com/dashboard/project/cafhqxzjujvxmarvkbxd`
3. The random letters/numbers after the last `/` are your project ref.
   Copy just that part (in the example above, `cafhqxzjujvxmarvkbxd`).

Back in the terminal, type this, but replace the end with your own ref:

```
supabase link --project-ref cafhqxzjujvxmarvkbxd
```

Press Enter. It may ask for a database password, this is the password
you set when you first created the Supabase project (not your email
password). If you don't remember it, in the Supabase dashboard go to
**Project Settings, Database** and click **Reset database password**.

### B5. Give it your Groq key from Part A

Type this, replacing the key with the one you copied earlier:

```
supabase secrets set GROQ_API_KEY=gsk_your-real-key-here
```

Press Enter. No news is good news, it should just return you to a
normal prompt with no error.

### B6. Deploy the function

Type:

```
supabase functions deploy board-assistant
```

Press Enter. This uploads the code and takes maybe 10-30 seconds.
You'll see a checkmark and a URL when it's done.

### B7. Test it

1. Open your live Boardly site, go to the dashboard, log in.
2. Click **Ask AI** in the toolbar (the sparkle icon button).
3. Type: `what's overdue`
4. Press Enter or tap the arrow button.

If it replies with something sensible about your tasks, you're done, it
works. If you get an error message, see "Troubleshooting" at the bottom.

---

## Part C (optional): daily digest email

Skip this whole part if you don't want a scheduled email, it doesn't
affect anything else, the AI chat panel from Part B works completely
on its own.

**Good news for your situation:** since this digest is only ever going
to your own inbox (not random visitors), you don't need to buy a
domain at all. Resend lets anyone send email from their own shared test
address straight to whichever email address owns the Resend account,
no verification needed for that specific case. As long as you sign up
to Resend using the same Gmail address your Boardly account uses, this
just works.

### C1. Create a free Resend account with your Gmail

1. Go to https://resend.com, click **Sign up**.
2. Sign up using the **exact same Gmail address** you use to log into
   Boardly. This part matters, mismatched addresses are the one thing
   that will stop this from working.
3. Verify your email (check your Gmail inbox for their confirmation
   link, click it).
4. Once inside, on the left sidebar click **API Keys**.
5. Click **Create API Key**, name it `boardly`, click **Add**.
6. Copy the key, it starts with `re_`.

### C2. Give the terminal your Resend key

Same terminal, same project folder:

```
supabase secrets set RESEND_API_KEY=re_your_real_key_here
```

### C3. Deploy

The code already defaults to Resend's free shared sending address, you
don't need to edit any file for this part. Just deploy:

```
supabase functions deploy daily-digest
```

### C4. Test it right now, don't wait for tomorrow morning

```
supabase functions invoke daily-digest
```

Check your Gmail inbox (and spam folder, first-time senders sometimes
land there). If you have a task due today or overdue, an email should
arrive within a minute or two, from "Boardly onboarding@resend.dev".

**If it doesn't arrive:** the single most common cause is the Gmail
address on your Boardly/Supabase account not exactly matching the
address you signed up to Resend with. Double check both, they need to
be identical.

**If you ever want a nicer "from" address later** (like
`digest@yourname.com` instead of Resend's shared one), that's when
you'd buy a domain and verify it in Resend's dashboard, then update the
`from:` line in `supabase/functions/daily-digest/index.ts` and
redeploy. Entirely optional, the free path above works fine forever
for a personal digest to yourself.

### C5. Schedule it to run every morning

1. Go to your Supabase dashboard, click **Edge Functions** in the
   sidebar.
2. Click on `daily-digest`.
3. Look for a **Cron** or **Schedule** tab (Supabase has been adding
   this directly in the dashboard). If you see it:
   - Click **Add schedule**.
   - Enter `0 7 * * *` (this means "every day at 7:00 AM UTC", adjust
     the first number for your timezone, e.g. `0 12 * * *` for 7am US
     Eastern during standard time).
   - Save.
4. **If there's no Cron tab yet** in your version of the dashboard, use
   the SQL Editor instead, paste this (it does the same thing via the
   `pg_cron` extension):
   ```sql
   select cron.schedule(
     'boardly-daily-digest',
     '0 7 * * *',
     $$
     select net.http_post(
       url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-digest',
       headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
     );
     $$
   );
   ```
   Replace `YOUR_PROJECT_REF` with the same ref from step B4, and
   `YOUR_SERVICE_ROLE_KEY` with the key from **Project Settings, API,
   service_role key** (careful, this key is powerful, never put it
   anywhere public, only in this one SQL command in your own dashboard).

Check the email inbox for whichever account has a task due today or
overdue. If nothing arrives and you had a due task, see
"Troubleshooting" below.

---

## Troubleshooting

- **"command not found: supabase"**: the install in B1 didn't finish
  or didn't add itself to your PATH. Close the terminal fully, reopen
  it, try `supabase --version` to check.
- **"Ask AI" panel says "the assistant isn't set up yet"**: the
  `GROQ_API_KEY` secret (step B5) either wasn't set or has a typo.
  Run `supabase secrets list` to see what's currently set, without
  showing the actual key value.
- **Ask AI gives a reply but it's clearly guessing / not about your real
  tasks**: double check you're on the right board (the AI only sees
  whichever board is currently open on your screen).
- **Daily digest never arrives**: most common cause is your Boardly
  account's email not exactly matching the Gmail address you signed up
  to Resend with, see step C1's note about that. Check Resend's
  dashboard, **Logs**, it shows every send attempt and the exact reason
  if one failed, that's the fastest way to see what actually happened.
- **Anything else**: copy the exact error text (from the terminal, or
  from Resend's Logs page) and send it to me, I can tell you exactly
  what it means and what to change.
