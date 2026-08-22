# Setting up Zapier

## Being honest about scope first

This connects Boardly to Zapier through Zapier's own generic
**"Webhooks by Zapier"** building block - available on every Zapier
plan, including free. This is genuinely real, working automation.

What this is **not**: a published "Boardly" app you'd find by
searching inside Zapier's own app directory. Building one of those
means submitting it to Zapier and having Zapier's own team review and
approve it - a separate process that takes real time on Zapier's side,
not something that can be finished here. The webhook approach below
does the same job, it just means picking "Webhooks by Zapier" as the
app inside your Zap instead of searching for "Boardly" by name.

---

## What you can build with this

- **Boardly → somewhere else**: "when a new ticket is created in
  Boardly, add a row to my Google Sheet" (or Notion, or send a text,
  or anything else Zapier connects to).
- **Somewhere else → Boardly**: "when I get a starred email, create a
  Boardly ticket" (or from a form submission, a calendar event,
  anything).

---

## Step 1: run the database migration

Supabase dashboard → SQL Editor → New query → paste the whole contents
of `supabase/schema_v22_slack_zapier.sql` → Run. (Shared with Slack -
one migration covers both.)

## Step 2: deploy the Edge Function

```
supabase functions deploy zapier-create-task --no-verify-jwt
```

## Step 3: get your API key

Boardly → Settings → Integrations → Zapier → **Generate**. Copy the
key that appears (starts with `bk_`) - you'll paste it into Zapier in
a moment. Treat it like a password: anyone with it can create tickets
on your board.

---

## Setting up "somewhere else → Boardly" (inbound)

1. In Zapier, create a new Zap. Pick your trigger app (Gmail, a form,
   whatever starts it).
2. For the action step, search for and pick **Webhooks by Zapier**.
3. Action event: **POST**.
4. URL:
   ```
   https://YOUR_PROJECT.supabase.co/functions/v1/zapier-create-task
   ```
5. Payload type: **JSON**.
6. Data: add at minimum
   ```
   api_key   →  your key from Step 3 above
   title     →  map this to whatever field should become the ticket title
   ```
   Optional fields you can also map: `category`, `due_date` (format
   `YYYY-MM-DD`), `notes`.
7. Test the step - a real ticket should appear on your Boardly board.

## Setting up "Boardly → somewhere else" (outbound)

1. In Zapier, create a new Zap. For the trigger, search for and pick
   **Webhooks by Zapier**.
2. Trigger event: **Catch Hook**.
3. Zapier shows you a URL (something like
   `https://hooks.zapier.com/hooks/catch/.../.../`). Copy it.
4. Boardly → Settings → Integrations → Zapier → paste it into
   **Outbound webhook URL** → **Save Zapier settings**.
5. Add a new ticket in Boardly, then go back to Zapier and test the
   trigger - it should pick up the ticket's title, category, due date,
   and when it was created.
6. Build the rest of the Zap from there (pick what happens next).

## What to know

- The API key gives access to create tickets, nothing else - a Zap
  using it can't read, edit, or delete existing tickets, or see
  anything else in your account.
- Regenerating your key (the **Generate** button) immediately breaks
  any Zap still using the old one - update the Zap's `api_key` field
  with the new one if you ever do this.
- Inbound tickets always land on whichever board you most recently
  used in Boardly.
