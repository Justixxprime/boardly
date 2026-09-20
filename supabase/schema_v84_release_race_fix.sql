-- Boardly schema v84
-- F17 fix (BOARDLY_SECURITY_2.md): marketplace-release-payment could send a
-- Paystack transfer twice if two requests raced each other, because the
-- function checked status = paid_held and only updated to released AFTER
-- the transfer call, leaving a window where a second request could pass
-- the same check. Adding a releasing status lets the function claim the
-- booking first, with an update that only succeeds for one request.
-- Applied live on Supabase project cafhqxzjujvxmarvkbxd on 2026-09-20.

alter table marketplace_bookings
  drop constraint marketplace_bookings_status_check;

alter table marketplace_bookings
  add constraint marketplace_bookings_status_check
  check (status = any (array['pending_payment'::text, 'paid_held'::text, 'releasing'::text, 'released'::text, 'refunded'::text, 'cancelled'::text]));
