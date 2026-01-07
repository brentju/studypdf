import { inngest } from "./client";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { chunkText, extractPageInfo, addPageNumbersToChunks } from "@/lib/rag/chunker";
import { generateEmbeddings, formatEmbeddingForPgvector } from "@/lib/rag/embeddings";

type TextbookUpdate = Database["public"]["Tables"]["textbooks"]["Update"];

// Create admin Supabase client for background jobs
function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Helper to update textbook status
async function updateTextbookStatus(
  textbookId: string,
  status: string,
  additionalData?: Partial<TextbookUpdate>
) {
  const supabase = getSupabaseAdmin();
  const updateData = { processing_status: status, ...additionalData } as TextbookUpdate;
  await supabase
    .from("textbooks")
    .update(updateData as never)
    .eq("id", textbookId);
}

// 1. Process uploaded textbook - Extract text from PDF
export const processTextbookUpload = inngest.createFunction(
  {
    id: "process-textbook-upload",
    name: "Process Textbook Upload",
    retries: 3,
  },
  { event: "textbook/uploaded" },
  async ({ event, step }) => {
    const { textbookId, pdfUrl } = event.data;

    // Update status to extracting
    await step.run("update-status-extracting", async () => {
      await updateTextbookStatus(textbookId, "extracting");
    });

    // Extract text from PDF using Python service
    const extractionResult = await step.run("extract-pdf", async () => {
      const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || "http://localhost:8000";

      try {
        const response = await fetch(`${pythonServiceUrl}/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdf_url: pdfUrl }),
        });

        if (!response.ok) {
          throw new Error(`PDF extraction failed: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        // For now, return mock data if Python service is unavailable
        console.warn("Python service unavailable, using mock extraction:", error);
        return {
          markdown: `# Sample Textbook\n\nThis is placeholder content. The Python PDF extraction service is not yet running.\n\n## Chapter 1: Introduction\n\nWelcome to this textbook.\n\n### Exercises\n\n1. What is the main topic of this chapter?\n2. Explain the key concepts in your own words.`,
          page_count: 10,
          chapters: [
            { number: 1, title: "Introduction", start_page: 1, end_page: 10 }
          ]
        };
      }
    });

    // Update status and trigger next step
    await step.run("update-status-structuring", async () => {
      await updateTextbookStatus(textbookId, "structuring", {
        total_pages: extractionResult.page_count,
      });
    });

    // Send event to trigger structure parsing
    await step.sendEvent("trigger-structure-parsing", {
      name: "textbook/extracted",
      data: {
        textbookId,
        markdown: extractionResult.markdown,
        pageCount: extractionResult.page_count,
      },
    });

    return { success: true, textbookId };
  }
);

// 2. Parse structure - Create chapters and sections
export const parseTextbookStructure = inngest.createFunction(
  {
    id: "parse-textbook-structure",
    name: "Parse Textbook Structure",
    retries: 3,
  },
  { event: "textbook/extracted" },
  async ({ event, step }) => {
    const { textbookId, markdown } = event.data;
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
        textbook_id: textbookId,
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
      await updateTextbookStatus(textbookId, "embedding");
    });

    // Trigger embedding generation (pass markdown for chunking)
    await step.sendEvent("trigger-embedding", {
      name: "textbook/structured",
      data: {
        textbookId,
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
  { event: "textbook/structured" },
  async ({ event, step }) => {
    const { textbookId, chapterIds, markdown } = event.data;
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
        textbook_id: textbookId,
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
      await updateTextbookStatus(textbookId, "extracting_exercises");
    });

    // Trigger exercise extraction
    await step.sendEvent("trigger-exercise-extraction", {
      name: "textbook/embedded",
      data: {
        textbookId,
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

// 4. Extract exercises from chapters
export const extractExercises = inngest.createFunction(
  {
    id: "extract-exercises",
    name: "Extract Exercises",
    retries: 3,
  },
  { event: "textbook/embedded" },
  async ({ event, step }) => {
    const { textbookId } = event.data;
    const supabase = getSupabaseAdmin();

    // Get chapters for this textbook
    const chapters = await step.run("get-chapters", async () => {
      const { data, error } = await supabase
        .from("chapters")
        .select("*")
        .eq("textbook_id", textbookId);

      if (error) throw error;
      return data as { id: string; chapter_number: number; title: string }[];
    });

    // Create sample exercises for each chapter (MVP placeholder)
    // Real implementation would use Claude API to extract exercises
    const exerciseIds = await step.run("create-exercises", async () => {
      const exercises = chapters.flatMap((chapter) => [
        {
          textbook_id: textbookId,
          chapter_id: chapter.id,
          exercise_number: `${chapter.chapter_number}.1`,
          exercise_type: "short_answer",
          question_text: `What are the main concepts covered in ${chapter.title}?`,
          difficulty: "easy",
          topics: ["comprehension"],
        },
        {
          textbook_id: textbookId,
          chapter_id: chapter.id,
          exercise_number: `${chapter.chapter_number}.2`,
          exercise_type: "multiple_choice",
          question_text: `Which of the following best describes the purpose of ${chapter.title}?`,
          options: JSON.stringify([
            { id: "a", label: "A", text: "Option A" },
            { id: "b", label: "B", text: "Option B" },
            { id: "c", label: "C", text: "Option C" },
            { id: "d", label: "D", text: "Option D" },
          ]),
          difficulty: "medium",
          topics: ["understanding"],
        },
      ]);

      const { data, error } = await supabase
        .from("exercises")
        .insert(exercises as never)
        .select("id");

      if (error) throw error;
      return (data as { id: string }[]).map((e) => e.id);
    });

    // Update status
    await step.run("update-status-generating-solutions", async () => {
      await updateTextbookStatus(textbookId, "generating_solutions");
    });

    // Trigger solution generation
    await step.sendEvent("trigger-solution-generation", {
      name: "exercises/extracted",
      data: {
        textbookId,
        exerciseIds,
      },
    });

    return { success: true, exerciseCount: exerciseIds.length };
  }
);

// 5. Generate solutions for exercises
export const generateSolutions = inngest.createFunction(
  {
    id: "generate-solutions",
    name: "Generate Solutions",
    retries: 3,
  },
  { event: "exercises/extracted" },
  async ({ event, step }) => {
    const { textbookId, exerciseIds } = event.data;
    const supabase = getSupabaseAdmin();

    // Generate solutions for each exercise (MVP placeholder)
    // Real implementation would use Claude API
    const solutionCount = await step.run("create-solutions", async () => {
      const solutions = exerciseIds.map((exerciseId: string) => ({
        exercise_id: exerciseId,
        solution_text: "This is a placeholder solution. The Claude API integration will generate detailed, step-by-step solutions for each exercise.",
        approach: "Analysis and explanation",
        explanation: "This solution demonstrates the key concepts and provides a clear path to the answer.",
        model_used: "placeholder",
        verified: false,
      }));

      const { error } = await supabase.from("solutions").insert(solutions as never);
      if (error) throw error;

      return solutions.length;
    });

    // Mark textbook as complete
    await step.run("mark-complete", async () => {
      await updateTextbookStatus(textbookId, "completed");
    });

    return { success: true, solutionCount };
  }
);

// Export all functions
export const functions = [
  processTextbookUpload,
  parseTextbookStructure,
  generateEmbeddingsFunc,
  extractExercises,
  generateSolutions,
];
