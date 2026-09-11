# Boardly 2.0: Money, Clients, and Payments, Setup Guide

This explains, in plain steps, what was built this session and exactly
what you need to click or type to turn it on. Written so you can follow
it even if you have never touched Supabase or Paystack settings before.

---

## 1. What actually got built

Three new pieces of Boardly:

1. **Money** (`money.html`). A page where you can create invoices, send
   clients a link to view them, track expenses, and see a running ledger
   of every payment and expense.
2. **Clients** (`clients.html`). A simple address book of clients, each
   one showing how much you have billed them and how much they still
   owe, added up automatically from their invoices.
3. **Real online payments**. A client can now open their invoice and
   click "Pay now" to pay you through Paystack, the same payment company
   Marketplace already uses.

All the code and database changes for these are already saved. What is
left is two settings only you can turn on (Section 3 below), because
they involve your own Paystack account, which nobody but you has access
to.

## 2. Database setup (already done for you)

Five database files were written and already run against your live
Supabase project during this session:

- `supabase/schema_v62_money_foundation.sql`, creates the invoices and
  transactions (ledger) tables.
- `supabase/schema_v63_invoice_payments.sql`, adds a "pending, confirmed,
  or failed" status to each ledger entry, so a payment that is still in
  progress never shows up as money you already have.
- `supabase/schema_v64_clients.sql`, creates the clients table and links
  invoices to a client.
- `supabase/schema_v65_profitability.sql`, adds an hourly rate field to
  projects, used by the Profitability tab, see Section 5 below.

You do not need to run these yourself. They are only kept in the
`supabase/` folder as a record of what changed, and in case you ever
need to set up a second Boardly project from scratch (in that case, run
them in this exact order, oldest number first, in the Supabase SQL
Editor).

The three Edge Functions this needed (`get-invoice-info`,
`create-invoice-payment`, `invoice-payment-webhook`) are also already
deployed and active.

## 3. The two things you still need to do

### Step 1: Add your Paystack secret key to Supabase

This tells Boardly's server-side code how to talk to Paystack on your
behalf. Marketplace already has this set up, you are reusing the same
key, not creating a new one.

1. Go to **https://supabase.com/dashboard** and open your Boardly
   project.
2. In the left sidebar, click **Edge Functions**.
3. Click **Secrets** (sometimes shown as **Manage secrets**).
4. Look for a secret named **PAYSTACK_SECRET_KEY**.
   - If it is already there (because Marketplace uses it), you are
     done, skip to Step 2.
   - If it is not there, click **Add new secret**, name it
     `PAYSTACK_SECRET_KEY`, and paste in your Paystack secret key as the
     value. You can find that key inside your own Paystack dashboard,
     under **Settings, API Keys and Webhooks**. It starts with `sk_`.
5. Click **Save**.

### Step 2: Tell Paystack where to send payment confirmations

When a client pays an invoice, Paystack needs to tell Boardly "this
payment succeeded." It does that by sending a message to a specific web
address, called a webhook URL. You need to paste that address into your
Paystack account once.

The exact address to paste is:

```
https://cafhqxzjujvxmarvkbxd.supabase.co/functions/v1/payment-webhook
```

This is a single combined address that handles both Marketplace payments
and Money invoice payments, so it replaces whatever was there before,
Marketplace's own separate webhook function still exists and still
works, but you only need to register this one URL with Paystack.

Steps:

1. Log in to **https://dashboard.paystack.com**.
2. Click **Settings** (usually in the left sidebar or under your
   business name).
3. Click **API Keys and Webhooks**.
4. Find the field labeled **Webhook URL**.
5. Replace whatever is currently there (if anything) with the address
   above, then click **Save**.

## 4. How to check it is working

Once both steps above are done:

1. Open `money.html` in Boardly and create a test invoice for a small
   amount, like 100 naira.
2. Click the paper airplane icon to send it, then click the link icon
   to copy the client link.
3. Open that link in a new private/incognito browser window (so you are
   viewing it as the client would, not as yourself).
4. You should see a "Pay now" box. Enter an email and click **Pay now**.
5. You will be taken to a real Paystack checkout page. Use one of
   Paystack's test card numbers if your account is still in test mode
   (Paystack's own documentation lists these under **Test Cards**).
6. After paying, you should be sent back to the invoice page, and the
   invoice should now show as paid. Back in `money.html`, the Ledger tab
   should show a new "Payment" entry, and the invoice's status badge
   should say "Paid."

If it does not flip to paid within a few seconds, the most common cause
is Step 2 above not being saved correctly, double check the webhook URL
is pasted in exactly, with no extra spaces.

## 5. The Profitability tab (no setup needed, just how to use it)

Money now has a fourth tab, Profitability, showing every project that
has an invoice or tracked time linked to it: revenue, expenses, hours
tracked, an hourly rate you set, an estimated labour cost, profit, and a
margin percentage.

Nothing needs to be configured for this to start working. The one thing
you do need to do, per project, is type in an hourly rate in the Rate
column if you want labour cost included. Until you set one, that
project's labour cost shows as "not included" rather than assuming
zero, since assuming zero would make every project look more profitable
than it really is.

The "Healthy," "At risk," and "Unprofitable" label uses two fixed
cutoffs, 40% margin and 15% margin, it is not a prediction or an AI
judgment, just a plain calculation shown as a label instead of a raw
number.

## 7. Where everything lives, for reference

| What | File |
|---|---|
| Money page (your side) | `money.html`, `js/money.js` |
| Invoice page (client's side) | `invoice.html`, `js/invoice-page.js` |
| Clients page | `clients.html`, `js/clients.js` |
| Database setup | `supabase/schema_v62_money_foundation.sql`, `schema_v63_invoice_payments.sql`, `schema_v64_clients.sql` |
| Reads an invoice for the client-facing page | `supabase/functions/get-invoice-info` |
| Starts a real Paystack checkout | `supabase/functions/create-invoice-payment` |
| Confirms a payment actually succeeded (the one to register with Paystack) | `supabase/functions/payment-webhook` |
| Older invoice-only webhook, still works but no longer needed, superseded by `payment-webhook` above | `supabase/functions/invoice-payment-webhook` |
| Older Marketplace-only webhook, still works but no longer needed, superseded by `payment-webhook` above | `supabase/functions/marketplace-payment-webhook` |
| Full status of every feature, what is done and what is not | `docs/BOARDLY_IMPLEMENTATION_STATUS.md` |
| Design decisions made this session (fonts, colors, components) | `docs/BOARDLY_DESIGN_SYSTEM.md` |
