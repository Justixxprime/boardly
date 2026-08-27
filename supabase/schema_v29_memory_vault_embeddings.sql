-- ==========================================================================
-- BOARDLY - schema v29 migration: Memory Vault embeddings (real semantic search)
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
--
-- WHY THIS IS SAFE TO RUN: pgvector is a free extension that already
-- ships with every Supabase project - "create extension" here doesn't
-- install anything new or cost anything, it just turns a feature
-- that's already sitting in your database on. Everything else here
-- is one new "embedding" column per table (nullable - existing rows
-- just start out unindexed until the "Build search index" button in
-- Memory Vault processes them) plus one new search function.
--
-- WHY 768 DIMENSIONS: Google's gemini-embedding-001 model can output
-- anywhere from 128 to 3072 numbers per embedding. 768 is Google's
-- own recommended default for most applications - it keeps storage
-- and search speed reasonable while losing only a fraction of a
-- percent of accuracy compared to the full 3072-dimension version.
-- If you ever change which size you request from the embedding
-- function, every embedding already stored would need to be rebuilt
-- at the new size - vectors of different lengths can't be compared.
--
-- WHY search_memory_vault IS A PLAIN FUNCTION, NOT SECURITY DEFINER:
-- a "security definer" function would run with elevated privileges
-- and bypass RLS - dangerous for a function that searches five
-- different tables. This one deliberately runs as the calling user,
-- so it only ever searches rows that user's own RLS policies already
-- let them see - the exact same protection every other query in
-- Boardly already has.
-- ==========================================================================

create extension if not exists vector;

alter table tasks add column if not exists embedding vector(768);
alter table decisions add column if not exists embedding vector(768);
alter table client_comments add column if not exists embedding vector(768);
alter table commitments add column if not exists embedding vector(768);
alter table waiting_items add column if not exists embedding vector(768);

-- HNSW indexes speed up similarity search as your data grows - cheap
-- to have even at small scale, and they only index rows that already
-- have an embedding (nothing to index on a fresh install).
create index if not exists tasks_embedding_idx on tasks using hnsw (embedding vector_cosine_ops);
create index if not exists decisions_embedding_idx on decisions using hnsw (embedding vector_cosine_ops);
create index if not exists client_comments_embedding_idx on client_comments using hnsw (embedding vector_cosine_ops);
create index if not exists commitments_embedding_idx on commitments using hnsw (embedding vector_cosine_ops);
create index if not exists waiting_items_embedding_idx on waiting_items using hnsw (embedding vector_cosine_ops);

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
  ) combined
  order by similarity desc
  limit match_count;
$$;
