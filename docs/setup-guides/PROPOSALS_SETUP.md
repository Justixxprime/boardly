# Setting up: Proposals & Quotes

Phase 6 of the master build spec: Client/Business. Client Portal and
Marketplace already cover ongoing client work and paid bookings - this
is the step BEFORE either of those: sending a prospective client a
quote with line items and a total, and getting a clean accept or
decline back.

## Already deployed

This was built and deployed live during the same session it was
designed in - `supabase/schema_v59_proposals.sql` has already been run,
and both `get-proposal-info` and `respond-to-proposal` are already
live Edge Functions. You don't need to run anything for this one -
just pull the code and push.

```
git add .
git commit -m "Add Proposals & Quotes (Phase 6)"
git push
```

## Why this is NOT an invoice

This deliberately stops short of being a payment tool. It has no
"paid" status, no payment processor hooked up, nothing. That's on
purpose, matching the same boundary Client Work's own fields already
draw ("deliberately NOT an invoice or a payment record"). Marketplace
already has real payment handling (Paystack escrow) for when a booking
is actually being paid for - this is purely the quoting conversation
that happens before any of that, when you just need the client to say
"yes, go ahead" or "no, thanks."

## How to use it

1. Open a board, click **More tools**, then **Proposals**.
2. Click **New proposal**. Give it a title, optionally a client name/
   email and an intro message, and pick a currency.
3. Add line items one at a time - a description, quantity, and unit
   price. The running total updates as you add them.
4. Click **Save proposal** - it stays a private draft at this point,
   fully editable.
5. Back on the list, click the paper-plane icon to **send** it. This
   publishes its public link (copied to your clipboard automatically)
   and moves it out of draft.
6. Send that link to your client however you'd normally reach them -
   email, WhatsApp, whatever. They'll see a clean page with your line
   items and total, and two buttons: **Accept** or **Decline**.
7. Once they respond, you get a notification, and the proposal's
   status updates to Accepted or Declined - visible right there in the
   list.

## A couple of things worth knowing

**Sending is one-way.** There's no "unsend" button, matching how the
client's own accept/decline is also one-way (see `respond-to-proposal`'s
own comment on that) - if a client responds, that response is final
through that link. A draft can be freely rewritten before sending; once
it's out, the fields aren't hard-locked, but treat "sent" as final in
spirit - a client should never end up looking at different numbers
than what they were actually quoted.

**Owner-only for now**, matching Boardly Autopilot's and the Custom
Form Builder's own precedent - an invited editor on your board can't
send proposals on your behalf yet. If that ever needs to change, it's
a small, deliberate addition later, not assumed here.

**No invoice, no payment, on purpose.** If Boardly ever adds real
invoicing or payment collection, that would be a distinctly bigger,
separate decision (a payment processor for subscriptions doesn't exist
yet either, per the standing project rule against building a fake
"Upgrade" button) - this tool intentionally stays in its lane as a
yes/no quoting document.
