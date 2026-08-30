# Setting up Google Calendar sync

Everything code-side is already built and ready. There's exactly one
thing only you can do, because it means creating something in your own
Google account - I can't do this step for you, no one else can either.

**What this feature does once it's set up:** connect your Google
account once in Settings, and from then on, any ticket with a due date
automatically gets a matching event on your real Google Calendar - and
stays updated if you change the due date, and gets removed if you
delete the ticket or clear its due date.

---

## Step 1: create a Google Cloud project (free, about 3 minutes)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
   and sign in with your Google account.
2. Top left, click the project dropdown → **New Project**.
3. Name it anything (e.g. "Boardly") → **Create**.
4. Make sure that new project is selected (check the dropdown at the
   top again).

## Step 2: turn on the Calendar API

1. In the search bar at the top, type **Google Calendar API** and
   open it.
2. Click **Enable**.

## Step 3: set up the consent screen

1. Left sidebar → **APIs & Services** → **OAuth consent screen**.
2. User type: **External** → Create.
3. App name: "Boardly" (or anything). Fill in your email where asked.
   Skip everything optional.
4. On the "Scopes" step, click **Add or remove scopes**, search for
   "Calendar", and check the box for
   `.../auth/calendar.events` → Update → Save and continue.
5. On the "Test users" step, add your own Google email address → Save
   and continue.

(Your app will stay in "Testing" mode, which is completely fine - it
just means only the test users you added can use it, which for a
personal or small-team tool is exactly what you want.)

## Step 4: create the OAuth credentials

1. Left sidebar → **APIs & Services** → **Credentials**.
2. **Create Credentials** → **OAuth client ID**.
3. Application type: **Web application**.
4. Under **Authorized redirect URIs**, click **Add URI** and paste
   this, replacing `YOUR_PROJECT` with your actual Supabase project ID
   (the same one in your other Edge Function URLs):

   ```
   https://YOUR_PROJECT.supabase.co/functions/v1/google-oauth-callback
   ```

5. Click **Create**. A box pops up with a **Client ID** and **Client
   secret** - keep this box open, you need both in the next two steps.

## Step 5: add the two secrets to Supabase

Supabase dashboard → your project → **Edge Functions** → **Manage
secrets** (or Settings → Edge Functions, depending on the current
Supabase layout) → add:

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | the Client ID from step 4 |
| `GOOGLE_CLIENT_SECRET` | the Client secret from step 4 |
| `GOOGLE_REDIRECT_URI` | the exact same URL you pasted in step 4 |

## Step 6: put the Client ID in one place in the code

Open `js/settings.js`, find this line (search for
`YOUR_GOOGLE_CLIENT_ID_HERE`):

```js
const clientId = "YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com";
```

Replace it with your real Client ID from step 4. This one is safe to
put directly in the file - a Client ID is meant to be public, it's the
same one visible in the URL of every "Sign in with Google" button on
the web. The Client **Secret** is the one that must stay private,
and that one only ever goes in Supabase's secrets (step 5), never in
this file.

## Step 7: run the database migration

Supabase dashboard → SQL Editor → New query → paste the whole contents
of `supabase/schema_v21_google_calendar.sql` → Run.

## Step 8: deploy both Edge Functions

```
supabase functions deploy google-oauth-callback --no-verify-jwt
supabase functions deploy sync-task-to-google-calendar
```

The first one needs `--no-verify-jwt` because Google redirects the
browser to it directly - there's no normal Boardly login token
attached to that specific request, so it can't be checked the usual
way (the code itself still safely verifies who's connecting, just
using a different method - see the comment at the top of that file).

## Step 9: try it

1. Open Boardly → Settings → Integrations → **Connect** next to
   Google Calendar.
2. Sign in and approve access.
3. You'll land back on Settings saying "Connected."
4. Add or edit a ticket with a due date → check your real Google
   Calendar → the event should appear within a few seconds.

## What this does not do yet

- One-way only: Boardly → Google. Creating an event directly in Google
  Calendar does not create a ticket in Boardly. Two-way sync is a
  reasonable future step, not built here.
- Due dates only, not specific times - Boardly tickets don't currently
  have a time of day, only a date, so events are created as all-day
  events.
- One calendar connection per person, always their main ("primary")
  Google Calendar.
