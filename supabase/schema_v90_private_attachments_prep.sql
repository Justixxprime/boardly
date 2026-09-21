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
