import { inngest } from "./client";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { askClaudeJson } from "@/lib/claude/client";
import {
  EXERCISE_EXTRACTION_SYSTEM,
  exerciseExtractionPrompt,
  SOLUTION_GENERATION_SYSTEM,
  solutionGenerationPrompt,
} from "@/lib/claude/prompts";
import { getExerciseContext } from "@/lib/rag/search";

type DocumentUpdate = Database["public"]["Tables"]["textbooks"]["Update"];

// Create admin Supabase client for background jobs
function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Helper to update textbook status
async function updateDocumentStatus(
  documentId: string,
  status: string,
  additionalData?: Partial<DocumentUpdate>
) {
  const supabase = getSupabaseAdmin();
  const updateData = { processing_status: status, ...additionalData } as DocumentUpdate;
  await supabase
    .from("textbooks")
    .update(updateData as never)
    .eq("id", documentId);
}

// ============================================================================
// Main Processing Function - Calls Python Service for Complete Pipeline
// ============================================================================

export const processDocumentUpload = inngest.createFunction(
  {
    id: "process-document-upload",
    name: "Process document Upload",
    retries: 3,
  },
  { event: "document/uploaded" },
  async ({ event, step }) => {
    const { documentId, documentUrl } = event.data;

    try {
      // Update status to processing
      await step.run("update-status-processing", async () => {
        await updateDocumentStatus(documentId, "processing");
      });

      // Call Python service to handle entire pipeline:
      // 1. Extract document text
      // 2. Chunk text with LangChain
      // 3. Generate embeddings with OpenAI
      // 4. Save everything to Supabase
      const result = await step.run("process-complete-pipeline", async () => {
        const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || "http://localhost:8000";

        const response = await fetch(`${pythonServiceUrl}/process`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            document_id: documentId,
            document_url: documentUrl,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Python service failed: ${response.statusText} - ${errorText}`);
        }

        return await response.json();
      });

      // Update status to completed
      await step.run("update-status-completed", async () => {
        await updateDocumentStatus(documentId, "completed");
      });

      return {
        success: result.success,
        documentId: result.document_id,
        chunkCount: result.chunk_count,
      };
    } catch (error) {
      // Mark as failed so UI stops polling indefinitely
      await step.run("update-status-failed", async () => {
        await updateDocumentStatus(documentId, "failed");
      });
      throw error;
    }
  }
);

// ============================================================================
// Exercise Extraction (Optional - Currently Disabled)
// ============================================================================

/*
export const extractExercises = inngest.createFunction(
  {
    id: "extract-exercises",
    name: "Extract Exercises",
    retries: 3,
  },
  { event: "textbook/completed" },
  async ({ event, step }) => {
    const { textbookId } = event.data;
    const supabase = getSupabaseAdmin();

    // Get chapters
    const chapters = await step.run("get-chapters", async () => {
      const { data: chaptersData, error: chaptersError } = await supabase
        .from("chapters")
        .select("id, chapter_number, title")
        .eq("textbook_id", textbookId)
        .order("chapter_number");

      if (chaptersError) throw chaptersError;
      return chaptersData as { id: string; chapter_number: number; title: string }[];
    });

    // Extract exercises using Claude
    const allExerciseIds: string[] = [];

    for (const chapter of chapters) {
      const exerciseIds = await step.run(`extract-exercises-chapter-${chapter.chapter_number}`, async () => {
        // Fetch chapter content
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

        // Extract with Claude if API key available
        if (process.env.ANTHROPIC_API_KEY && chapterContent.length > 100) {
          try {
            const result = await askClaudeJson<{ exercises: typeof exercises }>(
              exerciseExtractionPrompt(chapter.title, chapterContent.slice(0, 15000)),
              {
                model: "fast",
                system: EXERCISE_EXTRACTION_SYSTEM,
                maxTokens: 4096,
              }
            );
            exercises = result.exercises || [];
          } catch (error) {
            console.error(`Exercise extraction failed for chapter ${chapter.chapter_number}:`, error);
          }
        }

        // Save exercises to database
        if (exercises.length > 0) {
          const exerciseRecords = exercises.map((ex) => ({
            textbook_id: textbookId,
            chapter_id: chapter.id,
            exercise_number: ex.exercise_number,
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
        }

        return [];
      });

      allExerciseIds.push(...exerciseIds);
    }

    return { success: true, exerciseCount: allExerciseIds.length };
  }
);
*/

// ============================================================================
// Solution Generation (Optional - Currently Disabled)
// ============================================================================

/*
export const generateSolutions = inngest.createFunction(
  {
    id: "generate-solutions",
    name: "Generate Solutions",
    retries: 3,
  },
  { event: "exercises/extracted" },
  async ({ event, step }) => {
    const { exerciseIds } = event.data;
    const supabase = getSupabaseAdmin();

    // Get exercises
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

    // Generate solutions in batches
    const batchSize = 5;
    let solutionCount = 0;

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

            if (process.env.ANTHROPIC_API_KEY) {
              try {
                // Get RAG context
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
                console.error(`Solution generation failed for exercise ${exercise.id}:`, error);
              }
            }

            // Format solution
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
              alternative_approaches: solutionData.steps || [],
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

    return { success: true, solutionCount };
  }
);
*/

// Export all active functions
export const functions = [
  processDocumentUpload,
  // extractExercises,  // Uncomment when ready to use
  // generateSolutions, // Uncomment when ready to use
];
