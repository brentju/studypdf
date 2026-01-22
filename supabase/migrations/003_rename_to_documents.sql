-- Migration: Rename textbooks to documents and support multiple file types
-- This migration renames the textbooks table to documents and updates all references

-- Step 1: Rename the table
ALTER TABLE textbooks RENAME TO documents;

-- Step 2: Rename pdf_url to file_url and add file_type column
ALTER TABLE documents RENAME COLUMN pdf_url TO file_url;
ALTER TABLE documents ADD COLUMN file_type VARCHAR(50) DEFAULT 'pdf';

-- Step 3: Rename textbook_id to document_id in related tables
ALTER TABLE chapters RENAME COLUMN textbook_id TO document_id;
ALTER TABLE exercises RENAME COLUMN textbook_id TO document_id;
ALTER TABLE content_chunks RENAME COLUMN textbook_id TO document_id;

-- Step 4: Drop and recreate indexes with new names
DROP INDEX IF EXISTS idx_textbooks_user_id;
DROP INDEX IF EXISTS idx_chapters_textbook_id;
DROP INDEX IF EXISTS idx_exercises_textbook_id;
DROP INDEX IF EXISTS idx_content_chunks_textbook_id;

CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_chapters_document_id ON chapters(document_id);
CREATE INDEX idx_exercises_document_id ON exercises(document_id);
CREATE INDEX idx_content_chunks_document_id ON content_chunks(document_id);

-- Step 5: Drop old RLS policies on documents (formerly textbooks)
DROP POLICY IF EXISTS "Users can view own textbooks" ON documents;
DROP POLICY IF EXISTS "Users can insert own textbooks" ON documents;
DROP POLICY IF EXISTS "Users can update own textbooks" ON documents;
DROP POLICY IF EXISTS "Users can delete own textbooks" ON documents;

-- Step 6: Create new RLS policies for documents
CREATE POLICY "Users can view own documents" ON documents
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents" ON documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents" ON documents
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents" ON documents
  FOR DELETE USING (auth.uid() = user_id);

-- Step 7: Drop and recreate policies on related tables
-- Chapters
DROP POLICY IF EXISTS "Users can view chapters of own textbooks" ON chapters;
CREATE POLICY "Users can view chapters of own documents" ON chapters
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = chapters.document_id
      AND documents.user_id = auth.uid()
    )
  );

-- Sections (references chapters which references documents)
DROP POLICY IF EXISTS "Users can view sections of own textbooks" ON sections;
CREATE POLICY "Users can view sections of own documents" ON sections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chapters
      JOIN documents ON documents.id = chapters.document_id
      WHERE chapters.id = sections.chapter_id
      AND documents.user_id = auth.uid()
    )
  );

-- Exercises
DROP POLICY IF EXISTS "Users can view exercises of own textbooks" ON exercises;
CREATE POLICY "Users can view exercises of own documents" ON exercises
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = exercises.document_id
      AND documents.user_id = auth.uid()
    )
  );

-- Solutions
DROP POLICY IF EXISTS "Users can view solutions of own textbooks" ON solutions;
CREATE POLICY "Users can view solutions of own documents" ON solutions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM exercises
      JOIN documents ON documents.id = exercises.document_id
      WHERE exercises.id = solutions.exercise_id
      AND documents.user_id = auth.uid()
    )
  );

-- Content chunks
DROP POLICY IF EXISTS "Users can view content chunks of own textbooks" ON content_chunks;
CREATE POLICY "Users can view content chunks of own documents" ON content_chunks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = content_chunks.document_id
      AND documents.user_id = auth.uid()
    )
  );

-- Evaluation rubrics
DROP POLICY IF EXISTS "Users can view rubrics of own textbooks" ON evaluation_rubrics;
CREATE POLICY "Users can view rubrics of own documents" ON evaluation_rubrics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM exercises
      JOIN documents ON documents.id = exercises.document_id
      WHERE exercises.id = evaluation_rubrics.exercise_id
      AND documents.user_id = auth.uid()
    )
  );

-- Step 8: Rename the trigger
DROP TRIGGER IF EXISTS update_textbooks_updated_at ON documents;
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Step 9: Update the match_content_chunks function
DROP FUNCTION IF EXISTS match_content_chunks(vector, float, int, uuid, uuid);
DROP FUNCTION IF EXISTS match_content_chunks(vector(1536), float, int, uuid, uuid);
DROP FUNCTION IF EXISTS match_content_chunks(vector(1536), float, int, uuid);

CREATE OR REPLACE FUNCTION match_content_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  filter_document_id uuid DEFAULT NULL,
  filter_chapter_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
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
    cc.document_id,
    cc.chapter_id,
    cc.content,
    cc.chunk_index,
    cc.embedding,
    cc.metadata,
    cc.created_at,
    1 - (cc.embedding <=> query_embedding) AS similarity
  FROM content_chunks cc
  WHERE
    cc.embedding IS NOT NULL
    AND (filter_document_id IS NULL OR cc.document_id = filter_document_id)
    AND (filter_chapter_id IS NULL OR cc.chapter_id = filter_chapter_id)
    AND (1 - (cc.embedding <=> query_embedding)) > match_threshold
  ORDER BY cc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_content_chunks TO authenticated;
GRANT EXECUTE ON FUNCTION match_content_chunks TO service_role;

-- Step 10: Create a new storage bucket for documents
-- Note: Can't rename bucket IDs, so we create a new one
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  true,
  524288000,  -- 500MB limit
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'text/plain',
    'text/markdown',
    'text/csv',
    'text/javascript',
    'text/x-python',
    'text/html',
    'text/css',
    'application/json'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Step 11: Create storage policies for new documents bucket
CREATE POLICY "Users can upload files to documents folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can read own document files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Public can read documents"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'documents');

CREATE POLICY "Users can delete own document files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
