# Setting up: Do It For Me

This is the "Do It For Me" item from your seven-features doc. It does
NOT add a second AI chat - it reuses the exact same board assistant
(same Edge Function, same free Groq/OpenRouter setup, same action
format) you already have. The only two new things are:

1. A new toolbar button, "Do it for me", that asks for a goal instead
   of a normal chat message.
2. A review screen: instead of the AI's proposed tasks being created
   immediately (like every other AI action already is), you see the
   whole list first, can uncheck anything you don't want, and only the
   checked ones get created when you press Create.

Everything else about the assistant (Ask AI, Emergency mode, Capture,
Daily briefing) works exactly as it did before - none of that changed.

## Step 1: no database changes needed

This feature doesn't touch the database at all. Skip straight to step 2.

## Step 2: redeploy the board-assistant function

The system prompt (the instructions that shape how the AI responds)
gained a new "Plan mode" section, so the function needs redeploying for
that to take effect:

```
supabase functions deploy board-assistant
```

Same as before, no `--no-verify-jwt` needed here - this one is only
ever called by someone already signed in to Boardly.

## Step 3: copy the files in, then push

```
git add .
git commit -m "Add Do It For Me (AI plan review)"
git push
```

## Step 4: test it

1. Open a board, click **Do it for me** in the toolbar.
2. Type a real goal, e.g. "client onboarding for a new customer" or
   "launch week for a new product".
3. You'll see a review screen with several proposed tasks, each with a
   checkbox, due date, and category. Nothing has been created yet.
4. Uncheck one to make sure it's really left out, then click
   **Create selected**.
5. Confirm only the tasks you left checked actually show up on the
   board.

## How it works, in plain terms

Every other AI request (typing something in Ask AI, Emergency mode,
Capture) still applies its actions immediately, exactly like before -
that's the right behavior for a quick one-line request. Do It For Me is
different on purpose: describing a whole goal can reasonably produce a
dozen new tasks at once, which is too much to trust creating
sight-unseen. So this one specific mode collects the AI's proposed
tasks, shows them to you first, and only creates the ones you leave
checked - using the exact same task-creation code as everything else,
just with a pause for you to look first.
