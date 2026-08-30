# Setting up Boardly Video Workrooms

Boardly uses **Daily** for real browser-based video calls. Daily is
free to start and includes 10,000 participant-minutes each month.
Boardly creates private rooms that expire after eight hours; invitees
receive an expiring access link, while the Daily API key remains on
your Supabase server.

## 1. Create a free Daily account

1. Sign up at https://www.daily.co/.
2. In the Daily dashboard, open **Developers** and create an API key.
3. Copy the key. Do not put it in any HTML or JavaScript file.

## 2. Run the database migration

In Supabase, open **SQL Editor**, create a new query, paste the full
contents of `supabase/schema_v34_video_workrooms.sql`, and run it.

## 3. Add the secrets and deploy

Run these commands from the Boardly project directory:

```powershell
supabase secrets set DAILY_API_KEY=your_daily_api_key
supabase secrets set PUBLIC_APP_URL=https://justixxprime.github.io/boardly
supabase functions deploy video-workroom --no-verify-jwt
```

Set `PUBLIC_APP_URL` to the exact public base URL where your Boardly
files are deployed. The guest invitation page must be public, while
the dashboard and room creation remain authenticated.

## 4. Test it

1. Sign into Boardly and open any ticket.
2. Select **Start** in **Video workroom**.
3. Allow camera and microphone access in Daily's pre-join screen.
4. Use **Copy invite** and open that link in an incognito window.
5. Enter a guest name and confirm both windows join the same call.

## Important limits

- Each workroom expires eight hours after it is created.
- Anyone with an invite link can join before it expires, so send
  invites only to intended participants.
- Recording is intentionally not enabled. It adds cost and requires a
  separate retention/privacy decision.
