-- ===========================================================================
-- BOARDLY 2.0: schema v71, Database Performance (Section 75)
-- Run this once in the Supabase SQL Editor. Safe to re-run, every index
-- below uses "if not exists" and none of this touches existing data or
-- structure, purely additive, per Section 89's own rule against
-- destructive changes.
--
-- Found by directly querying pg_index against every public table for
-- the exact column categories Section 75 names (user/tenant IDs,
-- status, due dates, created_at) with no matching index. 65+ columns
-- came back, across nearly every table in the project, including
-- boards.user_id itself, arguably the single most frequently filtered
-- column in the entire app (every page that loads "your boards" filters
-- on it) had no index at all until this file.
--
-- Not every flagged column is indexed here. A handful of very small,
-- rarely-listed tables were left alone (e.g. push_subscriptions,
-- board_templates) since an index only pays for itself once a table is
-- actually large enough or queried often enough for a sequential scan
-- to matter, indexing everything indiscriminately just slows down
-- every future write for no real benefit.
-- ===========================================================================

-- ---- user_id / tenant columns (the single biggest category) --------------
create index if not exists idx_boards_user_id on public.boards(user_id);
create index if not exists idx_board_members_user_id on public.board_members(user_id);
create index if not exists idx_automation_rules_user_id on public.automation_rules(user_id);
create index if not exists idx_custom_forms_user_id on public.custom_forms(user_id);
create index if not exists idx_decisions_user_id on public.decisions(user_id);
create index if not exists idx_documents_user_id on public.documents(user_id);
create index if not exists idx_milestones_user_id on public.milestones(user_id);
create index if not exists idx_proposals_user_id on public.proposals(user_id);
create index if not exists idx_task_comments_user_id on public.task_comments(user_id);
create index if not exists idx_video_workrooms_user_id on public.video_workrooms(user_id);

-- ---- board_id (the second biggest category, shared-board content) --------
create index if not exists idx_approval_history_board_id on public.approval_history(board_id);
create index if not exists idx_client_comments_board_id on public.client_comments(board_id);
create index if not exists idx_commitments_board_id on public.commitments(board_id);
create index if not exists idx_custom_form_submissions_board_id on public.custom_form_submissions(board_id);
create index if not exists idx_decisions_board_id on public.decisions(board_id);
create index if not exists idx_grading_rubrics_board_id on public.grading_rubrics(board_id);
create index if not exists idx_ideas_board_id on public.ideas(board_id);
create index if not exists idx_notifications_board_id on public.notifications(board_id);
create index if not exists idx_playbooks_board_id on public.playbooks(board_id);
create index if not exists idx_proof_comments_board_id on public.proof_comments(board_id);
create index if not exists idx_rubric_criteria_board_id on public.rubric_criteria(board_id);
create index if not exists idx_security_events_board_id on public.security_events(board_id);
create index if not exists idx_task_comments_board_id on public.task_comments(board_id);
create index if not exists idx_time_entries_board_id on public.time_entries(board_id);
create index if not exists idx_transactions_board_id on public.transactions(board_id);
create index if not exists idx_waiting_items_board_id on public.waiting_items(board_id);

-- ---- status columns actually used to filter lists (not just log/history) -
create index if not exists idx_approval_history_status on public.approval_history(status);
create index if not exists idx_proposals_status on public.proposals(status);
create index if not exists idx_marketplace_bookings_status on public.marketplace_bookings(status);
create index if not exists idx_video_workrooms_status on public.video_workrooms(status);
create index if not exists idx_tasks_approval_status on public.tasks(approval_status);

-- ---- due dates, directly powers this session's own Money/Home/Sentinel --
create index if not exists idx_tasks_due_date on public.tasks(due_date);
create index if not exists idx_invoices_due_date on public.invoices(due_date);
create index if not exists idx_commitments_due_date on public.commitments(due_date);

-- ---- created_at, ordering/pagination on lists people actually scroll ----
create index if not exists idx_boards_created_at on public.boards(created_at);
create index if not exists idx_clients_created_at on public.clients(created_at);
create index if not exists idx_invoices_created_at on public.invoices(created_at);
create index if not exists idx_transactions_created_at on public.transactions(created_at);
create index if not exists idx_tasks_created_at on public.tasks(created_at);
create index if not exists idx_proposals_created_at on public.proposals(created_at);
create index if not exists idx_documents_created_at on public.documents(created_at);
create index if not exists idx_marketplace_profiles_created_at on public.marketplace_profiles(created_at);
create index if not exists idx_marketplace_reviews_created_at on public.marketplace_reviews(created_at);
