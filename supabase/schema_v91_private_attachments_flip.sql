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
