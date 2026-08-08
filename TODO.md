# Boardly - one setup checklist (do this top to bottom)

Everything from the recent upgrades, in the order to actually do it.
Check items off as you go. Nothing else to read - this replaces jumping
between the other setup docs.

## 1. Get the code in

- [ ] Unzip `boardly-timely-update.zip`
- [ ] Copy every file into your GitHub repo, overwriting existing ones
      (`dashboard.html`, `sw.js`, `css/style.css`, `js/dashboard.js`) and
      adding the new ones (`js/timely.js`, `js/visual.js`, the
      `supabase/schema_v*.sql` files, the `supabase/functions/*` folders)
- [ ] Commit and push

## 2. Run the SQL migrations, in this order

Supabase dashboard → your project → **SQL Editor** → **New query**,
paste, **Run**, repeat for each file. Each should say "Success. No rows
returned." Safe to re-run any of them.

- [ ] `supabase/schema_v4_timely.sql` - timezones, auto-move, alarms,
      push table, **and the fix for the attachment upload RLS error**
- [ ] `supabase/schema_v5_timely_plus.sql` - escalating alerts, critical
      tickets, SMS fallback support
- [ ] `supabase/schema_v6_visual.sql` - time-in-column, streaks, activity

## 3. Reload the app

- [ ] If it's on your iPhone home screen: fully close it (swipe away in
      the app switcher) and reopen from the home screen icon, so it
      picks up the new `sw.js` instead of a cached old version
- [ ] On desktop: hard refresh (Ctrl/Cmd+Shift+R)

## 4. Test what already works - no further setup needed

- [ ] Edit a ticket: timezone picker, auto-move start time, alarm sound
- [ ] Upload an attachment (this is the one that was failing before -
      confirm it works now)
- [ ] Mark a ticket Critical (it'll ask for your phone number once - fine
      to give a real one now, texting won't actually happen until step 6)
- [ ] Ask the AI assistant to add a few tasks - confirm it actually
      creates them, not just talks about it
- [ ] Click a card's title - confirm it edits in place
- [ ] Calendar view: drag a ticket chip to a different day
- [ ] Toolbar: try the swimlanes button and the density button (cycles
      3 states now)
- [ ] More menu: "Column style", "Missed alerts", "Alarm sound by
      category"
- [ ] Complete a couple of tickets, then check for the 🔥 streak pill in
      the toolbar
- [ ] Set a reminder 1-2 minutes out, **keep the app open on screen**,
      confirm the full-screen siren fires with actual sound (this is the
      fix from last time - tap anywhere in the app once first, then test)

## 5. iOS-specific reminders while testing

- [ ] Push permission ("Turn on real alerts") must be tapped from the
      **home-screen icon**, not a Safari tab, or iOS won't allow it
- [ ] Vibration won't happen - iOS Safari doesn't support it, that's
      expected, not a bug
- [ ] The in-app alarm only works while the app is actually open on
      screen - once you leave it or it's backgrounded, iOS stops its
      JavaScript entirely. Step 6 (push) is what covers you the rest of
      the time - do it soon, don't rely on the in-app alarm alone

## 6. Turn on real push + auto-advance (do this soon, not optional for how you're using it)

- [ ] Generate keys: `npx web-push generate-vapid-keys`
- [ ] Paste the public key into `js/timely.js`, replacing
      `PASTE_YOUR_VAPID_PUBLIC_KEY_HERE`, commit + push
- [ ] Set secrets:
      ```
      supabase secrets set VAPID_PUBLIC_KEY=<public key>
      supabase secrets set VAPID_PRIVATE_KEY=<private key>
      supabase secrets set VAPID_SUBJECT=mailto:you@example.com
      supabase secrets set CRON_SECRET=<make up a random string>
      ```
- [ ] Deploy:
      ```
      supabase functions deploy send-push
      supabase functions deploy auto-advance
      ```
- [ ] Schedule both to run every minute (Supabase dashboard → Edge
      Functions → Cron, or Database → Cron Jobs): schedule `* * * * *`,
      header `Authorization: Bearer <your CRON_SECRET>`
- [ ] On the iPhone home-screen app, tap "Turn on real alerts for this
      device" on any ticket with a reminder
- [ ] Test: set a reminder 2 minutes out, **close the app fully**, wait -
      confirm a push notification actually arrives

## 7. Optional: SMS fallback for Critical tickets

- [ ] Sign up for Twilio (free trial is fine to test), get a number
- [ ] On a trial account, verify your own phone number in the Twilio
      console first, or it won't deliver
- [ ] ```
      supabase secrets set TWILIO_ACCOUNT_SID=<sid>
      supabase secrets set TWILIO_AUTH_TOKEN=<token>
      supabase secrets set TWILIO_FROM_NUMBER=<your twilio number>
      supabase functions deploy send-critical-sms
      ```
- [ ] Schedule it every minute too, same as step 6
- [ ] Test: mark a ticket Critical, let its reminder go unacknowledged
      for 3+ minutes with the app closed, confirm a text arrives

## If something breaks

- Attachment RLS error → step 2 wasn't run yet (or failed partway - check
  the SQL Editor's output for the actual error and tell me what it says)
- No push at all → `supabase functions logs send-push` in a terminal,
  tell me the actual error line
- No sound from the in-app alarm → make sure you tapped anywhere in the
  app at least once before the reminder fired
- Anything else → tell me exactly what you did and what happened instead
  of what you expected, and I'll fix it
