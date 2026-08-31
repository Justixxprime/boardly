-- ===========================================================================
-- BOARDLY - schema v43 migration: Memory Vault now covers Ideas + Playbooks
--
-- Run this in Supabase SQL Editor. Two features added later than Memory
-- Vault itself (Idea Vault, Playbooks) were invisible to "search
-- everything you've ever written" - this closes that gap.
--
-- Same pattern as schema_v29_memory_vault_embeddings.sql: one nullable
-- embedding column per table, an HNSW index, and search_memory_vault
-- recreated (via "create or replace") to also search these two tables.
-- Needs schema_v29 to have been run first (for the `vector` extension
-- and the function this replaces) - if it hasn't, this will fail
-- clearly on the "vector(768)" column type rather than doing anything
-- half-finished.
-- ===========================================================================

alter table public.ideas add column if not exists embedding vector(768);
alter table public.playbooks add column if not exists embedding vector(768);

create index if not exists ideas_embedding_idx on public.ideas using hnsw (embedding vector_cosine_ops);
create index if not exists playbooks_embedding_idx on public.playbooks using hnsw (embedding vector_cosine_ops);

create or replace function search_memory_vault(query_embedding vector(768), match_count int default 20)
returns table (
  source_type text,
  id uuid,
  board_id uuid,
  task_id uuid,
  title text,
  snippet text,
  similarity float
)
language sql
stable
as $$
  select * from (
    select 'task'::text as source_type, id, board_id, id as task_id,
           title, coalesce(notes, '') as snippet,
           1 - (embedding <=> query_embedding) as similarity
    from tasks
    where embedding is not null

    union all

    select 'decision', id, board_id, null::uuid,
           decision as title, coalesce(reason, alternatives, '') as snippet,
           1 - (embedding <=> query_embedding)
    from decisions
    where embedding is not null

    union all

    select 'comment', id, board_id, task_id,
           author_name as title, coalesce(body, '') as snippet,
           1 - (embedding <=> query_embedding)
    from client_comments
    where embedding is not null

    union all

    select 'commitment', id, board_id, null::uuid,
           what as title, coalesce(to_whom, '') as snippet,
           1 - (embedding <=> query_embedding)
    from commitments
    where embedding is not null

    union all

    select 'waiting', id, board_id, null::uuid,
           what as title, coalesce(who, '') as snippet,
           1 - (embedding <=> query_embedding)
    from waiting_items
    where embedding is not null

    union all

    select 'idea', id, board_id, null::uuid,
           title, coalesce(description, '') as snippet,
           1 - (embedding <=> query_embedding)
    from public.ideas
    where embedding is not null

    union all

    select 'playbook', id, board_id, null::uuid,
           title, coalesce(content, '') as snippet,
           1 - (embedding <=> query_embedding)
    from public.playbooks
    where embedding is not null
  ) combined
  order by similarity desc
  limit match_count;
$$;
