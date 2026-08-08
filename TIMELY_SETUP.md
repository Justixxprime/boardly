# Setting up Timely (real alerts, timezones, auto-advance)

This adds three things on top of your existing setup:

1. **Real alerts** - a loud in-app alarm (siren, works while Boardly's
   open) plus real push notifications that arrive even if the tab/app is
   closed.
2. **Timezone-correct scheduling** - reminders and auto-move times are
   pinned to a real IANA timezone (e.g. `America/New_York`), not just
   whatever zone your browser happens to be in.
3. **Auto-advance** - tickets move To do → In progress → Done on their
   own, on a schedule you set, even with the app closed.

Read this once, honestly: **a website cannot override your phone's
silent mode or Do Not Disturb** - that's an OS-level restriction, not
something any web app (Boardly included) can bypass. What this setup
gets you is as close as a website can get: a loud alarm while the app is
open, and a real, persistent push notification (with sound, if your OS
allows it for the browser) even when it's closed. If you need a
guaranteed can't-miss wake-up, keep a native phone alarm as backup for
anything truly critical - Boardly can remind you, but it can't ring like
a dedicated alarm clock app can.

Requires `schema_v2.sql` already run (see `FEATURES_V2_SETUP.md`). Do
these in order.

---

## Step 1: run the Timely database migration

1. Supabase dashboard → your `boardly` project → **SQL Editor** → **New query**.
2. Open `supabase/schema_v4_timely.sql`, copy the whole file, paste it in, click **Run**.
3. "Success. No rows returned." - done. This adds `timezone`,
   `auto_start_at`, `auto_done_at`, `auto_duration_minutes`,
   `alarm_sound`, and the snooze/missed-alarm tracking columns to
   `tasks`, plus a new `push_subscriptions` table.

**What this unlocks immediately, no further setup:** the loud in-app
alarm, timezone-correct reminders, the "you missed this" catch-up
banner, snooze, and the auto-move fields in the edit screen (client-side
auto-move works right away too, while the app is open).

---

## Step 2: generate your VAPID keys (for real push)

VAPID keys let your server prove to browsers' push services that pushes
are really coming from you. Free, no account needed beyond what you
already have.

In any terminal with Node installed:

```
npx web-push generate-vapid-keys
```

It prints a Public Key and a Private Key. Copy both - you'll paste the
public one into your code and both into Supabase secrets.

1. Open `js/timely.js` in your repo, find this near the top:
   ```
   const VAPID_PUBLIC_KEY = "PASTE_YOUR_VAPID_PUBLIC_KEY_HERE";
   ```
   Replace it with your public key, save, commit, push (same
   `GITHUB_PUSH_GUIDE.md` flow you already use).

2. Set the secrets (same terminal you used for the AI setup in
   `FEATURES_V2_SETUP.md` step 4):
   ```
   supabase secrets set VAPID_PUBLIC_KEY=<your public key>
   supabase secrets set VAPID_PRIVATE_KEY=<your private key>
   supabase secrets set VAPID_SUBJECT=mailto:you@example.com
   supabase secrets set CRON_SECRET=<make up any random long string>
   ```

---

## Step 3: deploy the two new Edge Functions

```
supabase functions deploy send-push
supabase functions deploy auto-advance
```

---

## Step 4: schedule both to run every minute

Supabase dashboard → **Edge Functions** → **Cron** (or **Database** →
**Cron Jobs**, depending on your project's Supabase version) → **Create
a new cron job**, once for each function:

- Schedule: `* * * * *` (every minute)
- URL: `https://<your-project-ref>.supabase.co/functions/v1/send-push`
  (and the same with `/auto-advance` for the second job)
- Header: `Authorization: Bearer <the CRON_SECRET you set in step 2>`

If your project's dashboard doesn't have a cron UI yet, `pg_cron` +
`pg_net` works too - ask in the Supabase dashboard's SQL editor for
`select cron.schedule(...)` syntax, or just re-run the two functions
manually while testing.

---

## Step 5: turn on alerts on each device

Open any ticket with a reminder set → **Turn on real alerts for this
device** near the bottom of the edit screen → allow notifications when
your browser asks. Do this on every phone/laptop you want to be woken up
on - it's per-device on purpose, same as any other app's notification
settings.

---

## Using it

- **Timezone**: pick it in the edit screen, right under the reminder
  field. "Wake me up at 12:30am USA time every weekday" now means what
  it says - pick `America/New_York` (or whichever), the app converts it
  correctly including DST, no matter where you open Boardly from.
- **Auto-move**: set "Auto-move to In progress at" and either a duration
  or a fixed "Done" time. It fires client-side instantly if the app's
  open, and server-side within a minute either way.
- **Snooze**: tap Snooze on the alarm or the push notification itself -
  fires again in 10 minutes.
- **Missed alerts**: if you were away when one fired, a banner shows up
  next time you open Boardly.

## Troubleshooting

- **No sound, tab open, reminder time passed**: check the browser tab
  wasn't asleep/discarded (mobile Safari/Chrome do this aggressively to
  save battery) - this is exactly the case Web Push (steps 2-4) is for.
- **No push at all**: check `supabase functions logs send-push` for the
  actual error - almost always a missing/mismatched secret.
- **"Attachments aren't set up yet" when uploading a file**: that's
  `FEATURES_V2_SETUP.md` step 2 (the storage bucket), not a Timely
  thing - the app now tells you this directly instead of a generic
  error.
- **"Row-level security policy" error uploading an attachment**: run
  `schema_v4_timely.sql` (or re-run it) - the fix is in that file's last
  section, it adds the storage upload policy the bucket never had.

## Step 6: the "Timely+" extras (escalation, SMS fallback, etc)

1. Run `supabase/schema_v5_timely_plus.sql` in the SQL Editor, same as step 1.
2. For the SMS fallback specifically, sign up for Twilio (free trial works
   for testing), buy/get a number, then:
   ```
   supabase secrets set TWILIO_ACCOUNT_SID=<your account sid>
   supabase secrets set TWILIO_AUTH_TOKEN=<your auth token>
   supabase secrets set TWILIO_FROM_NUMBER=<your twilio number>
   supabase functions deploy send-critical-sms
   ```
   Schedule it every minute, same as the other two functions (step 4).
   On a Twilio trial account you must verify each destination phone
   number in the Twilio console before it'll actually deliver to it.
3. Everything else (escalating pushes, ICS export, recurring templates,
   missed-alert log, per-category alarm sounds, auto-start-when-due) just
   works once the SQL's run - no extra secrets needed.

### What's new to use

- **Escalating alerts**: nothing to turn on - if you don't dismiss an
  alarm, it re-pushes every 5 minutes, up to 5 times.
- **Add to Calendar**: in the edit screen, once a reminder's set,
  downloads a `.ics` file - open it to add that reminder to your phone's
  native calendar app too, which can alert through silent mode the way a
  website never can.
- **Recurring templates**: set a ticket's auto-move start time, then
  "Save as template" in the edit screen. Use it later from the Templates
  dropdown - it recreates the ticket with that same start time, today or
  tomorrow depending which hasn't passed yet.
- **Missed alerts log**: More menu → "Missed alerts".
- **Alarm sound by category**: More menu → "Alarm sound by category".
- **Auto-start tickets when due**: More menu checkbox - opt-in, off by
  default. Once on, any ticket with a due date (not just an explicit
  auto-move time) starts itself the moment that date arrives, both while
  the app's open and via the server cron.
- **Critical + SMS**: tick "Critical" in the edit screen, it'll ask for
  your phone number once. If a critical ticket's push alert goes
  unacknowledged for 3+ minutes, you get one text.

## Step 7: the visual upgrades (v6)

1. Run `supabase/schema_v6_visual.sql` in the SQL Editor.
2. No secrets, no edge functions - everything's client-side.

### What's new

- **Inline edit**: click any card's title to edit it right there, Enter
  saves, Escape cancels.
- **Time-in-column badge**: a small ⏳ + duration on every card not in
  Done, showing how long it's been sitting in its current column.
- **Swimlanes**: new toolbar button next to the density toggle - groups
  each column's cards into bands by category.
- **Density**: the existing compact/comfortable toggle now cycles through
  a 3rd "detailed" state too (bigger cards, more breathing room).
- **Column style**: More menu → "Column style" - custom color + icon per
  column, saved per board.
- **Drag-to-reschedule**: in Calendar view, drag a ticket chip onto a
  different day.
- **Streak + Activity**: a 🔥-streak pill appears in the toolbar once
  you've completed something 2+ days running - click it for a 14-day bar
  chart and a ~13-week activity heatmap.
- **Sunset-based dark mode**: More menu checkbox, opt-in - asks for your
  location once, then switches dark/light automatically around real
  sunrise/sunset instead of a fixed time.

Note: focus mode (the "Focus this column" buttons) and the original
2-state density toggle already existed in the app before any of this -
not something newly added here.
