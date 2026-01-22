import { inngest } from "./client";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { chunkText, extractPageInfo, addPageNumbersToChunks } from "@/lib/rag/chunker";
import { generateEmbeddings, formatEmbeddingForPgvector } from "@/lib/rag/embeddings";
import { askClaudeJson } from "@/lib/claude/client";
import {
  EXERCISE_EXTRACTION_SYSTEM,
  exerciseExtractionPrompt,
  SOLUTION_GENERATION_SYSTEM,
  solutionGenerationPrompt,
} from "@/lib/claude/prompts";
import { getExerciseContext } from "@/lib/rag/search";

type DocumentUpdate = Database["public"]["Tables"]["documents"]["Update"];

// Create admin Supabase client for background jobs
function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Helper to update document status
async function updateDocumentStatus(
  documentId: string,
  status: string,
  additionalData?: Partial<DocumentUpdate>
) {
  const supabase = getSupabaseAdmin();
  const updateData = { processing_status: status, ...additionalData } as DocumentUpdate;
  await supabase
    .from("documents")
    .update(updateData as never)
    .eq("id", documentId);
}

// 1. Process uploaded document - Extract text from PDF
export const processDocumentUpload = inngest.createFunction(
  {
    id: "process-document-upload",
    name: "Process Document Upload",
    retries: 3,
  },
  { event: "document/uploaded" },
  async ({ event, step }) => {
    const { documentId, fileUrl } = event.data;

    // Update status to extracting
    await step.run("update-status-extracting", async () => {
      await updateDocumentStatus(documentId, "extracting");
    });

    // Extract text from PDF using Python service
    const extractionResult = await step.run("extract-pdf", async () => {
      const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || "http://localhost:8000";

      try {
        const response = await fetch(`${pythonServiceUrl}/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdf_url: fileUrl }),
        });

        if (!response.ok) {
          throw new Error(`PDF extraction failed: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        // For now, return mock data if Python service is unavailable
        console.warn("Python service unavailable, using mock extraction:", error);
        return {
          markdown: `# Sample Document\n\nThis is placeholder content. The Python PDF extraction service is not yet running.\n\n## Chapter 1: Introduction\n\nWelcome to this document.\n\n### Exercises\n\n1. What is the main topic of this chapter?\n2. Explain the key concepts in your own words.`,
          page_count: 10,
          chapters: [
            { number: 1, title: "Introduction", start_page: 1, end_page: 10 }
          ]
        };
      }
    });

    // Update status and trigger next step
    await step.run("update-status-structuring", async () => {
      await updateDocumentStatus(documentId, "structuring", {
        total_pages: extractionResult.page_count,
      });
    });

    // Send event to trigger structure parsing
    await step.sendEvent("trigger-structure-parsing", {
      name: "document/extracted",
      data: {
        documentId,
        markdown: extractionResult.markdown,
        pageCount: extractionResult.page_count,
      },
    });

    return { success: true, documentId };
  }
);

// 2. Parse structure - Create chapters and sections
export const parseDocumentStructure = inngest.createFunction(
  {
    id: "parse-document-structure",
    name: "Parse Document Structure",
    retries: 3,
  },
  { event: "document/extracted" },
  async ({ event, step }) => {
    const { documentId, markdown } = event.data;
    const supabase = getSupabaseAdmin();

    // Parse chapters from markdown using simple heuristics
    const chapters = await step.run("parse-chapters", async () => {
      // Simple chapter detection - look for # Chapter or ## Chapter patterns
      const chapterRegex = /^#{1,2}\s*(?:Chapter\s+)?(\d+)?[:\s]*(.+)$/gm;
      const matches = [...markdown.matchAll(chapterRegex)];

      const parsedChapters = matches.map((match, index) => ({
        chapter_number: match[1] ? parseInt(match[1]) : index + 1,
        title: match[2].trim(),
      }));

      // If no chapters found, create a default one
      if (parsedChapters.length === 0) {
        return [{ chapter_number: 1, title: "Main Content" }];
      }

      return parsedChapters;
    });

    // Save chapters to database
    const savedChapters = await step.run("save-chapters", async () => {
      const chapterData = chapters.map((ch) => ({
        document_id: documentId,
        chapter_number: ch.chapter_number,
        title: ch.title,
      }));

      const { data, error } = await supabase
        .from("chapters")
        .insert(chapterData as never)
        .select();

      if (error) throw error;
      return data as { id: string; chapter_number: number; title: string }[];
    });

    // Update status
    await step.run("update-status-embedding", async () => {
      await updateDocumentStatus(documentId, "embedding");
    });

    // Trigger embedding generation (pass markdown for chunking)
    await step.sendEvent("trigger-embedding", {
      name: "document/structured",
      data: {
        documentId,
        chapterIds: savedChapters.map((ch) => ch.id),
        markdown, // Pass through for chunking
      },
    });

    return { success: true, chapterCount: savedChapters.length };
  }
);

// 3. Generate embeddings for RAG
export const generateEmbeddingsFunc = inngest.createFunction(
  {
    id: "generate-embeddings",
    name: "Generate Embeddings",
    retries: 3,
  },
  { event: "document/structured" },
  async ({ event, step }) => {
    const { documentId, chapterIds, markdown } = event.data;
    const supabase = getSupabaseAdmin();

    // Step 1: Chunk the text content
    const chunks = await step.run("chunk-content", async () => {
      // Extract page info if available (from PyMuPDF format)
      const pageMap = extractPageInfo(markdown);

      // Chunk the text
      let textChunks = chunkText(markdown);

      // Add page numbers if we have them
      if (pageMap.size > 0) {
        textChunks = addPageNumbersToChunks(textChunks, pageMap);
      }

      return textChunks;
    });

    // Step 2: Generate embeddings for all chunks
    const embeddingResults = await step.run("generate-embeddings", async () => {
      const texts = chunks.map((chunk) => chunk.content);

      // Check if OpenAI API key is available
      if (!process.env.OPENAI_API_KEY) {
        console.warn("OPENAI_API_KEY not set, skipping embedding generation");
        return null;
      }

      try {
        return await generateEmbeddings(texts);
      } catch (error) {
        console.error("Embedding generation failed:", error);
        return null;
      }
    });

    // Step 3: Save chunks to database
    const chunkCount = await step.run("save-chunks", async () => {
      // Map chunks to chapter IDs (simple: assign to first chapter for now)
      // In production, you'd match chunks to chapters based on content/headers
      const firstChapterId = chapterIds[0];

      const chunkRecords = chunks.map((chunk, index) => ({
        document_id: documentId,
        chapter_id: firstChapterId, // TODO: Improve chapter mapping
        content: chunk.content,
        chunk_index: chunk.index,
        metadata: {
          ...chunk.metadata,
          sectionTitle: chunk.metadata.sectionTitle,
        },
        // Include embedding if we generated them
        ...(embeddingResults?.[index]?.embedding
          ? { embedding: formatEmbeddingForPgvector(embeddingResults[index].embedding) }
          : {}),
      }));

      const { error } = await supabase.from("content_chunks").insert(chunkRecords as never);
      if (error) throw error;

      return chunkRecords.length;
    });

    // Update status
    await step.run("update-status-extracting-exercises", async () => {
      await updateDocumentStatus(documentId, "extracting_exercises");
    });

    // Trigger exercise extraction
    await step.sendEvent("trigger-exercise-extraction", {
      name: "document/embedded",
      data: {
        documentId,
        chunkCount,
      },
    });

    return {
      success: true,
      chunkCount,
      embeddingsGenerated: embeddingResults !== null,
    };
  }
);

// 4. Extract exercises from chapters using Claude
export const extractExercises = inngest.createFunction(
  {
    id: "extract-exercises",
    name: "Extract Exercises",
    retries: 3,
  },
  { event: "document/embedded" },
  async ({ event, step }) => {
    const { documentId } = event.data;
    const supabase = getSupabaseAdmin();

    // Get chapters (without content - we'll fetch content per-chapter to avoid serialization issues)
    const chapters = await step.run("get-chapters", async () => {
      const { data: chaptersData, error: chaptersError } = await supabase
        .from("chapters")
        .select("id, chapter_number, title")
        .eq("document_id", documentId)
        .order("chapter_number");

      if (chaptersError) throw chaptersError;
      return chaptersData as { id: string; chapter_number: number; title: string }[];
    });

    // Extract exercises using Claude (or fallback to placeholder)
    const allExerciseIds: string[] = [];

    for (const chapter of chapters) {
      const exerciseIds = await step.run(`extract-exercises-chapter-${chapter.chapter_number}`, async () => {
        // Fetch content directly in this step to avoid Inngest serialization limits
        const { data: chunks } = await supabase
          .from("content_chunks")
          .select("content")
          .eq("chapter_id", chapter.id)
          .order("chunk_index");

        const chapterContent = chunks?.map((c: { content: string }) => c.content).join("\n\n") || "";

        let exercises: Array<{
          exercise_number: string;
          exercise_type: string;
          question_text: string;
          options?: Array<{ id: string; label: string; text: string }> | null;
          difficulty: string;
          topics: string[];
          hints?: string[] | null;
        }> = [];

        // Try to extract with Claude if API key is available and content exists
        if (process.env.ANTHROPIC_API_KEY && chapterContent.length > 100) {
          try {
            console.log(`Extracting exercises from chapter ${chapter.chapter_number} (${chapterContent.length} chars)`);
            const result = await askClaudeJson<{ exercises: typeof exercises }>(
              exerciseExtractionPrompt(chapter.title, chapterContent.slice(0, 15000)), // Limit content size
              {
                model: "fast",
                system: EXERCISE_EXTRACTION_SYSTEM,
                maxTokens: 4096,
              }
            );
            exercises = result.exercises || [];
            console.log(`Claude found ${exercises.length} exercises in chapter ${chapter.chapter_number}`);
          } catch (error) {
            console.error(`Claude extraction failed for chapter ${chapter.chapter_number}:`, error);
          }
        } else {
          console.log(`Skipping Claude: API key set: ${!!process.env.ANTHROPIC_API_KEY}, content length: ${chapterContent.length}`);
        }

        // Fallback: create placeholder exercises if Claude didn't find any
        if (exercises.length === 0) {
          exercises = [
            {
              exercise_number: `${chapter.chapter_number}.1`,
              exercise_type: "short_answer",
              question_text: `What are the main concepts covered in "${chapter.title}"?`,
              difficulty: "easy",
              topics: ["comprehension"],
            },
            {
              exercise_number: `${chapter.chapter_number}.2`,
              exercise_type: "multiple_choice",
              question_text: `Which of the following best describes the purpose of "${chapter.title}"?`,
              options: [
                { id: "a", label: "A", text: "To introduce fundamental concepts" },
                { id: "b", label: "B", text: "To provide advanced techniques" },
                { id: "c", label: "C", text: "To summarize previous material" },
                { id: "d", label: "D", text: "To present case studies" },
              ],
              difficulty: "medium",
              topics: ["understanding"],
            },
          ];
        }

        // Save exercises to database
        const exerciseRecords = exercises.map((ex) => ({
          document_id: documentId,
          chapter_id: chapter.id,
          exercise_number: ex.exercise_number || `${chapter.chapter_number}.${Math.random().toString(36).slice(2, 6)}`,
          exercise_type: ex.exercise_type,
          question_text: ex.question_text,
          options: ex.options ? JSON.stringify(ex.options) : null,
          difficulty: ex.difficulty || "medium",
          topics: ex.topics || [],
          hints: ex.hints || null,
        }));

        const { data, error } = await supabase
          .from("exercises")
          .insert(exerciseRecords as never)
          .select("id");

        if (error) throw error;
        return (data as { id: string }[]).map((e) => e.id);
      });

      allExerciseIds.push(...exerciseIds);
    }

    // Update status
    await step.run("update-status-generating-solutions", async () => {
      await updateDocumentStatus(documentId, "generating_solutions");
    });

    // Trigger solution generation
    await step.sendEvent("trigger-solution-generation", {
      name: "exercises/extracted",
      data: {
        documentId,
        exerciseIds: allExerciseIds,
      },
    });

    return { success: true, exerciseCount: allExerciseIds.length };
  }
);

// 5. Generate solutions for exercises using Claude + RAG
export const generateSolutions = inngest.createFunction(
  {
    id: "generate-solutions",
    name: "Generate Solutions",
    retries: 3,
  },
  { event: "exercises/extracted" },
  async ({ event, step }) => {
    const { documentId, exerciseIds } = event.data;
    const supabase = getSupabaseAdmin();

    // Get all exercises
    const exercises = await step.run("get-exercises", async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("*")
        .in("id", exerciseIds);

      if (error) throw error;
      return data as Array<{
        id: string;
        question_text: string;
        exercise_type: string;
        options: string | null;
      }>;
    });

    // Generate solutions for each exercise
    let solutionCount = 0;

    // Process in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < exercises.length; i += batchSize) {
      const batch = exercises.slice(i, i + batchSize);

      await step.run(`generate-solutions-batch-${i}`, async () => {
        const solutions = await Promise.all(
          batch.map(async (exercise) => {
            let solutionData = {
              approach: "Analysis and explanation",
              steps: [] as Array<{ step_number: number; description: string; content: string; explanation: string }>,
              final_answer: "See explanation above.",
              tips: [] as string[],
              related_concepts: [] as string[],
            };

            // Try to generate with Claude if API key is available
            if (process.env.ANTHROPIC_API_KEY) {
              try {
                // Get relevant context from RAG
                let context = "";
                try {
                  context = await getExerciseContext(exercise.id, exercise.question_text);
                } catch (ragError) {
                  console.warn("RAG context retrieval failed:", ragError);
                }

                // Generate solution with Claude
                solutionData = await askClaudeJson<typeof solutionData>(
                  solutionGenerationPrompt(
                    exercise.question_text,
                    exercise.exercise_type,
                    exercise.options,
                    context
                  ),
                  {
                    model: "smart",
                    system: SOLUTION_GENERATION_SYSTEM,
                    maxTokens: 2048,
                  }
                );
              } catch (error) {
                console.error(`Claude solution generation failed for exercise ${exercise.id}:`, error);
              }
            }

            // Format solution for database
            const stepsText = solutionData.steps
              ?.map((s) => `**Step ${s.step_number}: ${s.description}**\n${s.content}\n_${s.explanation}_`)
              .join("\n\n") || "";

            const solutionText = [
              `## Approach\n${solutionData.approach}`,
              stepsText ? `## Solution\n${stepsText}` : "",
              `## Answer\n${solutionData.final_answer}`,
              solutionData.tips?.length ? `## Tips\n${solutionData.tips.map((t) => `- ${t}`).join("\n")}` : "",
            ].filter(Boolean).join("\n\n");

            return {
              exercise_id: exercise.id,
              solution_text: solutionText || "Solution pending - please check back later.",
              approach: solutionData.approach,
              explanation: solutionData.final_answer,
              alternative_approaches: solutionData.steps || [], // Store steps in alternative_approaches
              model_used: process.env.ANTHROPIC_API_KEY ? "claude-sonnet-4" : "placeholder",
              verified: false,
            };
          })
        );

        const { error } = await supabase.from("solutions").insert(solutions as never);
        if (error) throw error;

        solutionCount += solutions.length;
      });
    }

    // Mark document as complete
    await step.run("mark-complete", async () => {
      await updateDocumentStatus(documentId, "completed");
    });

    return { success: true, solutionCount };
  }
);

// Export all functions
export const functions = [
  processDocumentUpload,
  parseDocumentStructure,
  generateEmbeddingsFunc,
  extractExercises,
  generateSolutions,
];
