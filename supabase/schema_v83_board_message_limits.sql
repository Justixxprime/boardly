-- ===========================================================================
-- BOARDLY 2.0: schema v83, team chat messages get a size limit at the database
-- Run once in the Supabase SQL Editor, AFTER schema_v82. Safe to re-run.
--
-- The chat box in the browser should never be the only thing limiting message
-- size, anyone signed in can talk to the database directly. Now the database
-- itself refuses an empty message or one longer than 4000 characters.
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'board_messages_body_length') then
    alter table public.board_messages
      add constraint board_messages_body_length check (char_length(btrim(body)) between 1 and 4000) not valid;
    -- "not valid" skips re-checking old rows, new inserts/updates are checked.
  end if;
end
$$;
