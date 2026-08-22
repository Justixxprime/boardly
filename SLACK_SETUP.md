# Setting up Slack

Two separate things, you can set up either one, both, or neither:

1. **Notifications into Slack** - Boardly posts a message when someone
   mentions you in a ticket comment.
2. **`/addtask` slash command** - type `/addtask Call the printer
   tomorrow` in any Slack channel, and it becomes a real ticket.

---

## Step 1: create a Slack app (free, about 3 minutes)

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create
   New App** → **From scratch**.
2. Name it "Boardly" (or anything), pick your workspace → **Create
   App**.

## Step 2: set up notifications (Incoming Webhooks)

1. Left sidebar → **Incoming Webhooks** → toggle it **On**.
2. **Add New Webhook to Workspace** → pick the channel you want
   mentions to show up in → **Allow**.
3. Copy the Webhook URL it gives you (starts with
   `https://hooks.slack.com/services/...`).
4. In Boardly → Settings → Integrations → Slack → paste it into
   **Incoming Webhook URL**.
5. Also find your own **Slack member ID**: in Slack, click your name/
   profile picture → **⋯ More** → **Copy member ID**. Paste that into
   the **Your Slack member ID** box too.
6. Click **Save Slack settings**.

## Step 3: set up the /addtask command

1. Back in your Slack app's settings → left sidebar → **Basic
   Information** → under **App Credentials**, copy the **Signing
   Secret**.
2. Supabase dashboard → Edge Functions → Manage secrets → add:

   | Name | Value |
   |---|---|
   | `SLACK_SIGNING_SECRET` | the Signing Secret from step 1 |

3. Deploy the function:
   ```
   supabase functions deploy slack-slash-command --no-verify-jwt
   ```
4. Back in your Slack app → left sidebar → **Slash Commands** →
   **Create New Command**:
   - Command: `/addtask`
   - Request URL:
     ```
     https://YOUR_PROJECT.supabase.co/functions/v1/slack-slash-command
     ```
     (replace `YOUR_PROJECT` with your real Supabase project ID)
   - Short description: "Add a ticket to Boardly"
   - Save.
5. In Slack, go to any channel and type `/addtask Try it out` - it
   should reply confirming the ticket was added.

## Step 4: run the database migration

Supabase dashboard → SQL Editor → New query → paste the whole contents
of `supabase/schema_v22_slack_zapier.sql` → Run. (This is shared with
Zapier - one migration covers both.)

## What to know

- The slash command always adds to whichever board you most recently
  used in Boardly - it has no way to ask "which board?" first.
- Every request to `/addtask` is checked against Slack's own signature
  to confirm it genuinely came from Slack, not just anyone who found
  the URL - see the comment at the top of
  `supabase/functions/slack-slash-command/index.ts` if you want the
  technical detail.
