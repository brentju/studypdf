export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      textbooks: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          author: string | null;
          edition: string | null;
          isbn: string | null;
          pdf_url: string;
          cover_url: string | null;
          processing_status: string;
          total_pages: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          author?: string | null;
          edition?: string | null;
          isbn?: string | null;
          pdf_url: string;
          cover_url?: string | null;
          processing_status?: string;
          total_pages?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          author?: string | null;
          edition?: string | null;
          isbn?: string | null;
          pdf_url?: string;
          cover_url?: string | null;
          processing_status?: string;
          total_pages?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      chapters: {
        Row: {
          id: string;
          textbook_id: string;
          chapter_number: number;
          title: string;
          start_page: number | null;
          end_page: number | null;
          summary: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          textbook_id: string;
          chapter_number: number;
          title: string;
          start_page?: number | null;
          end_page?: number | null;
          summary?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          textbook_id?: string;
          chapter_number?: number;
          title?: string;
          start_page?: number | null;
          end_page?: number | null;
          summary?: string | null;
          created_at?: string;
        };
      };
      sections: {
        Row: {
          id: string;
          chapter_id: string;
          section_number: string | null;
          title: string;
          content_markdown: string | null;
          start_page: number | null;
          end_page: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          chapter_id: string;
          section_number?: string | null;
          title: string;
          content_markdown?: string | null;
          start_page?: number | null;
          end_page?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          chapter_id?: string;
          section_number?: string | null;
          title?: string;
          content_markdown?: string | null;
          start_page?: number | null;
          end_page?: number | null;
          created_at?: string;
        };
      };
      exercises: {
        Row: {
          id: string;
          textbook_id: string;
          chapter_id: string;
          section_id: string | null;
          exercise_number: string;
          exercise_type: string;
          question_text: string;
          question_latex: string | null;
          options: Json | null;
          hints: Json | null;
          difficulty: string | null;
          topics: string[] | null;
          image_urls: string[] | null;
          page_number: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          textbook_id: string;
          chapter_id: string;
          section_id?: string | null;
          exercise_number: string;
          exercise_type: string;
          question_text: string;
          question_latex?: string | null;
          options?: Json | null;
          hints?: Json | null;
          difficulty?: string | null;
          topics?: string[] | null;
          image_urls?: string[] | null;
          page_number?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          textbook_id?: string;
          chapter_id?: string;
          section_id?: string | null;
          exercise_number?: string;
          exercise_type?: string;
          question_text?: string;
          question_latex?: string | null;
          options?: Json | null;
          hints?: Json | null;
          difficulty?: string | null;
          topics?: string[] | null;
          image_urls?: string[] | null;
          page_number?: number | null;
          created_at?: string;
        };
      };
      solutions: {
        Row: {
          id: string;
          exercise_id: string;
          solution_text: string;
          solution_latex: string | null;
          approach: string | null;
          explanation: string | null;
          alternative_approaches: Json | null;
          model_used: string | null;
          confidence_score: number | null;
          verified: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          exercise_id: string;
          solution_text: string;
          solution_latex?: string | null;
          approach?: string | null;
          explanation?: string | null;
          alternative_approaches?: Json | null;
          model_used?: string | null;
          confidence_score?: number | null;
          verified?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          exercise_id?: string;
          solution_text?: string;
          solution_latex?: string | null;
          approach?: string | null;
          explanation?: string | null;
          alternative_approaches?: Json | null;
          model_used?: string | null;
          confidence_score?: number | null;
          verified?: boolean;
          created_at?: string;
        };
      };
      content_chunks: {
        Row: {
          id: string;
          textbook_id: string;
          chapter_id: string | null;
          section_id: string | null;
          content: string;
          page_number: number | null;
          chunk_index: number;
          embedding: number[] | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          textbook_id: string;
          chapter_id?: string | null;
          section_id?: string | null;
          content: string;
          page_number?: number | null;
          chunk_index: number;
          embedding?: number[] | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          textbook_id?: string;
          chapter_id?: string | null;
          section_id?: string | null;
          content?: string;
          page_number?: number | null;
          chunk_index?: number;
          embedding?: number[] | null;
          metadata?: Json | null;
          created_at?: string;
        };
      };
      evaluation_rubrics: {
        Row: {
          id: string;
          exercise_id: string;
          criteria: Json;
          total_points: number;
          auto_generated: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          exercise_id: string;
          criteria: Json;
          total_points: number;
          auto_generated?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          exercise_id?: string;
          criteria?: Json;
          total_points?: number;
          auto_generated?: boolean;
          created_at?: string;
        };
      };
      student_submissions: {
        Row: {
          id: string;
          exercise_id: string;
          user_id: string;
          answer_text: string;
          answer_latex: string | null;
          submitted_at: string;
        };
        Insert: {
          id?: string;
          exercise_id: string;
          user_id: string;
          answer_text: string;
          answer_latex?: string | null;
          submitted_at?: string;
        };
        Update: {
          id?: string;
          exercise_id?: string;
          user_id?: string;
          answer_text?: string;
          answer_latex?: string | null;
          submitted_at?: string;
        };
      };
      evaluations: {
        Row: {
          id: string;
          submission_id: string;
          rubric_id: string | null;
          overall_score: number;
          max_score: number;
          criteria_scores: Json;
          overall_feedback: string | null;
          suggested_improvements: Json | null;
          model_used: string | null;
          evaluated_at: string;
        };
        Insert: {
          id?: string;
          submission_id: string;
          rubric_id?: string | null;
          overall_score: number;
          max_score: number;
          criteria_scores: Json;
          overall_feedback?: string | null;
          suggested_improvements?: Json | null;
          model_used?: string | null;
          evaluated_at?: string;
        };
        Update: {
          id?: string;
          submission_id?: string;
          rubric_id?: string | null;
          overall_score?: number;
          max_score?: number;
          criteria_scores?: Json;
          overall_feedback?: string | null;
          suggested_improvements?: Json | null;
          model_used?: string | null;
          evaluated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      match_content_chunks: {
        Args: {
          query_embedding: number[];
          match_threshold: number;
          match_count: number;
          filter_textbook_id?: string;
        };
        Returns: {
          id: string;
          content: string;
          similarity: number;
          textbook_id: string;
          chapter_id: string | null;
          section_id: string | null;
          page_number: number | null;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
