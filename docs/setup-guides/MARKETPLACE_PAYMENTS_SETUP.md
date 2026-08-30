# Setting up: Marketplace payments, booking & escrow (Paystack)

## Read this part first — what this actually does, honestly

The master plan always listed payment/booking/escrow as its own
conversation, needing a real provider decision first. This picks
**Paystack** — it's the one built for exactly this situation: you're in
Lagos, payouts go to Nigerian bank accounts in naira, and Paystack's
API means Boardly never has to touch a card number at all — the client
pays on Paystack's own hosted page, not inside Boardly.

**What "escrow" means here, literally:** a client pays the FULL amount
upfront. That money sits in *your* Paystack balance — the provider
can't touch it — until the CLIENT THEMSELVES confirms the work is
done. Only then does Boardly send the provider their cut. That's a
real, meaningful protection for the person paying, not just a payment
button with fancier branding.

**What this does NOT do (stated plainly, not glossed over):**
- No automatic release after a timeout. If a client pays and then
  vanishes without ever confirming, that money sits parked until you
  sort it out by hand from the Supabase dashboard.
- No dispute resolution or refund flow. If a job goes wrong, that's a
  conversation between you and your client — Boardly just holds the
  record of what was paid and when.
- Real transfers to a provider's bank account only work once Paystack
  has verified your business (their normal live-account KYC) — see
  Step 5 below.

If any of that doesn't sit right for how you want to run this, don't
run this migration — the plain directory from `MARKETPLACE_SETUP.md`
keeps working exactly as it does today either way.

---

## Step 1: get a Paystack account

1. Go to https://dashboard.paystack.com/#/signup and sign up (free,
   no card needed to start).
2. You'll land in **Test Mode** by default — good, that's where you'll
   do your first end-to-end test in Step 6.
3. Go to **Settings → API Keys & Webhooks**. Copy your **Secret Key**
   (starts with `sk_test_...` while in Test Mode).

---

## Step 2: run the database migration

Supabase → SQL Editor → New query → paste the whole contents of
`supabase/schema_v33_marketplace_payments.sql` → Run. Adds one column
and two new tables — nothing existing changes.

---

## Step 3: set your secret and deploy the five new functions

```
supabase secrets set PAYSTACK_SECRET_KEY=sk_test_your_real_key_here

supabase functions deploy marketplace-setup-payout
supabase functions deploy marketplace-create-booking --no-verify-jwt
supabase functions deploy marketplace-payment-webhook --no-verify-jwt
supabase functions deploy marketplace-booking-status --no-verify-jwt
supabase functions deploy marketplace-release-payment --no-verify-jwt
```

Only `marketplace-setup-payout` is deployed *without* `--no-verify-jwt`
— it's the one place a signed-in Boardly account (you, or another
provider using your Boardly) has to prove who they are. The other four
are all reached by people with no Boardly login at all (your clients),
so they can't require a login token to call.

---

## Step 4: point Paystack at your webhook

1. Run `supabase functions list` and copy the URL shown for
   `marketplace-payment-webhook` (looks like
   `https://<your-project-ref>.supabase.co/functions/v1/marketplace-payment-webhook`).
2. Back in Paystack → **Settings → API Keys & Webhooks**, paste that
   into the **Webhook URL** field and save.

This is how Boardly finds out a payment actually succeeded — Paystack
calls this URL the moment a client finishes paying.

---

## Step 5: copy the updated/new files in

- `dashboard.html`, `js/marketplace.js` (updated — new Payouts and
  Bookings tabs; no CSS changes needed, this feature reuses the
  existing Marketplace modal's styling)
- `marketplace.html`, `js/marketplace-public.js` (updated — a "Book &
  pay" form now shows on any profile that's finished payout setup)
- `booking-status.html`, `js/booking-status.js` (brand new — where a
  client lands after paying, and where they release payment later)

```
git add .
git commit -m "Add Marketplace payments, booking & escrow (Paystack)"
git push
```

---

## Step 6: try the whole thing, start to finish, in Test Mode

1. In Boardly, open **Marketplace → Payouts**. Pick any bank, and for
   the account number use one of Paystack's published test account
   numbers for Test Mode (search "Paystack test bank account numbers"
   in their docs — they publish a few that always resolve successfully
   without needing a real account). Save.
2. Make sure your Marketplace profile is also published (**My
   Profile** tab → tick "Publish this profile").
3. Open your public link (`marketplace.html?u=your-user-id`) in another
   browser/incognito window. You should now see a **Book & pay** card.
4. Fill it in with a test amount (e.g. ₦500) and submit — you're
   redirected to Paystack's hosted checkout.
5. Paystack's docs also publish test card numbers that always succeed
   in Test Mode — use one of those to "pay."
6. You'll land back on `booking-status.html`, first showing "still
   confirming," then flipping to "Payment received and held safely."
7. Tap **Confirm the work is done & release payment**.
8. Back in Boardly → **Marketplace → Bookings**, that booking should
   now say "Released to you."

If step 7 fails with a Paystack error about transfers - that's
expected in Test Mode (see the note below) - everything up through
step 6 working means your whole setup is correct.

---

## Step 7 (whenever you're ready for real money): go live

1. In Paystack, complete their business verification (their own KYC
   flow — bank details, business info, sometimes an ID). This is
   required before Paystack allows real Transfers, not something
   Boardly can skip around.
2. Once verified, get your **Live** secret key and run:
   `supabase secrets set PAYSTACK_SECRET_KEY=sk_live_your_real_key_here`
   then re-paste your webhook URL into the Live-mode webhook field too
   (Paystack keeps Test and Live webhook URLs separate).
3. In Paystack → **Settings → Preferences**, check whether "OTP for
   transfers" is enabled. If it is, an unattended transfer call (which
   is exactly what `marketplace-release-payment` makes) will get stuck
   waiting for a one-time code sent to your phone instead of
   completing. Turning this off is what makes automatic release
   actually complete on its own. This setting exists for your account's
   own protection, so only turn it off once you're comfortable with
   that trade-off.

---

## Tuning the platform fee

Boardly takes a cut only when a booking is actually released — never
upfront, never if a booking is never paid. Default is 10%. To change
it without redeploying any code:

```
supabase secrets set MARKETPLACE_PLATFORM_FEE_PERCENT=15
```

(or whatever number you want — this only affects what's transferred to
the provider at release time going forward.)

---

## If something breaks

```
supabase functions logs marketplace-create-booking
supabase functions logs marketplace-payment-webhook
supabase functions logs marketplace-release-payment
```

Send me exactly what any of those print. The single most common issue
is the webhook URL being pasted into the wrong mode (Test vs Live) in
Paystack's dashboard — double check you're editing the same mode your
`PAYSTACK_SECRET_KEY` secret is currently set to.
