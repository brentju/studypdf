-- StudyPDF Database Schema
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Textbooks table
CREATE TABLE textbooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  edition TEXT,
  isbn TEXT,
  pdf_url TEXT NOT NULL,
  cover_url TEXT,
  processing_status TEXT NOT NULL DEFAULT 'pending',
  total_pages INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chapters table
CREATE TABLE chapters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  textbook_id UUID NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  start_page INTEGER,
  end_page INTEGER,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sections table
CREATE TABLE sections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  section_number TEXT,
  title TEXT NOT NULL,
  content_markdown TEXT,
  start_page INTEGER,
  end_page INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exercises table
CREATE TABLE exercises (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  textbook_id UUID NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
  exercise_number TEXT NOT NULL,
  exercise_type TEXT NOT NULL,
  question_text TEXT NOT NULL,
  question_latex TEXT,
  options JSONB,
  hints JSONB,
  difficulty TEXT,
  topics TEXT[],
  image_urls TEXT[],
  page_number INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Solutions table
CREATE TABLE solutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  solution_text TEXT NOT NULL,
  solution_latex TEXT,
  approach TEXT,
  explanation TEXT,
  alternative_approaches JSONB,
  model_used TEXT,
  confidence_score FLOAT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Content chunks for RAG
CREATE TABLE content_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  textbook_id UUID NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
  section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  page_number INTEGER,
  chunk_index INTEGER NOT NULL,
  embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Evaluation rubrics
CREATE TABLE evaluation_rubrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  criteria JSONB NOT NULL,
  total_points INTEGER NOT NULL,
  auto_generated BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Student submissions
CREATE TABLE student_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  answer_latex TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Evaluations
CREATE TABLE evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES student_submissions(id) ON DELETE CASCADE,
  rubric_id UUID REFERENCES evaluation_rubrics(id) ON DELETE SET NULL,
  overall_score FLOAT NOT NULL,
  max_score FLOAT NOT NULL,
  criteria_scores JSONB NOT NULL,
  overall_feedback TEXT,
  suggested_improvements JSONB,
  model_used TEXT,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_textbooks_user_id ON textbooks(user_id);
CREATE INDEX idx_chapters_textbook_id ON chapters(textbook_id);
CREATE INDEX idx_sections_chapter_id ON sections(chapter_id);
CREATE INDEX idx_exercises_textbook_id ON exercises(textbook_id);
CREATE INDEX idx_exercises_chapter_id ON exercises(chapter_id);
CREATE INDEX idx_solutions_exercise_id ON solutions(exercise_id);
CREATE INDEX idx_content_chunks_textbook_id ON content_chunks(textbook_id);
CREATE INDEX idx_student_submissions_exercise_id ON student_submissions(exercise_id);
CREATE INDEX idx_student_submissions_user_id ON student_submissions(user_id);
CREATE INDEX idx_evaluations_submission_id ON evaluations(submission_id);

-- Create HNSW index for fast similarity search
CREATE INDEX idx_content_chunks_embedding ON content_chunks
USING hnsw (embedding vector_cosine_ops);

-- Function to match content chunks by similarity
CREATE OR REPLACE FUNCTION match_content_chunks(
  query_embedding vector(1536),
  match_threshold FLOAT,
  match_count INT,
  filter_textbook_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT,
  textbook_id UUID,
  chapter_id UUID,
  section_id UUID,
  page_number INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cc.id,
    cc.content,
    1 - (cc.embedding <=> query_embedding) AS similarity,
    cc.textbook_id,
    cc.chapter_id,
    cc.section_id,
    cc.page_number
  FROM content_chunks cc
  WHERE
    cc.embedding IS NOT NULL
    AND (filter_textbook_id IS NULL OR cc.textbook_id = filter_textbook_id)
    AND 1 - (cc.embedding <=> query_embedding) > match_threshold
  ORDER BY cc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Row Level Security (RLS) Policies
ALTER TABLE textbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

-- Textbooks: Users can only access their own textbooks
CREATE POLICY "Users can view own textbooks" ON textbooks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own textbooks" ON textbooks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own textbooks" ON textbooks
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own textbooks" ON textbooks
  FOR DELETE USING (auth.uid() = user_id);

-- Chapters: Users can access chapters of their textbooks
CREATE POLICY "Users can view chapters of own textbooks" ON chapters
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM textbooks
      WHERE textbooks.id = chapters.textbook_id
      AND textbooks.user_id = auth.uid()
    )
  );

-- Sections: Users can access sections of their textbooks
CREATE POLICY "Users can view sections of own textbooks" ON sections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chapters
      JOIN textbooks ON textbooks.id = chapters.textbook_id
      WHERE chapters.id = sections.chapter_id
      AND textbooks.user_id = auth.uid()
    )
  );

-- Exercises: Users can access exercises of their textbooks
CREATE POLICY "Users can view exercises of own textbooks" ON exercises
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM textbooks
      WHERE textbooks.id = exercises.textbook_id
      AND textbooks.user_id = auth.uid()
    )
  );

-- Solutions: Users can access solutions for their textbooks' exercises
CREATE POLICY "Users can view solutions of own textbooks" ON solutions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM exercises
      JOIN textbooks ON textbooks.id = exercises.textbook_id
      WHERE exercises.id = solutions.exercise_id
      AND textbooks.user_id = auth.uid()
    )
  );

-- Content chunks: Users can access chunks of their textbooks
CREATE POLICY "Users can view content chunks of own textbooks" ON content_chunks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM textbooks
      WHERE textbooks.id = content_chunks.textbook_id
      AND textbooks.user_id = auth.uid()
    )
  );

-- Evaluation rubrics: Users can access rubrics for their exercises
CREATE POLICY "Users can view rubrics of own textbooks" ON evaluation_rubrics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM exercises
      JOIN textbooks ON textbooks.id = exercises.textbook_id
      WHERE exercises.id = evaluation_rubrics.exercise_id
      AND textbooks.user_id = auth.uid()
    )
  );

-- Student submissions: Users can manage their own submissions
CREATE POLICY "Users can view own submissions" ON student_submissions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own submissions" ON student_submissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Evaluations: Users can view evaluations of their submissions
CREATE POLICY "Users can view evaluations of own submissions" ON evaluations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM student_submissions
      WHERE student_submissions.id = evaluations.submission_id
      AND student_submissions.user_id = auth.uid()
    )
  );

-- Trigger to update updated_at on textbooks
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_textbooks_updated_at
  BEFORE UPDATE ON textbooks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
