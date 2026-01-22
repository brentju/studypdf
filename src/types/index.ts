// Core type definitions for StudyPDF

export type ExerciseType =
  | "multiple_choice"
  | "single_select"
  | "short_answer"
  | "long_answer"
  | "mathematical"
  | "coding";

export type ProcessingStatus =
  | "pending"
  | "uploading"
  | "extracting"
  | "structuring"
  | "embedding"
  | "extracting_exercises"
  | "generating_solutions"
  | "completed"
  | "failed";

export type FileType = "pdf" | "doc" | "docx" | "ppt" | "pptx" | "image" | "code" | "text";

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface Document {
  id: string;
  user_id: string;
  title: string;
  author?: string;
  edition?: string;
  isbn?: string;
  file_url: string;
  file_type: FileType;
  cover_url?: string;
  processing_status: ProcessingStatus;
  total_pages?: number;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: string;
  document_id: string;
  chapter_number: number;
  title: string;
  start_page?: number;
  end_page?: number;
  summary?: string;
  created_at: string;
}

export interface Section {
  id: string;
  chapter_id: string;
  section_number?: string;
  title: string;
  content_markdown?: string;
  start_page?: number;
  end_page?: number;
  created_at: string;
}

export interface Exercise {
  id: string;
  document_id: string;
  chapter_id: string;
  section_id?: string;
  exercise_number: string;
  exercise_type: ExerciseType;
  question_text: string;
  question_latex?: string;
  options?: ExerciseOption[];
  hints?: string[];
  difficulty?: "easy" | "medium" | "hard";
  topics?: string[];
  image_urls?: string[];
  page_number?: number;
  created_at: string;
}

export interface ExerciseOption {
  id: string;
  label: string;
  text: string;
  is_correct?: boolean;
}

export interface Solution {
  id: string;
  exercise_id: string;
  solution_text: string;
  solution_latex?: string;
  approach?: string;
  explanation?: string;
  alternative_approaches?: AlternativeApproach[];
  model_used?: string;
  confidence_score?: number;
  verified: boolean;
  created_at: string;
}

export interface AlternativeApproach {
  title: string;
  description: string;
  steps: string[];
}

export interface ContentChunk {
  id: string;
  document_id: string;
  chapter_id?: string;
  section_id?: string;
  content: string;
  page_number?: number;
  chunk_index: number;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface EvaluationRubric {
  id: string;
  exercise_id: string;
  criteria: RubricCriterion[];
  total_points: number;
  auto_generated: boolean;
  created_at: string;
}

export interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  max_points: number;
  levels: RubricLevel[];
}

export interface RubricLevel {
  points: number;
  description: string;
}

export interface StudentSubmission {
  id: string;
  exercise_id: string;
  user_id: string;
  answer_text: string;
  answer_latex?: string;
  submitted_at: string;
}

export interface Evaluation {
  id: string;
  submission_id: string;
  rubric_id?: string;
  overall_score: number;
  max_score: number;
  criteria_scores: CriterionScore[];
  overall_feedback?: string;
  suggested_improvements?: string[];
  model_used?: string;
  evaluated_at: string;
}

export interface CriterionScore {
  criterion_name: string;
  points_awarded: number;
  max_points: number;
  feedback: string;
  satisfied: boolean;
}

// API Response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

// Form types
export interface DocumentUploadForm {
  title: string;
  author?: string;
  edition?: string;
  isbn?: string;
  file: File;
}

export interface SubmissionForm {
  exercise_id: string;
  answer_text: string;
  answer_latex?: string;
}

// Processing events
export interface ProcessingEvent {
  document_id: string;
  status: ProcessingStatus;
  progress?: number;
  message?: string;
  error?: string;
}
