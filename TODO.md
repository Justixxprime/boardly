# Boardly - the ONE to-do list (ultra baby steps)

This is everything from the last several updates, explained click by
click, in the order to actually do it. You don't need to open any other
`.md` file in this repo - if this one says to do something, it tells you
exactly how, right here.

Work top to bottom. Don't skip ahead. Check each box in your head (or
literally, if you're reading this in a markdown viewer) before moving on.

---

## Before you start: what you need open

1. **A terminal.** This is a plain text window where you type commands
   and press Enter.
   - **Mac:** press Cmd+Space, type "Terminal", press Enter.
   - **Windows:** search your Start menu for "Git Bash" (you'll have this
     if you've ever installed Git for Windows). If you don't see it,
     go to https://git-scm.com/downloads, download it, install with all
     default options, then open "Git Bash" from the Start menu.
2. **Your `boardly` project folder** - the one connected to your GitHub
   repo and your Supabase project. If you're not sure where it lives on
   your computer, open your terminal and type `pwd` then Enter - if it
   doesn't say `.../boardly`, you need to navigate there first (type
   `cd ` with a space, then drag the `boardly` folder from your file
   explorer/Finder into the terminal window, then press Enter).
3. **A browser tab open to** https://supabase.com/dashboard, logged in,
   with your `boardly` project open.

Keep all of this open the whole way through - you'll bounce between the
terminal and the Supabase dashboard a lot.

---

## STEP 1 - Get the new code into your project folder

1. Download `boardly-timely-update.zip` (the file I gave you) if you
   haven't already, and unzip it. On Mac, double-click it. On Windows,
   right-click → "Extract All".
2. You'll get a folder called `boardly` with everything inside it -
   `dashboard.html`, a `js` folder, a `supabase` folder, etc.
3. Copy every single file and folder from that unzipped `boardly` folder
   into your real project folder (the one from "Before you start" #2),
   **overwriting** anything with the same name when your computer asks.
   This replaces `dashboard.html`, `sw.js`, `css/style.css`, and
   `js/dashboard.js` with updated versions, and adds brand-new files like
   `js/timely.js`, `js/visual.js`, and everything under `supabase/`.

---

## STEP 2 - Push that to GitHub

In your terminal (making sure it's sitting inside the `boardly` folder -
check with `pwd` if unsure):

1. Type this and press Enter, to see what changed:
   ```
   git status
   ```
   You'll see a list of file names, mostly in red (changed) or with
   "new file" next to them. That's expected - that's everything we just
   copied in.

2. Type this and press Enter, to stage all of it:
   ```
   git add .
   ```
   (That's `git add`, then a space, then a single period. The period
   means "everything in this folder".)

3. Type this and press Enter, to describe the change:
   ```
   git commit -m "Add Timely and visual upgrades"
   ```

4. Type this and press Enter, to actually send it up to GitHub:
   ```
   git push
   ```
   It'll show some progress text and finish. That's it - your live
   website (wherever it's hosted from your GitHub repo) now has the new
   code, though a couple of pieces still need switching on below.

---

## STEP 3 - Run the 3 database updates

Switch to your browser tab with the Supabase dashboard open.

1. Click **SQL Editor** in the left sidebar.
2. Click **New query** (top of the page).
3. Now go find the file `supabase/schema_v4_timely.sql` inside your
   project folder, open it in any text editor (Notepad, TextEdit, VS
   Code, whatever you have), and select-all + copy its entire contents.
4. Click back into the Supabase SQL Editor tab, click inside the empty
   query box, and paste (Cmd+V or Ctrl+V).
5. Click the **Run** button (usually bottom-right of that box, or
   Cmd/Ctrl+Enter).
6. You should see a message like "Success. No rows returned." at the
   bottom. That means it worked. **This is also what fixes the
   "row-level security policy" attachment upload error you hit earlier.**
7. Click **New query** again for a fresh blank box.
8. Repeat steps 3-6, but this time with `supabase/schema_v5_timely_plus.sql`.
9. Click **New query** again.
10. Repeat steps 3-6 one more time with `supabase/schema_v6_visual.sql`.

You've now run all three. If any of them shows a red error message
instead of "Success", stop and copy me the exact error text - don't
guess, just paste it to me.

---

## STEP 4 - Reload the app so it actually shows the new version

**On your iPhone (since that's mainly how you use it):**

1. Double-click the side button (or swipe up and hold, depending on your
   iPhone) to open the app switcher.
2. Find the Boardly card and swipe it up/off the screen to fully close it.
3. Go back to your home screen and tap the Boardly icon to reopen it
   fresh.

This matters because your phone cached the old version of the app files
- fully closing and reopening forces it to check for the new ones.

**On a computer, if you also use it there:** just hold Cmd+Shift+R (Mac)
or Ctrl+Shift+R (Windows) while the tab's open, instead of a normal
refresh.

---

## STEP 5 - Test the stuff that works right away (no more setup needed for these)

Open a ticket's edit screen and try each of these, one at a time:

- [ ] **Timezone**: there's now a dropdown to pick a timezone for that
      ticket's reminder. Pick one, save, reopen the ticket, confirm it
      stuck.
- [ ] **Auto-move**: set "Auto-move to In progress at" to a couple
      minutes from now, save, close the modal, and just watch the board
      - the ticket should hop from To do to In progress on its own when
      that time hits.
- [ ] **Attachment**: tap the attachment/paperclip area, pick a photo
      from your phone. It should upload and show a thumbnail/link. This
      is the one that was broken before Step 3 fixed it.
- [ ] **Critical**: tick the "Critical" checkbox. It'll pop up asking for
      a phone number - go ahead and type your real one now (texting
      itself only starts working after Step 7 below, but it needs the
      number saved either way).
- [ ] **AI assistant**: open the AI panel (the sparkle/chat icon), type
      something like "add three tasks: call the dentist, buy groceries,
      pay rent" and send it. Confirm it actually creates three new
      tickets on your board, not just replies with text.
- [ ] **Inline edit**: on the board itself (not the edit screen), tap
      directly on a ticket's title text. It should turn into something
      you can type into right there. Tap away or hit Enter to save.
- [ ] **Calendar drag**: tap the Calendar icon in the toolbar to switch
      views, then press-and-drag a ticket chip from one day onto another
      day. Its due date should update.
- [ ] **Swimlanes + density**: in the toolbar, tap the new layer-looking
      icon next to the density icon - tickets in each column should now
      group into little labeled bands by category. Tap the density icon
      itself a couple times - it now cycles through 3 sizes instead of 2.
- [ ] **More menu**: tap the "..." or menu icon, look for three new
      items: "Column style", "Missed alerts", "Alarm sound by category" -
      open each one just to see they show something.
- [ ] **Streak**: complete (check off) a ticket or two. A little
      🔥-with-a-number pill should appear in the toolbar. Tap it - it
      opens a small chart of what you've completed recently.
- [ ] **Loud alarm**: set a plain reminder for 1-2 minutes from now on
      any ticket. Before that time hits, tap anywhere on the screen once
      (just tap the background, doesn't matter where) - this "wakes up"
      the phone's audio so the alarm can actually make sound. Then keep
      the app open and waiting. When the time hits, a full-screen dark
      alarm screen should appear with sound playing.

If any single one of these doesn't work the way described, stop and tell
me exactly which one, and exactly what happened instead.

---

## STEP 6 - Know these 3 things about using it on an iPhone specifically

- [ ] The "Turn on real alerts for this device" button (inside a
      ticket's edit screen) only works if you tap it from the **Boardly
      icon on your home screen** - not from a Safari browser tab. If you
      normally open Boardly through Safari instead of the icon, switch
      to using the icon from now on.
- [ ] Your phone won't vibrate for alarms. iPhones don't allow websites
      (even home-screen ones) to trigger vibration - this is expected,
      not something broken.
- [ ] The loud in-app alarm from Step 5 **only works while the app is
      open on your screen**. The second you leave the app or your phone
      locks, iPhones completely pause it - no exceptions, that's just
      how iOS works for any website. Step 7 below (real push
      notifications) is what covers you the rest of the time. Given how
      you're using this, don't skip Step 7.

---

## STEP 7 - Turn on real push notifications (so alerts work even with the app closed)

### 7a. Generate your keys (one-time, 10 seconds)

In your terminal:

```
npx web-push generate-vapid-keys
```

It'll print two long strings of letters/numbers/symbols: a "Public Key"
and a "Private Key". Keep this terminal window open, or copy both
somewhere safe - you need them in the next two steps.

### 7b. Paste the public key into your code

1. Open `js/timely.js` in your text editor (in your project folder).
2. Near the very top, find this line:
   ```
   const VAPID_PUBLIC_KEY = "PASTE_YOUR_VAPID_PUBLIC_KEY_HERE";
   ```
3. Replace `PASTE_YOUR_VAPID_PUBLIC_KEY_HERE` (keep the quote marks
   around it) with the Public Key you just generated.
4. Save the file.
5. Back in your terminal:
   ```
   git add .
   git commit -m "Add VAPID public key"
   git push
   ```

### 7c. Install the Supabase CLI (skip this if you already did it for the AI assistant setup)

```
npm install -g supabase
```

If that gives an error saying `npm` isn't found, it means Node.js isn't
installed - go to https://nodejs.org, download the "LTS" version,
install it, then try the command again.

### 7d. Log in and connect to your project (skip if already done before)

```
supabase login
```
This opens a browser tab asking you to approve - click approve.

```
supabase link --project-ref YOUR_PROJECT_REF
```
Your project ref is the random string in your Supabase dashboard's URL.
For example if your browser shows
`https://supabase.com/dashboard/project/cafhqxzjujvxmarvkbxd`, then your
ref is `cafhqxzjujvxmarvkbxd`.

### 7e. Set your secrets

Type each of these one at a time, pressing Enter after each, swapping in
your real values (keep everything after the `=` on the same line, no
spaces around the `=`):

```
supabase secrets set VAPID_PUBLIC_KEY=your-public-key-here
supabase secrets set VAPID_PRIVATE_KEY=your-private-key-here
supabase secrets set VAPID_SUBJECT=mailto:youremail@example.com
supabase secrets set CRON_SECRET=make-up-any-long-random-word-here
```
For that last one, `CRON_SECRET`, just type any long random text
yourself - letters and numbers, doesn't need to mean anything, just keep
it somewhere so you can reuse the exact same value in step 7g.

### 7f. Deploy the two functions

```
supabase functions deploy send-push
supabase functions deploy auto-advance
```
Each one prints some progress and finishes with a success message.

### 7g. Schedule both to run every minute

1. In the Supabase dashboard, look in the left sidebar for **Edge
   Functions**, click it, then look for a **Cron** tab or button. (On
   some Supabase versions this lives under **Database → Cron Jobs**
   instead - either is fine, use whichever one your dashboard shows.)
2. Click to create a new scheduled job.
3. For the **function**, pick `send-push`.
4. For the **schedule**, type: `* * * * *` (that means "every minute").
5. For **headers**, add one: key is `Authorization`, value is
   `Bearer ` followed immediately by the exact `CRON_SECRET` you made up
   in step 7e (so it looks like `Bearer make-up-any-long-random-word-here`).
6. Save it.
7. Repeat steps 2-6 for the second function, `auto-advance`, using the
   exact same `CRON_SECRET` value.

### 7h. Turn alerts on for your phone

1. Open Boardly from your **home screen icon** (not Safari - see Step 6).
2. Open any ticket that has a reminder set.
3. Tap "Turn on real alerts for this device".
4. Your iPhone will ask permission to send notifications - tap **Allow**.

### 7i. Actually test it

1. Set a reminder for 2 minutes from now on any ticket.
2. Fully close the app (swipe it away, like in Step 4).
3. Lock your phone if you want to be thorough.
4. Wait 2 minutes.
5. You should get a real notification, sound and all, even though the
   app is completely closed.

If nothing arrives, see "If something breaks" at the very bottom.

---

## STEP 8 - Optional: text-message fallback for Critical tickets

Only do this if you want a real SMS as a last-resort backup for tickets
you marked Critical, on top of everything above.

1. Go to https://twilio.com, sign up (free trial account is fine to
   test with).
2. Get a phone number from them (Twilio walks you through this after
   signup - usually a "Get a trial number" button on your dashboard).
3. **Important trial-account step:** in the Twilio console, find
   "Verified Caller IDs" and add + verify your own real phone number
   there first - trial accounts refuse to text unverified numbers.
4. Back in your terminal:
   ```
   supabase secrets set TWILIO_ACCOUNT_SID=your-account-sid
   supabase secrets set TWILIO_AUTH_TOKEN=your-auth-token
   supabase secrets set TWILIO_FROM_NUMBER=your-twilio-number
   supabase functions deploy send-critical-sms
   ```
   (Your Account SID and Auth Token are both on your main Twilio
   dashboard homepage after logging in.)
5. Schedule it exactly like step 7g above, third time - function
   `send-critical-sms`, schedule `* * * * *`, same `Authorization:
   Bearer <your CRON_SECRET>` header.
6. Test it: mark a ticket Critical, let its reminder time pass, leave
   the app closed and the notification un-tapped for at least 3 minutes.
   A text message should arrive.

---

## If something breaks

Tell me these three things and I'll fix it - don't guess, just paste
what actually happened:

1. **Which step** you were on (e.g. "Step 3, second SQL file").
2. **What you did exactly** (what you typed, what you clicked).
3. **What happened instead of what the guide said should happen**
   (the exact error message if there was one - a screenshot or a
   copy-pasted error is perfect).

A few common ones already known:

- "row-level security policy" error uploading a file → Step 3 wasn't
  completed yet, go back and run `schema_v4_timely.sql`.
- No push notification arrives → in your terminal, run
  `supabase functions logs send-push` and send me what it prints.
- Alarm screen shows but no sound → you need to tap the screen once
  before the reminder fires (see Step 5's alarm bullet) - the phone
  blocks sound from anything it wasn't a direct tap.
- Nothing happens on iPhone alerts at all → double check you tapped
  "Turn on real alerts" from the home-screen icon, not Safari (Step 6).

---

## STEP 9 - This batch: AI fix, custom date picker, smoother drag, Termii, icons

### 9a. Fix the AI not creating tasks

You deployed `send-push`, `auto-advance`, and `send-critical-sms`, but
never redeployed `board-assistant` after its code changed. It's still
running the old version. In your terminal:
```
supabase functions deploy board-assistant
```
Test again after that - ask it to add a task and confirm it actually
appears on the board.

### 9b. Pull the rest of this update in (same as Step 1-2 before)

Copy the new zip's contents into your project folder (overwrite
everything), then:
```
git add .
git commit -m "Custom date picker, smoother drag, Termii SMS, icons"
git push
```

### 9c. New database column - run this SQL too

Supabase SQL Editor, paste and run:
```
alter table tasks add column if not exists critical_alert_sent_at timestamptz;
```
(This one's small enough it doesn't need its own file - it was actually
already in `schema_v5_timely_plus.sql`, so if you ran that file already
you can skip this.)

### 9d. Switch to Termii instead of Twilio (better for Nigerian numbers)

Twilio has known restrictions/reliability issues for Nigerian numbers.
Termii is Nigerian-founded and its "DND route" is specifically built to
bypass Do-Not-Disturb and the 8PM-8AM delivery window Nigerian carriers
otherwise block.

1. Sign up free at https://termii.com
2. From your Termii dashboard, grab your **API key** and confirm your
   **base URL** (usually `https://api.ng.termii.com` for Nigerian
   accounts, shown on your dashboard).
3. In the Termii dashboard, register a **Sender ID** (3-11 letters, e.g.
   `Boardly`) - this needs a short approval before the DND route works,
   so do it now rather than later.
4. In your terminal:
   ```
   supabase secrets set TERMII_API_KEY=tlv_wld8WIsVEIFpEX50C6mvnzp9CdFo4yH3juNsGux7YSA
   supabase secrets set TERMII_SENDER_ID=Boardly
   supabase secrets set TERMII_BASE_URL=https://v4.api.termii.com/
   supabase functions deploy send-critical-sms
   ```
   This replaces the Twilio version entirely - you can remove the
   `TWILIO_*` secrets later if you want, they're just unused now.
5. Test: mark a ticket Critical, when it asks for a phone number this
   time give it with **no + sign** (e.g. `2348012345678`, not
   `+2348012345678` - Termii's format is different from Twilio's).

### 9e. What else changed, no setup needed

- [ ] **Custom date/time picker** - the plain browser calendar popup
      (due date, reminder, auto-move fields) is now fully redesigned to
      match Boardly's own look. Just reload and open a ticket to see it.
- [ ] **Smoother dragging** - fixed a CSS conflict that made dragged
      cards visually lag behind your finger/cursor instead of tracking
      it exactly, on both desktop and mobile. Also fixed calendar
      drag-to-reschedule, which technically never worked on a touch
      screen before (it used a browser feature that's mouse-only) - it
      now uses the same drag engine as the board itself.
- [ ] **Zoom-on-tap bug** - fixed for real this time (a previous fix
      only applied under a specific screen width and missed some cases).
      Tapping any input on your phone should no longer zoom the page in.
- [ ] **Windows taskbar icon** - if you'd already pinned/installed
      Boardly on Windows before this update, unpin it and reinstall
      after pulling this update, so it picks up the new icon files.
- [ ] Homepage (`index.html`) now has a "Latest update" banner too,
      matching what was already added to the changelog/features pages.

## If something breaks (updated)

Same as before - tell me the step, what you did, and the exact error.
One more common one now:

- AI still not creating tasks after 9a → run
  `supabase functions logs board-assistant` and send me what it prints.
