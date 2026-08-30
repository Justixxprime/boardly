# Pushing this update to GitHub, in ultra baby steps

Your project folder already has git set up and already knows where it
belongs on GitHub (`github.com/Justixxprime/boardly`). That's the hard
part done. Pushing an update is just: tell git what changed, describe it
in one sentence, send it up. Below is every single click and keystroke.

---

## Step 0: do you have git and a terminal?

You need a terminal (a black/white text window where you type commands)
and `git` installed.

- **Windows:** search your Start menu for "Git Bash" (installed if you
  ever installed Git for Windows). If you don't see it, download Git from
  https://git-scm.com/downloads, install it with all the default options,
  then open "Git Bash" from the Start menu.
- **Mac:** open the app called "Terminal" (search for it with Spotlight,
  the magnifying glass, top-right of your screen). Type `git --version`
  and press Enter. If it's not installed, macOS will offer to install it,
  say yes.

Keep that window open for every step below.

---

## Step 1: get into the right folder

1. Fully delete your old `boardly` folder if you have one from before, so
   you don't mix old and new files.
2. Unzip the new file I gave you into a clean location, e.g. your Desktop
   or Documents.
3. In the terminal, type `cd ` (with a space after it, no Enter yet).
4. Now **drag the `boardly` folder** from your file explorer/Finder
   straight into the terminal window. It'll paste the folder's full path
   in automatically.
5. Press Enter.
6. Type `pwd` and press Enter, this prints where you currently are, just
   to double check it says `.../boardly` at the end.

---

## Step 2: see what changed

Type this and press Enter:

```
git status
```

You'll see a list of file names in different colors, red for changed or
new files, green for things already staged. This is git's way of showing
you "here's everything that's different from what's currently on
GitHub." Don't worry about understanding every line, this is just a
progress check.

---

## Step 3: stage everything

This tells git "yes, include all of this in the next update." Type:

```
git add .
```

(That's `git add` followed by a single period, meaning "everything in
this folder.") Nothing will print, that's normal, no news is good news.

---

## Step 4: write a commit message

A "commit" is one saved checkpoint, with a short note describing what
changed. Type this exactly, but change the text inside the quotes to
describe what you did (keep the quotes):

```
git commit -m "Add search, undo, edit modal, bulk actions, export/import, PWA, notifications, contact form"
```

Press Enter. You'll see a summary like "14 files changed, 620
insertions(+)". That means it worked.

---

## Step 5: send it to GitHub

Type:

```
git push
```

Press Enter.

### If this is the very first time you've pushed from this computer

GitHub will ask you to log in. As of a few years ago, GitHub stopped
accepting your normal password here, you need something called a
**Personal Access Token** instead. Here's how to get one:

1. Go to https://github.com/settings/tokens
2. Click "Generate new token" then "Generate new token (classic)."
3. Give it any name, e.g. "boardly laptop."
4. Under "Select scopes," check the box next to `repo` (this gives it
   permission to push code).
5. Scroll down, click "Generate token."
6. **Copy the token immediately**, GitHub only shows it once. Paste it
   somewhere safe temporarily (a notes app), you'll need it right now.
7. Back in the terminal, when it asks for a username, type your GitHub
   username and press Enter.
8. When it asks for a password, **paste the token** (not your real
   password) and press Enter. Note: when you paste it, nothing will
   appear to type on screen, that's normal, terminals hide password
   input. Just paste and press Enter anyway.

After that first time, most setups remember this for you, so future
`git push` commands just work without asking again.

---

## Step 6: check it actually landed

1. Go to https://github.com/Justixxprime/boardly in your browser.
2. You should see your file list with a recent "committed" timestamp
   like "2 minutes ago," and your commit message from Step 4 shown at
   the top.

---

## Step 7: seeing it live (if you use GitHub Pages)

If your site is hosted at `justixxprime.github.io` (or similar) via
GitHub Pages, it usually takes 1-3 minutes after a push to update. To
check the deployment status:

1. On the GitHub repo page, click the "Actions" tab (if your repo uses
   one) or go to **Settings, Pages** in the left sidebar.
2. It'll show a small green checkmark once the new version is live, or a
   yellow dot while it's still deploying.
3. Once it's green, open your live site and do a **hard refresh** so
   your browser doesn't show you a cached old copy:
   - Windows/Linux: `Ctrl + Shift + R`
   - Mac: `Cmd + Shift + R`
   - Or open the site in a private/incognito window, which never uses
     the cache at all.

---

## The whole thing, back to back, for next time

Once you're comfortable, here's every command with no explanation, to
copy-paste as a block next time you have an update:

```
cd path/to/your/boardly/folder
git add .
git commit -m "describe what changed here"
git push
```

## If something goes wrong

- **"fatal: not a git repository"**: you're not inside the `boardly`
  folder. Go back to Step 1.
- **"Updates were rejected because the remote contains work that you do
  not have locally"**: this means GitHub already has a newer version
  than what's on your computer (maybe you edited directly on GitHub's
  website at some point). Run `git pull` first, then try `git push`
  again.
- **Nothing happens after `git push`, it just sits there**: it's
  probably waiting for that username/token from Step 5. Scroll up to
  check if it's silently asked and is waiting on you to type.
- Anything else: copy the exact red error text and send it to me, I can
  tell you exactly what it means.
