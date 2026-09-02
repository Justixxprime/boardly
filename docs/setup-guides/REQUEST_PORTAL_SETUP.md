# Setting up: Request Portal

A new "Request Portal" row inside Share link settings (the same place
Client Portal's link lives). Publishing gives you a link anyone can
open to send you a request - no Boardly account needed - and it lands
straight on your board as a new ticket in To Do.

**Important:** this is a third, completely separate link, different
from both the plain board share link and the Client Portal link.
A request-portal link is meant to be the most widely handed out of all
three - on a website, a business card, a social bio - so it never
shares a token with the other two, on purpose. Someone with only the
request-portal link can send you a ticket; they can never see your
board, your tasks, or anything else.

## Step 1: run the database update

1. Supabase dashboard -> SQL Editor -> New query.
2. Open `supabase/schema_v45_request_portal.sql`, copy all of it,
   paste, click Run.

This adds one column (`request_portal_token`) to your existing
`boards` table. Nothing else is touched.

## Step 2: deploy the Edge Functions

```
supabase functions deploy submit-request --no-verify-jwt
supabase functions deploy get-request-portal-info --no-verify-jwt
```

`get-request-portal-info` is new - it's what lets the request page show
your real board/business name in the heading instead of a generic
"Send a request." Both need `--no-verify-jwt` - a stranger filling out
a request form has no Boardly login to send, same reason Client
Portal's own functions need it too.

## Step 3: copy the files in, then push

```
git add .
git commit -m "Finish Request Portal: board name, unpublish, notifications"
git push
```

## Step 4: test it

1. Open a board, click the share icon to open Share link settings.
2. Click "Publish" next to Request Portal, then "Copy."
3. Open the link in a private/incognito window - the heading should
   now say "Send a request to [your board's name]," not a generic one.
4. Fill in a name and a short request, submit.
5. Back in Boardly, that board should now have a new ticket in To Do,
   with a note at the top saying who it came from and their email if
   they gave one - and the bell icon (Notification Center) should show
   a new notification about the request too.
6. In Share link settings, click "Unpublish" under Request Portal, then
   reload the incognito link from step 3 - it should now say the link
   isn't valid.

## What's new since this was first started

Three gaps closed, none needing new database columns or tables:

- The request page now shows the real board name (via the new
  `get-request-portal-info` function - it only ever returns a name,
  nothing else about you or your board).
- You can now unpublish the link, not just publish and copy it. Since
  re-publishing hands out a brand new link rather than the same one
  back, you're asked to confirm first.
- Submitting a request now also creates a Notification Center entry
  for you, the same way being assigned a ticket does - so a request
  doesn't go unnoticed just because you weren't already looking at
  that specific board.
