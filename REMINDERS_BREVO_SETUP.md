# Turn on Boardly reminders — ultra baby steps

This update has two reminder types:

1. **Browser reminders** — free and ready now. They work while Boardly is open
   in a browser or installed as an app.
2. **Email reminders** — also usable on a free plan, and work even when Boardly
   is closed. They need one free Brevo account and a Supabase scheduled job.

## A. Turn on browser reminders now

1. Push the latest Boardly files to GitHub and wait for the website to update.
2. Open Boardly on your phone or computer.
3. Tap the little bell icon in the toolbar.
4. When your browser asks “Allow notifications?”, tap **Allow**.
5. Open a ticket by tapping its title.
6. Under the due date you will see **Remind me at**.
7. Choose a time two or three minutes in the future.
8. Tap **Save changes**.
9. Keep Boardly open. At that time you should see “Boardly reminder”.

If the reminder field is missing, do section B first.

## B. Add the reminder fields to Supabase

1. Go to <https://supabase.com/dashboard> and sign in.
2. Open your Boardly project.
3. In the left menu, click **SQL Editor**.
4. Click **New query**.
5. On your computer, open `supabase/schema_v3_reminders.sql` from the Boardly
   project folder.
6. Press `Ctrl + A`, then `Ctrl + C` to copy all of it.
7. Click inside Supabase’s big editor box and press `Ctrl + V`.
8. Click **Run**.
9. You want to see a success message. Do not run this repeatedly; once is enough.
10. Go back to Boardly and refresh the page.

## C. Make a free Brevo email account

Brevo currently advertises a free plan with up to 300 emails per day. It is a
good fit for personal task reminders.

1. Go to <https://www.brevo.com/> and create a free account.
2. Verify your own email address when Brevo asks.
3. In Brevo, add and verify a sender. Use an email address you own. Write that
   exact email down; it will become `BREVO_SENDER_EMAIL`.
4. In Brevo, find **SMTP & API** or **API Keys**.
5. Click **Generate a new API key**. Name it `Boardly`.
6. Copy the key immediately. Treat it like a password. Never put it in
   `dashboard.js`, GitHub, or a screenshot.

## D. Deploy the email reminder worker

You need Node.js LTS and the Supabase command-line tool once. Open Git Bash in
your Boardly folder.

1. Install the Supabase tool:

```bash
npm install -g supabase
```

2. Log in:

```bash
supabase login
```

3. Link your Boardly folder to your Supabase project. In your project URL,
the part after `/project/` is the project reference:

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

4. Make a long private password for the scheduler. Example only (make your own):
`a-long-random-secret-you-do-not-share`

5. Add the three secrets. Replace every value after `=` with your own:

```bash
supabase secrets set BREVO_API_KEY=your_brevo_key_here
supabase secrets set BREVO_SENDER_EMAIL=you@example.com
supabase secrets set CRON_SECRET=your_long_random_secret
```

6. Deploy the function:

```bash
supabase functions deploy send-reminders --no-verify-jwt
```

## E. Schedule it every five minutes

The function only sends email after a scheduled job calls it.

1. In Supabase, open **Edge Functions** and click `send-reminders`.
2. Open the **Cron** or scheduling area. If your dashboard does not show it,
use Supabase’s scheduled-function documentation to create a `pg_cron` +
`pg_net` schedule.
3. Create a schedule for every five minutes: `*/5 * * * *`.
4. Make an HTTP `POST` request to:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-reminders
```

5. Add this request header:

```text
Authorization: Bearer YOUR_CRON_SECRET
```

6. Save the schedule.

## F. Test email reminders safely

1. Set one reminder for ten minutes from now.
2. Save the ticket.
3. Close Boardly completely.
4. Wait up to five extra minutes because the schedule checks every five minutes.
5. Check your inbox and spam folder.

Each ticket receives only one email. Completing a ticket before the scheduled
time prevents its email.

## If something fails

- **No reminder field:** the SQL migration in section B was not run, or you
  need to refresh Boardly.
- **No browser pop-up:** tap the bell again, then allow notifications in your
  phone/browser settings.
- **No email:** check the Edge Function logs in Supabase. The usual causes are
  an unverified Brevo sender, incorrect Brevo API key, or a missing Cron header.
- **Brevo says sender rejected:** use exactly the verified sender email from
  Brevo.
