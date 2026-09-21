-- Rolled-back test for schema_v90 + schema_v91. Nothing is saved: everything runs as one statement group and the
-- DO block ends by raising an error on purpose, which makes Postgres undo all of it.
-- Run in the Supabase SQL editor or via MCP execute_sql. Expect an error whose text starts with ALL_TESTS_PASSED.
-- ===========================================================================
-- BOARDLY - schema v90: private task attachments, STEP A (safe, additive)
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Goal (security gap F5): the "task-attachments" bucket is public, so anyone
-- who ever sees a file link can open the file forever. We move to a private
-- bucket where the app asks Supabase for a short-lived "signed link" instead.
--
-- This is done in TWO steps so the live app never breaks:
--   STEP A (this file)  adds the new rules and columns. Nothing existing stops
--                       working. The bucket is still public after this file.
--   STEP B (schema_v91) flips the bucket to private and removes the public
--                       read rule. Run it only AFTER the new app code (which
--                       uses signed links) is live on GitHub Pages.
--
-- What this file does:
--   1. storage_path_from_url(): turns an old public file link back into the
--      file's storage path, so old attachments keep working without any
--      data migration.
--   2. can_access_task_attachment(): decides who may read a file. The board
--      owner and accepted board members can read a file that belongs to a
--      task on their board. The person who uploaded a file can always read
--      their own folder.
--   3. A new read rule on storage.objects that uses that function.
--   4. proof_comments.attachment_path: pin comments used to be matched by the
--      exact file link, which changes every time a signed link is made. Now
--      they match on the stable storage path. Old rows are filled in, and a
--      trigger keeps filling it for any row an older app version saves.
-- ===========================================================================

-- 1. Old public link -> storage path (also understands signed links) --------
create or replace function public.storage_path_from_url(u text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  raw text;
begin
  if u is null then return null; end if;
  raw := substring(u from '/storage/v1/object/(?:public|sign|authenticated)/task-attachments/([^?#]+)');
  if raw is null then return null; end if;
  -- decode %XX escapes (spaces, commas, unicode) back to the real file name
  return convert_from(
    (select string_agg(
              case when m[1] ~ '^%[0-9A-Fa-f]{2}$' then decode(substr(m[1], 2, 2), 'hex')
                   else convert_to(m[1], 'UTF8') end,
              ''::bytea order by ord)
       from regexp_matches(raw, '(%[0-9A-Fa-f]{2}|[^%]+|%)', 'g') with ordinality as t(m, ord)),
    'UTF8');
exception when others then
  return null;
end;
$$;

-- 2. Who may read an attachment file ------------------------------------------
-- File names look like  <uploader-user-id>/<task-id>-<timestamp>-<name>
create or replace function public.can_access_task_attachment(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  folder text;
  file_part text;
  task_uuid uuid;
  task_board uuid;
begin
  if uid is null or object_name is null then return false; end if;

  folder := split_part(object_name, '/', 1);
  -- the uploader can always read their own folder
  if folder = uid::text then return true; end if;

  -- otherwise: find the task named at the start of the file name
  file_part := lower(split_part(object_name, '/', 2));
  if file_part !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' then return false; end if;
  task_uuid := substring(file_part from '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')::uuid;

  select board_id into task_board from public.tasks where id = task_uuid;
  if task_board is null then return false; end if;

  return public.user_owns_board(task_board) or public.user_is_board_member(task_board);
end;
$$;

revoke all on function public.can_access_task_attachment(text) from public;
grant execute on function public.can_access_task_attachment(text) to authenticated;

-- 3. New read rule (the old public read rule is removed in STEP B) ------------
drop policy if exists "board people can read task attachments" on storage.objects;
create policy "board people can read task attachments" on storage.objects
  for select to authenticated
  using (bucket_id = 'task-attachments' and public.can_access_task_attachment(name));

-- 4. Proofing pins: match on the stable storage path ---------------------------
alter table public.proof_comments add column if not exists attachment_path text;
alter table public.proof_comments alter column attachment_url drop not null;

alter table public.proof_comments drop constraint if exists proof_comments_has_target;
alter table public.proof_comments add constraint proof_comments_has_target
  check (attachment_url is not null or attachment_path is not null);

create index if not exists idx_proof_comments_attachment_path on public.proof_comments(attachment_path);

-- fill old rows
update public.proof_comments
   set attachment_path = public.storage_path_from_url(attachment_url)
 where attachment_path is null and attachment_url is not null;

-- keep filling it if an older app version saves a pin with only a link
create or replace function public.proof_comments_fill_path()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.attachment_path is null and new.attachment_url is not null then
    new.attachment_path := public.storage_path_from_url(new.attachment_url);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proof_comments_fill_path on public.proof_comments;
create trigger trg_proof_comments_fill_path
  before insert or update of attachment_url, attachment_path on public.proof_comments
  for each row execute function public.proof_comments_fill_path();
-- ===========================================================================
-- BOARDLY - schema v91: private task attachments, STEP B (the flip)
-- Run this ONLY AFTER:
--   * schema_v90 has been run, and
--   * the new app code (signed links, boardly-shell-v15 or newer) is live,
--     and a real browser test showed uploads and old files still open.
-- Safe to re-run.
--
-- After this file, a file link no longer works for the public. Only signed
-- in people who pass can_access_task_attachment() can ask for a signed link.
--
-- TO UNDO (if something looks wrong, run these two lines):
--   update storage.buckets set public = true where id = 'task-attachments';
--   create policy "anyone can read attachments" on storage.objects
--     for select to public using (bucket_id = 'task-attachments');
-- ===========================================================================

update storage.buckets set public = false where id = 'task-attachments';

drop policy if exists "anyone can read attachments" on storage.objects;
do $test$
declare
  o uuid := gen_random_uuid();  -- board owner
  e uuid := gen_random_uuid();  -- editor member
  v uuid := gen_random_uuid();  -- viewer member
  s uuid := gen_random_uuid();  -- stranger (not on the board)
  p uuid := gen_random_uuid();  -- invited but NOT accepted yet
  b uuid;
  t uuid;
  n_a text; n_b text; n_s text; n_t text; n_o text;
  seen text;
  rep text := '';
  cnt int;
  ok boolean;
  real_task record;
  real_path text;
  real_owner uuid;
begin
  -- ---------- fixtures (all rolled back at the end) ----------
  insert into auth.users (id, email, aud, role) values
    (o, 'o@test.local', 'authenticated', 'authenticated'),
    (e, 'e@test.local', 'authenticated', 'authenticated'),
    (v, 'v@test.local', 'authenticated', 'authenticated'),
    (s, 's@test.local', 'authenticated', 'authenticated'),
    (p, 'p@test.local', 'authenticated', 'authenticated');
  insert into public.boards (user_id, name) values (o, 'Attachment test board') returning id into b;
  insert into public.tasks (user_id, board_id, title) values (o, b, 'Task with files') returning id into t;
  insert into public.board_members (board_id, invited_email, role, invited_by, user_id, accepted_at) values
    (b, 'e@test.local', 'editor', o, e, now()),
    (b, 'v@test.local', 'viewer', o, v, now()),
    (b, 'p@test.local', 'viewer', o, p, null);

  n_a := o || '/' || t || '-111-a.png';                        -- owner uploaded, task on board
  n_b := e || '/' || t || '-222-b.png';                        -- editor uploaded, task on board
  n_s := s || '/' || t || '-333-sneaky.png';                   -- stranger uploaded into OWN folder, names the task
  n_t := o || '/temp-999-x.png';                               -- owner file with a temp (non-uuid) task id
  n_o := o || '/' || gen_random_uuid() || '-444-orphan.png';   -- owner file, task does not exist
  insert into storage.objects (bucket_id, name) values
    ('task-attachments', n_a), ('task-attachments', n_b), ('task-attachments', n_s),
    ('task-attachments', n_t), ('task-attachments', n_o);

  -- ---------- apply STEP A and STEP B inside this rolled-back transaction ----------
  -- (the migration text is placed before this DO block by the assembled test file)

  -- helper to see which fixture files a given person can read through storage RLS
  -- ---------- OWNER ----------
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', o::text, true);
  set local role authenticated;
  select coalesce(string_agg(k, ',' order by k), '') into seen from (
    select case name when n_a then 'a' when n_b then 'b' when n_s then 's' when n_t then 't' when n_o then 'o' end k
    from storage.objects where bucket_id = 'task-attachments' and name in (n_a, n_b, n_s, n_t, n_o)) x;
  reset role;
  if seen <> 'a,b,o,s,t' then raise exception 'FAIL owner saw [%] expected [a,b,o,s,t]', seen; end if;
  rep := rep || 'owner sees own files plus every file on their board: ok' || E'\n';

  -- ---------- EDITOR MEMBER ----------
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', e::text, true);
  set local role authenticated;
  select coalesce(string_agg(k, ',' order by k), '') into seen from (
    select case name when n_a then 'a' when n_b then 'b' when n_s then 's' when n_t then 't' when n_o then 'o' end k
    from storage.objects where bucket_id = 'task-attachments' and name in (n_a, n_b, n_s, n_t, n_o)) x;
  reset role;
  if seen <> 'a,b,s' then raise exception 'FAIL editor saw [%] expected [a,b,s]', seen; end if;
  rep := rep || 'editor member sees files of tasks on the shared board only: ok' || E'\n';

  -- ---------- VIEWER MEMBER ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v::text, true);
  set local role authenticated;
  select coalesce(string_agg(k, ',' order by k), '') into seen from (
    select case name when n_a then 'a' when n_b then 'b' when n_s then 's' when n_t then 't' when n_o then 'o' end k
    from storage.objects where bucket_id = 'task-attachments' and name in (n_a, n_b, n_s, n_t, n_o)) x;
  reset role;
  if seen <> 'a,b,s' then raise exception 'FAIL viewer saw [%] expected [a,b,s]', seen; end if;
  rep := rep || 'viewer member can read (view only): ok' || E'\n';

  -- ---------- STRANGER ----------
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', s::text, true);
  set local role authenticated;
  select coalesce(string_agg(k, ',' order by k), '') into seen from (
    select case name when n_a then 'a' when n_b then 'b' when n_s then 's' when n_t then 't' when n_o then 'o' end k
    from storage.objects where bucket_id = 'task-attachments' and name in (n_a, n_b, n_s, n_t, n_o)) x;
  reset role;
  if seen <> 's' then raise exception 'FAIL stranger saw [%] expected only [s]', seen; end if;
  rep := rep || 'stranger sees ONLY their own folder, nothing from the board: ok' || E'\n';

  -- ---------- PENDING (not accepted) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
  set local role authenticated;
  select count(*) into cnt from storage.objects where bucket_id = 'task-attachments' and name in (n_a, n_b, n_s, n_t, n_o);
  reset role;
  if cnt <> 0 then raise exception 'FAIL pending invitee saw % files, expected 0', cnt; end if;
  rep := rep || 'invited-but-not-accepted person sees nothing: ok' || E'\n';

  -- ---------- ANON (not signed in) ----------
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  select count(*) into cnt from storage.objects where bucket_id = 'task-attachments' and name in (n_a, n_b, n_s, n_t, n_o);
  reset role;
  if cnt <> 0 then raise exception 'FAIL anon saw % files, expected 0 (bucket still readable by the public)', cnt; end if;
  rep := rep || 'signed-out visitor sees nothing: ok' || E'\n';

  -- ---------- UPLOAD rule unchanged: cannot write into someone else's folder ----------
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', s::text, true);
  set local role authenticated;
  begin
    insert into storage.objects (bucket_id, name) values ('task-attachments', o || '/' || t || '-555-hijack.png');
    reset role;
    raise exception 'FAIL stranger could upload into the owner folder';
  exception when insufficient_privilege then
    reset role;
    rep := rep || 'stranger cannot upload into the owner folder: ok' || E'\n';
  end;
  set local role authenticated;
  insert into storage.objects (bucket_id, name) values ('task-attachments', s || '/' || t || '-666-mine.png');
  reset role;
  rep := rep || 'stranger can upload into their own folder: ok' || E'\n';

  -- ---------- bucket is private and the public read rule is gone ----------
  select public into ok from storage.buckets where id = 'task-attachments';
  if ok then raise exception 'FAIL bucket is still public'; end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'anyone can read attachments') then
    raise exception 'FAIL public read policy still exists';
  end if;
  rep := rep || 'bucket is private, public read rule removed: ok' || E'\n';

  -- ---------- REAL DATA: every stored attachment link maps to a real file ----------
  select count(*) into cnt from (
    select a.item->>'url' u
    from public.tasks tk, jsonb_array_elements(case when jsonb_typeof(tk.attachments) = 'array' then tk.attachments else '[]'::jsonb end) a(item)
    where a.item->>'url' like '%/storage/v1/object/public/task-attachments/%') items
  where not exists (select 1 from storage.objects so where so.bucket_id = 'task-attachments' and so.name = public.storage_path_from_url(items.u));
  if cnt <> 0 then raise exception 'FAIL % old attachment links do not map to a real storage file', cnt; end if;
  select count(*) into cnt from public.tasks tk, jsonb_array_elements(case when jsonb_typeof(tk.attachments) = 'array' then tk.attachments else '[]'::jsonb end) a(item)
   where a.item->>'url' like '%/storage/v1/object/public/task-attachments/%';
  rep := rep || 'all ' || cnt || ' existing attachment links decode to a real file path: ok' || E'\n';

  -- ---------- REAL DATA: existing proof pin got its path filled in ----------
  select count(*) into cnt from public.proof_comments where attachment_url is not null and attachment_path is null
     and attachment_url like '%/storage/v1/object/public/task-attachments/%';
  if cnt <> 0 then raise exception 'FAIL % proof pins have no path after backfill', cnt; end if;
  select count(*) into cnt from public.proof_comments pc where attachment_path is not null
     and not exists (select 1 from storage.objects so where so.bucket_id = 'task-attachments' and so.name = pc.attachment_path);
  if cnt <> 0 then raise exception 'FAIL % proof pin paths point at no file', cnt; end if;
  rep := rep || 'existing proof pins backfilled with real paths: ok' || E'\n';

  -- ---------- trigger + constraint on proof_comments ----------
  insert into public.proof_comments (task_id, board_id, attachment_url, x, y, body, author_id)
  values (t, b, 'https://x.supabase.co/storage/v1/object/public/task-attachments/' || o || '/' || t || '-111-a.png', 10, 10, 'old-app pin', o);
  select attachment_path into real_path from public.proof_comments where body = 'old-app pin';
  if real_path is distinct from (o || '/' || t || '-111-a.png') then raise exception 'FAIL trigger produced [%]', real_path; end if;
  insert into public.proof_comments (task_id, board_id, attachment_path, x, y, body, author_id)
  values (t, b, o || '/' || t || '-111-a.png', 20, 20, 'new-app pin (no url)', o);
  insert into public.proof_comments (task_id, board_id, attachment_url, x, y, body, author_id)
  values (t, b, 'https://example.com/pasted-plain-link.png', 30, 30, 'plain link pin', o);
  select attachment_path into real_path from public.proof_comments where body = 'plain link pin';
  if real_path is not null then raise exception 'FAIL plain link got a path [%]', real_path; end if;
  begin
    insert into public.proof_comments (task_id, board_id, x, y, body, author_id) values (t, b, 40, 40, 'no target', o);
    raise exception 'FAIL pin with no url and no path was accepted';
  exception when check_violation then null;
  end;
  rep := rep || 'proof pins: trigger fills path, no-url pin works, plain link stays url-only, empty target rejected: ok' || E'\n';

  -- ---------- decoder edge cases ----------
  if public.storage_path_from_url('https://x/storage/v1/object/public/task-attachments/a/b%20c,%20d.png?x=1') <> 'a/b c, d.png' then raise exception 'FAIL decode spaces/commas'; end if;
  if public.storage_path_from_url('https://x/storage/v1/object/sign/task-attachments/a/b.png?token=abc') <> 'a/b.png' then raise exception 'FAIL decode signed url'; end if;
  if public.storage_path_from_url('https://x/storage/v1/object/public/task-attachments/a/caf%C3%A9.png') <> 'a/café.png' then raise exception 'FAIL decode utf8'; end if;
  if public.storage_path_from_url('https://example.com/file.png') is not null then raise exception 'FAIL decode of a plain link should be null'; end if;
  rep := rep || 'link decoder edge cases (spaces, commas, signed links, accents, plain links): ok' || E'\n';

  -- ---------- REAL DATA: a real board owner can read a real file the function way ----------
  select tk.board_id, (a.item->>'url') u, bo.user_id owner_id into real_task
  from public.tasks tk
  join public.boards bo on bo.id = tk.board_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(tk.attachments) = 'array' then tk.attachments else '[]'::jsonb end) a(item)
  where a.item->>'url' like '%/storage/v1/object/public/task-attachments/%'
  limit 1;
  if real_task is null then
    rep := rep || 'no real attachment found to spot check (skipped)' || E'\n';
  else
    real_path := public.storage_path_from_url(real_task.u);
    perform set_config('request.jwt.claims', json_build_object('sub', real_task.owner_id, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', real_task.owner_id::text, true);
    if not public.can_access_task_attachment(real_path) then raise exception 'FAIL real owner cannot access a real file'; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
    if public.can_access_task_attachment(real_path) then raise exception 'FAIL random person can access a real file'; end if;
    rep := rep || 'real file: real board owner allowed, random signed-in person denied: ok' || E'\n';
  end if;

  raise exception E'ALL_TESTS_PASSED (nothing was saved, this run rolls back)\n%', rep;
end;
$test$;
