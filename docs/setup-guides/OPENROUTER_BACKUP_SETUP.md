# Setting up: OpenRouter as a backup AI provider (optional)

## What this is, in plain words

Boardly's "Ask AI" panel runs on Groq. Groq is great and it's free, but
like any free service it can occasionally be slow, briefly down, or
rate-limited if you use it a lot in a short time.

This update adds OpenRouter as a **second, backup** brain. If Groq ever
fails to answer, Boardly now automatically tries OpenRouter instead,
completely behind the scenes - you'd never even notice it happened,
you'd just get your answer either way.

**This whole thing is optional.** If you skip this setup entirely,
nothing changes at all - Boardly keeps working exactly as it always
has, Groq only. Only do this if you want the safety net.

Also completely free, no credit card, and it keeps Boardly's rule of
"Charles holds one API key server-side" - your visitors/clients never
need their own account with anyone.

---

## Step 1: get a free OpenRouter key

1. Go to https://openrouter.ai in your browser.
2. Click **Sign In** (top right), and sign up with Google or email -
   whichever's easier for you.
3. Once you're logged in, click your profile picture/name (top right),
   then click **Keys** in the menu that drops down.
4. Click **Create Key**.
5. Give it any name you like, e.g. `boardly-backup`, and click **Create**.
6. It'll show you a long string starting with `sk-or-v1-...`. Click the
   copy icon next to it. **Copy it now** - OpenRouter only shows you the
   full key this one time.

---

## Step 2: pull this update's code in

Copy every file from this zip into your real project folder, overwriting
anything with the same name (only one file actually changed:
`supabase/functions/board-assistant/index.ts`, plus this new guide).

In your terminal, inside your `boardly` folder:
```
git add .
git commit -m "Add OpenRouter as a backup AI provider"
git push
```

---

## Step 3: save your key as a secret

In your terminal:
```
supabase secrets set OPENROUTER_API_KEY=sk-or-v1-paste-your-real-key-here
```
(Swap in the actual key you copied in Step 1 - keep everything after
the `=` on one line, no spaces.)

---

## Step 4: redeploy the function

```
supabase functions deploy board-assistant
```

That's it - no new database changes needed for this one.

---

## Step 5: test it (optional, but satisfying)

There's no easy way to force Groq to fail on purpose, so the honest test
is just: open the "Ask AI" panel and ask it something normal, like "add
a task: water the plants". If it replies and the task appears on your
board, everything's wired correctly either way (you can't easily tell
from the outside which of the two providers actually answered, and
that's the point - it's meant to be invisible).

If you ever want to actually confirm OpenRouter itself is reachable,
you can temporarily set an obviously wrong Groq key
(`supabase secrets set GROQ_API_KEY=wrong`) and try the AI panel again -
it should still reply, this time definitely via OpenRouter. Just
remember to set your real Groq key back afterwards with the same
command.

---

## If something breaks

Run this and send me exactly what it prints:
```
supabase functions logs board-assistant
```

One thing worth knowing: OpenRouter's free models are shared across
everyone using them for free, so during that provider's own busy
periods it can occasionally be slow too - it's a backup, not a
guarantee, but it meaningfully lowers the odds of both failing at the
exact same moment.
