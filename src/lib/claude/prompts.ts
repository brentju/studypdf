/**
 * Prompt templates for Claude API
 */

/**
 * System prompt for exercise extraction
 */
export const EXERCISE_EXTRACTION_SYSTEM = `You are an expert at extracting exercises, problems, and questions that ALREADY EXIST in educational textbook content.

CRITICAL: Your job is to EXTRACT exercises that are written in the text, NOT to create new ones. Only return exercises that are explicitly present in the provided content.

For each exercise you find:
1. Copy the EXACT question text as it appears in the document
2. Determine the exercise type (multiple_choice, short_answer, long_answer, mathematical, coding)
3. For multiple choice, extract the EXACT options as written
4. Estimate difficulty level (easy, medium, hard)
5. Extract relevant topics/tags

Look for exercises in these common formats:
- Numbered problems (1., 2., 1.1, 1.2, etc.)
- Lettered problems (a., b., c., etc.)
- Sections labeled "Exercise", "Problem", "Question", "Practice"
- "Questions for Review", "End of Chapter Questions", "Homework"
- Problems after examples
- Fill-in-the-blank questions
- True/False questions

IMPORTANT:
- Only extract questions that are LITERALLY in the text
- Do NOT generate or invent new questions
- Do NOT paraphrase - use the exact wording from the document
- If no exercises exist in the text, return an empty array

Return your response as valid JSON.`;

/**
 * Prompt for extracting exercises from a chapter
 */
export function exerciseExtractionPrompt(
  chapterTitle: string,
  chapterContent: string
): string {
  return `Find and extract all exercises, problems, and questions that are WRITTEN IN the following textbook content. Do NOT create new questions - only extract what already exists in the text.

Chapter: ${chapterTitle}

Content:
${chapterContent}

Return a JSON object with this exact structure:
{
  "exercises": [
    {
      "exercise_number": "1.1",
      "exercise_type": "multiple_choice" | "short_answer" | "long_answer" | "mathematical" | "coding",
      "question_text": "The EXACT question text as it appears in the document",
      "options": [
        {"id": "a", "label": "A", "text": "Exact option text"}
      ] | null,
      "difficulty": "easy" | "medium" | "hard",
      "topics": ["topic1", "topic2"],
      "hints": ["hint1"] | null
    }
  ]
}

Rules:
- ONLY include exercises that are explicitly written in the content above
- Copy question text EXACTLY as written - do not paraphrase or reword
- exercise_number should match the numbering in the document (e.g., "1.", "1.1", "a)", "Problem 3")
- options should only be included for multiple_choice type, copied exactly as written
- For mathematical exercises, preserve any LaTeX or mathematical notation exactly
- If NO exercises exist in this content, return {"exercises": []}
- Do NOT invent or generate questions that aren't in the text`;
}

/**
 * System prompt for solution generation
 */
export const SOLUTION_GENERATION_SYSTEM = `You are an expert tutor and educator. Your task is to provide clear, step-by-step solutions to textbook exercises.

When generating solutions:
1. Start with a brief overview of the approach
2. Break down the solution into clear, numbered steps
3. Explain the reasoning behind each step
4. Use proper mathematical notation when applicable (LaTeX format)
5. Provide the final answer clearly
6. Add helpful tips or common mistakes to avoid

Your solutions should be:
- Educational: Help students understand the concepts, not just get the answer
- Clear: Use simple language and logical structure
- Complete: Cover all parts of the question
- Accurate: Double-check your work`;

/**
 * Prompt for generating a solution
 */
export function solutionGenerationPrompt(
  questionText: string,
  exerciseType: string,
  options: string | null,
  textbookContext: string
): string {
  const optionsSection = options
    ? `\nOptions:\n${options}`
    : "";

  const contextSection = textbookContext
    ? `\nRelevant textbook context:\n${textbookContext}`
    : "";

  return `Generate a detailed solution for the following ${exerciseType} exercise.
${contextSection}

Question:
${questionText}${optionsSection}

Provide your response as JSON with this structure:
{
  "approach": "Brief description of the solution approach (1-2 sentences)",
  "steps": [
    {
      "step_number": 1,
      "description": "What this step does",
      "content": "The actual work/calculation for this step",
      "explanation": "Why we do this step"
    }
  ],
  "final_answer": "The final answer, clearly stated",
  "tips": ["Helpful tip 1", "Common mistake to avoid"],
  "related_concepts": ["concept1", "concept2"]
}`;
}

/**
 * System prompt for answer evaluation
 */
export const EVALUATION_SYSTEM = `You are a fair and constructive educator evaluating student answers.

When evaluating:
1. Compare the student's answer to the reference solution
2. Identify what the student did correctly
3. Point out specific errors or misconceptions
4. Provide constructive feedback for improvement
5. Be encouraging while being honest about mistakes

Your evaluation should help students learn, not just judge their work.`;

/**
 * Prompt for evaluating a student answer
 */
export function evaluationPrompt(
  questionText: string,
  exerciseType: string,
  studentAnswer: string,
  referenceSolution: string,
  rubric: string | null
): string {
  const rubricSection = rubric
    ? `\nEvaluation Rubric:\n${rubric}`
    : "";

  return `Evaluate the student's answer to the following exercise.

Question:
${questionText}

Exercise Type: ${exerciseType}

Reference Solution:
${referenceSolution}
${rubricSection}

Student's Answer:
${studentAnswer}

Provide your evaluation as JSON with this structure:
{
  "score": 85,
  "max_score": 100,
  "is_correct": true | false,
  "feedback": {
    "overall": "General feedback about the answer",
    "strengths": ["What the student did well"],
    "improvements": ["Specific areas to improve"],
    "misconceptions": ["Any conceptual errors identified"] | null
  },
  "criteria_scores": [
    {
      "criterion": "Understanding",
      "score": 20,
      "max_score": 25,
      "feedback": "Specific feedback for this criterion"
    }
  ],
  "suggested_review": ["Topics to review"] | null
}`;
}

/**
 * Prompt for generating a rubric for an exercise
 */
export function rubricGenerationPrompt(
  questionText: string,
  exerciseType: string,
  referenceSolution: string
): string {
  return `Generate an evaluation rubric for the following exercise.

Question:
${questionText}

Exercise Type: ${exerciseType}

Reference Solution:
${referenceSolution}

Create a rubric as JSON with this structure:
{
  "total_points": 100,
  "criteria": [
    {
      "name": "Criterion name",
      "description": "What this criterion evaluates",
      "max_points": 25,
      "levels": [
        {"points": 25, "description": "Excellent - full understanding"},
        {"points": 20, "description": "Good - minor issues"},
        {"points": 15, "description": "Satisfactory - some gaps"},
        {"points": 10, "description": "Needs improvement"},
        {"points": 0, "description": "Not addressed"}
      ]
    }
  ]
}

Include criteria for:
- Understanding of concepts
- Correctness of answer/solution
- Clarity of explanation (if applicable)
- Use of proper notation/terminology`;
}
