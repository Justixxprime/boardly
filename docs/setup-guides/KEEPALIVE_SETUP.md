# Keep Boardly awake (free, 10 minutes)

## Why this exists
On the free Supabase plan, a project with no activity for 7 days is paused.
While it is paused, sign in, boards, tasks and every Edge Function fail.
This job sends one tiny database request every 3 days so that never happens.
It is from Chapter 1 of The Copy and Paste Business Book.

## Do this once (baby steps)
1. Open your repo on GitHub. Click Settings.
2. On the left click Secrets and variables, then Actions.
3. Click New repository secret.
4. Name: SUPABASE_URL
   Value: https://cafhqxzjujvxmarvkbxd.supabase.co
   Click Add secret.
5. Click New repository secret again.
   Name: SUPABASE_ANON_KEY
   Value: the anon key from js/supabase-client.js (the long text starting eyJ).
   Click Add secret.
6. Click the Actions tab. Click keep-supabase-awake on the left.
7. Click Run workflow, then the green Run workflow button.
8. Wait a minute and refresh. A green tick means it works.
   A red cross means something is wrong with the project. Click it to read why.

## Good to know
- GitHub can switch off scheduled jobs after 60 days with no commits in the repo.
  If that happens, open the Actions tab and click Enable, or push any small change.
- The job uses the public anon key, which is already public inside your site.
  Never put the service role key or any sb_secret key in here.
- Keep alive is for demos. For a paying customer, move to a plan that never pauses.
