# Setting up the Client Portal

This is a bigger one than usual — it adds a new database table, two
Edge Functions, and a whole new page. Take it one step at a time, in
this exact order, and it'll go smoothly.

---

## Step 1: run the database migration

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Open `supabase/schema_v27_client_portal.sql` from the zip, copy
   everything in it, paste it into the SQL Editor, and click **Run**.
3. You should see "Success. No rows returned." That's it — this adds
   3 new columns to your `tasks` table and one new table called
   `client_comments`. Nothing existing is touched.

---

## Step 2: deploy the two Edge Functions

One of these already existed (`get-shared-board`, used by your
regular public share links) — we extended it, so it needs
re-deploying. The other one (`client-portal-action`) is brand new.

From your terminal, inside your `boardly` project folder:

```
supabase functions deploy get-shared-board
supabase functions deploy client-portal-action
```

If you get an error about not being logged in or not linked to your
project, run `supabase login` and `supabase link` first (you've done
this before for earlier Edge Functions, so your project should
already be linked).

---

## Step 3: copy the rest of the files in

- `dashboard.html` (updated — new checkbox, new "Client feedback"
  strip, new "Copy client portal link" button)
- `js/dashboard.js` (updated — reads/saves the new checkbox, shows a
  small badge on the card)
- `client-portal.html` (brand new — this is the actual page your
  clients will open)
- `js/client-portal.js` (brand new — powers that page)
- `js/client-portal-owner.js` (brand new — the dashboard-side half)

---

## Step 4: push it to GitHub

```
git add .
git commit -m "Add Client Portal v1"
git push
```

---

## What this actually is, in plain terms

You already have a way to share a whole board publicly (`share.html`)
— anyone with the link (and password, if you set one) can see
everything on it. The Client Portal is a **different, curated front
door** onto that same link — instead of showing your whole messy
board, it only shows the specific tasks you've chosen to show, in a
clean, professional layout your client can actually use.

**How you use it:**

1. Open any task, tick **"Show this to the client in their Client
   Portal"**, and save.
2. Open your board's Share settings (same place you already turn
   sharing on and set a password), and tap **"Copy client portal
   link"**. This uses the exact same public link and password you
   already have set up — it's just a different page for the same
   link.
3. Send that link to your client. They open it, see only the tasks
   you marked, and can:
   - Leave a note on any task
   - Tap **Approve**
   - Tap **Request changes** and explain what needs fixing
4. The first time they do any of those, it asks their name once —
   after that it remembers them for that visit.
5. Back in your dashboard, open that same task and you'll see a new
   **"Client feedback"** section — their status (awaiting review /
   approved / changes requested), their comments, and a box where you
   can reply right there, without needing to open the portal link
   yourself.
6. Cards on your board also get a small badge once a client's acted
   on them — orange for "Client: changes," teal for "Client
   approved" — so you notice without having to open every ticket.

**Nothing is exposed that you didn't choose to share.** The client
only ever sees tasks you specifically ticked, and only a safe set of
fields (title, category, due date, your notes) — internal-only things
like git branch, priority, or pull request links never go out through
this page, even for tasks you've marked visible.

---

## What this does not do yet

- No file uploads or attachments from the client yet — text notes
  and approve/request-changes only, for now.
- No invoicing — the "view invoices" piece from the original wishlist
  needs real billing data Boardly doesn't track yet, and wasn't built
  here on purpose rather than faked.
- A client can't edit or rename anything — this is a review-and-
  respond surface, not a second dashboard.
- The portal shares the same password and expiry as your board's
  regular public link — there's no separate password just for the
  Client Portal yet.
