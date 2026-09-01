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

## Step 2: deploy the new Edge Function

```
supabase functions deploy submit-request --no-verify-jwt
```

Needs `--no-verify-jwt` - a stranger filling out a request form has no
Boardly login to send, same reason Client Portal's own functions need
it too.

## Step 3: copy the files in, then push

```
git add .
git commit -m "Add Request Portal"
git push
```

## Step 4: test it

1. Open a board, click the share icon to open Share link settings.
2. Click "Publish" next to Request Portal, then "Copy."
3. Open the link in a private/incognito window.
4. Fill in a name and a short request, submit.
5. Back in Boardly, that board should now have a new ticket in To Do,
   with a note at the top saying who it came from and their email if
   they gave one.
