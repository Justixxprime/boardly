# Getting your contact form working with Web3Forms

Your contact form (`contact.html`) is already wired up to send real
emails. It just needs one thing from you: a free access key. This takes
about 2 minutes.

## Step 1: get your access key

1. Go to https://web3forms.com
2. Enter the email address where you want messages delivered (probably
   the same one already in your footer, `Obiomachibuezejustice@gmail.com`).
3. Click "Create Access Key."
4. Check that inbox, there's a confirmation email with your key in it.
   It looks like a long string of letters and numbers, something like
   `a1b2c3d4-e5f6-7890-abcd-ef1234567890`.
5. Copy that key.

## Step 2: paste it into your site

1. Open `contact.html` in any text editor (Notepad, VS Code, whatever you
   already use).
2. Find this line, near the top of the form (search for "access_key"):
   ```html
   <input type="hidden" name="access_key" value="YOUR_WEB3FORMS_ACCESS_KEY_HERE">
   ```
3. Replace `YOUR_WEB3FORMS_ACCESS_KEY_HERE` with the key you copied, so it
   looks like:
   ```html
   <input type="hidden" name="access_key" value="a1b2c3d4-e5f6-7890-abcd-ef1234567890">
   ```
4. Save the file.

## Step 3: test it

1. Open `contact.html` in your browser (or push the change live first,
   see `GITHUB_PUSH_GUIDE.md`).
2. Fill in the form with your own name and email and send yourself a test
   message.
3. You should see a green "Message sent, thanks" line appear, and the
   email should land in your inbox within a minute or two (check spam the
   first time).

## What happens if the key is wrong or missing

The form won't silently fail; it shows the orange "Something went wrong
sending that" message instead, and reminds people to email you directly
using the card next to the form. Nothing breaks, it just won't actually
deliver until the real key is in place.

## About email notifications for the board itself (due-soon tasks)

You also asked about email notifications for tasks (separate from the
contact form). That's intentionally not built the same way, and here's
why: sending an email automatically on a schedule (like "email me every
morning about tasks due today") needs code that runs on a server on a
timer, something checking the database even when nobody has the site
open. Web3Forms only sends an email when a real visitor submits a form in
their browser, it can't run in the background.

The due-soon feature you already have (browser notifications) covers the
same need without needing a server: it checks your tasks the moment you
open the dashboard and fires a native OS notification for anything due
today. If you want true scheduled emails later, that's a small serverless
function (Supabase Edge Functions are a natural fit, since you're already
using Supabase) running on a timer, that's a bigger, separate project
from anything plain HTML/CSS/JS can do on its own.
