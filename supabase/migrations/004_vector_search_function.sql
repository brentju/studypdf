-- Vector similarity search function for RAG
-- Uses pgvector's cosine distance operator (<=>)

-- Drop existing function if it exists (handle signature changes)
DROP FUNCTION IF EXISTS match_content_chunks(vector, float, int, uuid, uuid);
DROP FUNCTION IF EXISTS match_content_chunks(vector(1536), float, int, uuid, uuid);

CREATE OR REPLACE FUNCTION match_content_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  filter_textbook_id uuid DEFAULT NULL,
  filter_chapter_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  textbook_id uuid,
  chapter_id uuid,
  content text,
  chunk_index int,
  embedding vector(1536),
  metadata jsonb,
  created_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cc.id,
    cc.textbook_id,
    cc.chapter_id,
    cc.content,
    cc.chunk_index,
    cc.embedding,
    cc.metadata,
    cc.created_at,
    1 - (cc.embedding <=> query_embedding) AS similarity
  FROM content_chunks cc
  WHERE
    -- Only search chunks that have embeddings
    cc.embedding IS NOT NULL
    -- Apply optional filters
    AND (filter_textbook_id IS NULL OR cc.textbook_id = filter_textbook_id)
    AND (filter_chapter_id IS NULL OR cc.chapter_id = filter_chapter_id)
    -- Filter by similarity threshold
    AND (1 - (cc.embedding <=> query_embedding)) > match_threshold
  ORDER BY cc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION match_content_chunks(
  vector(1536),
  double precision,
  integer,
  uuid,
  uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION match_content_chunks(
  vector(1536),
  double precision,
  integer,
  uuid,
  uuid
) TO service_role;

