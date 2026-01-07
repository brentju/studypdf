/**
 * Embedding generation utilities for RAG pipeline
 *
 * Uses OpenAI's text-embedding-3-small model for cost-effective embeddings
 * Dimensions: 1536 (default) - matches pgvector column in database
 */

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_BATCH_SIZE = 100; // OpenAI limit
const MAX_TOKENS_PER_REQUEST = 8191; // Model limit

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  index: number;
}

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in batches
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<EmbeddingResult[]> {
  const results: EmbeddingResult[] = [];

  // Process in batches
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);

    // Truncate texts that are too long
    const truncatedBatch = batch.map((text) => truncateText(text));

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: truncatedBatch,
    });

    for (let j = 0; j < response.data.length; j++) {
      results.push({
        text: batch[j], // Original text
        embedding: response.data[j].embedding,
        index: i + j,
      });
    }
  }

  return results;
}

/**
 * Truncate text to fit within token limit
 * Rough estimate: 1 token ≈ 4 characters
 */
function truncateText(text: string, maxTokens: number = MAX_TOKENS_PER_REQUEST): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(0, maxChars);
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Embeddings must have the same dimensions");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Format embedding array for Supabase pgvector insertion
 * pgvector expects format: '[0.1, 0.2, ...]'
 */
export function formatEmbeddingForPgvector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
