/**
 * Semantic search utilities for RAG
 *
 * Uses pgvector for similarity search against content_chunks table
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
// import { generateEmbedding } from "./embeddings";

type ContentChunk = Database["public"]["Tables"]["content_chunks"]["Row"];

// Admin client for server-side operations
function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface SearchResult {
  chunk: ContentChunk;
  similarity: number;
}

export interface SearchOptions {
  textbookId?: string;
  chapterId?: string;
  limit?: number;
  threshold?: number; // Minimum similarity score (0-1)
}

/**
 * Search for relevant content chunks using semantic similarity
 */
export async function searchContent(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const {
    textbookId,
    chapterId,
    limit = 5,
    threshold = 0.7,
  } = options;

  const supabase = getSupabaseAdmin();

  // Generate embedding for the query
  // const queryEmbedding = await generateEmbedding(query);

  // Build the RPC call for similarity search
  // This uses the pgvector <=> operator for cosine distance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("match_content_chunks", {
    // query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: limit,
    filter_textbook_id: textbookId || null,
    filter_chapter_id: chapterId || null,
  }) as { data: Array<ContentChunk & { similarity: number }> | null; error: Error | null };

  if (error) {
    console.error("Search error:", error);
    throw error;
  }

  if (!data) {
    return [];
  }

  return data.map((item) => ({
    chunk: item,
    similarity: item.similarity,
  }));
}

/**
 * Get relevant context for an exercise from the textbook
 */
export async function getExerciseContext(
  exerciseId: string,
  questionText: string
): Promise<string> {
  const supabase = getSupabaseAdmin();

  // Get the exercise to find its textbook and chapter
  const { data: exercise } = await supabase
    .from("exercises")
    .select("textbook_id, chapter_id")
    .eq("id", exerciseId)
    .single() as { data: { textbook_id: string; chapter_id: string } | null };

  if (!exercise) {
    return "";
  }

  // Search for relevant content, prioritizing the same chapter
  const results = await searchContent(questionText, {
    textbookId: exercise.textbook_id,
    chapterId: exercise.chapter_id,
    limit: 3,
    threshold: 0.65,
  });

  if (results.length === 0) {
    // Fallback: search across the whole textbook
    const textbookResults = await searchContent(questionText, {
      textbookId: exercise.textbook_id,
      limit: 3,
      threshold: 0.6,
    });
    return formatContextForLLM(textbookResults);
  }

  return formatContextForLLM(results);
}

/**
 * Format search results as context for LLM prompts
 */
function formatContextForLLM(results: SearchResult[]): string {
  if (results.length === 0) {
    return "";
  }

  const contextParts = results.map((result, index) => {
    const metadata = result.chunk.metadata as Record<string, unknown> | null;
    const pageInfo = metadata?.pageNumber ? ` (Page ${metadata.pageNumber})` : "";
    return `[Source ${index + 1}${pageInfo}]\n${result.chunk.content}`;
  });

  return contextParts.join("\n\n---\n\n");
}

/**
 * Find chunks related to a specific chapter
 */
export async function getChapterContent(
  chapterId: string,
  limit: number = 10
): Promise<ContentChunk[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("content_chunks")
    .select("*")
    .eq("chapter_id", chapterId)
    .order("chunk_index")
    .limit(limit) as { data: ContentChunk[] | null; error: Error | null };

  if (error) {
    console.error("Error fetching chapter content:", error);
    throw error;
  }

  return data || [];
}
