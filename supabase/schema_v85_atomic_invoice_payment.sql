-- Boardly schema v85
-- F7 fix (BOARDLY_SECURITY_2.md): confirming an invoice payment used to be
-- several separate calls from the Edge Function (mark the transaction
-- confirmed, read the invoice, read the ledger, update the invoice). If the
-- invoice update failed, the ledger said "paid" but the invoice kept its old
-- status, and because the webhook answered 200 anyway, Paystack never retried.
-- This function does the whole confirmation inside ONE database transaction,
-- locks the transaction row and the invoice row so two webhooks arriving at
-- the same moment cannot interfere, and only the service role may run it.
-- Same checks as before: type payment, still pending, same amount, same
-- currency. Nothing here trusts the browser; only the Edge Functions that
-- already verified Paystack's signature call it.

create or replace function public._json_num(j jsonb)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(j) = 'number' then (j #>> '{}')::numeric
    when jsonb_typeof(j) = 'string' and (j #>> '{}') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then (j #>> '{}')::numeric
    else 0
  end;
$$;

create or replace function public.confirm_invoice_payment(
  p_reference   text,
  p_paid_minor  bigint,
  p_currency    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn      public.transactions%rowtype;
  v_invoice  public.invoices%rowtype;
  v_total    numeric := 0;
  v_paid     numeric := 0;
  v_status   text;
begin
  -- Lock the pending payment row first. A second webhook for the same
  -- reference waits here, then sees status = confirmed and does nothing.
  select * into v_txn
    from public.transactions
   where idempotency_key = p_reference
     and type = 'payment'
   for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if v_txn.status <> 'pending' then
    return jsonb_build_object('result', 'already_handled');
  end if;

  if p_paid_minor is null or round(v_txn.amount * 100) <> p_paid_minor then
    return jsonb_build_object('result', 'amount_mismatch');
  end if;

  -- 500 USD and 500 NGN are both 50000 minor units, so the currency has to
  -- match too. A missing currency counts as a mismatch.
  if upper(coalesce(p_currency, '')) <> upper(coalesce(v_txn.currency, 'NGN')) then
    return jsonb_build_object('result', 'currency_mismatch');
  end if;

  update public.transactions set status = 'confirmed' where id = v_txn.id;

  if v_txn.invoice_id is null then
    return jsonb_build_object('result', 'confirmed');
  end if;

  select * into v_invoice from public.invoices where id = v_txn.invoice_id for update;
  if not found then
    return jsonb_build_object('result', 'confirmed');
  end if;

  select coalesce(sum(public._json_num(item -> 'quantity') * public._json_num(item -> 'unit_price')), 0)
    into v_total
    from jsonb_array_elements(
           case when jsonb_typeof(v_invoice.line_items) = 'array' then v_invoice.line_items else '[]'::jsonb end
         ) as item;

  select coalesce(sum(case when type = 'payment' then amount else -amount end), 0)
    into v_paid
    from public.transactions
   where invoice_id = v_invoice.id
     and status = 'confirmed'
     and type in ('payment', 'refund');

  v_status := case
    when v_paid >= v_total - 0.005 then 'paid'
    when v_paid > 0 then 'partially_paid'
    else 'sent'
  end;

  update public.invoices set status = v_status where id = v_invoice.id;

  return jsonb_build_object('result', 'confirmed', 'invoice_status', v_status, 'paid', v_paid, 'total', v_total);
end;
$$;

revoke all on function public._json_num(jsonb) from public, anon, authenticated;
revoke all on function public.confirm_invoice_payment(text, bigint, text) from public, anon, authenticated;
grant execute on function public.confirm_invoice_payment(text, bigint, text) to service_role;
grant execute on function public._json_num(jsonb) to service_role;
