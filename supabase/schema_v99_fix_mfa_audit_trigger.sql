-- ===========================================================================
-- BOARDLY - schema v99 migration: Fix incompatible MFA audit trigger
--
-- schema_v97 assumed auth.mfa_challenges exposed a `verified_at` field.
-- Supabase Auth now invokes that trigger while writing auth.mfa_amr_claims,
-- whose NEW record has no such field. PostgreSQL aborts the Auth transaction,
-- so password login fails with error 500.
--
-- Remove only that optional audit trigger/function. MFA itself is not changed;
-- it merely stops recording the mfa_challenge_passed audit event until a
-- supported, version-compatible Auth hook is implemented.
-- ===========================================================================

do $$
declare
  trigger_row record;
begin
  -- The exact Auth table can vary between Supabase Auth versions. Locate every
  -- non-system trigger that calls this one Boardly function instead of naming
  -- a table and risking another version-specific failure.
  for trigger_row in
    select trigger_ns.nspname as trigger_schema,
           trigger_table.relname as table_name,
           trigger_def.tgname as trigger_name
    from pg_trigger trigger_def
    join pg_class trigger_table on trigger_table.oid = trigger_def.tgrelid
    join pg_namespace trigger_ns on trigger_ns.oid = trigger_table.relnamespace
    where not trigger_def.tgisinternal
      and trigger_def.tgfoid = to_regprocedure('public.log_mfa_challenge_passed()')
  loop
    execute format(
      'drop trigger if exists %I on %I.%I',
      trigger_row.trigger_name,
      trigger_row.trigger_schema,
      trigger_row.table_name
    );
  end loop;
end;
$$;

drop function if exists public.log_mfa_challenge_passed();
