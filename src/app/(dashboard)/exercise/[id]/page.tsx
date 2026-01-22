import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database";
import { ExerciseRenderer } from "./exercise-renderer";
import { SolutionViewer } from "./solution-viewer";

type Exercise = Database["public"]["Tables"]["exercises"]["Row"];
type Solution = Database["public"]["Tables"]["solutions"]["Row"];
type Chapter = Database["public"]["Tables"]["chapters"]["Row"];

export default async function ExercisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch exercise with solution and chapter info
  const { data: exercise, error } = await supabase
    .from("exercises")
    .select("*")
    .eq("id", id)
    .single() as { data: Exercise | null; error: unknown };

  if (error || !exercise) {
    notFound();
  }

  // Fetch solution
  const { data: solution } = await supabase
    .from("solutions")
    .select("*")
    .eq("exercise_id", id)
    .single() as { data: Solution | null };

  // Fetch chapter for navigation
  const { data: chapter } = await supabase
    .from("chapters")
    .select("*")
    .eq("id", exercise.chapter_id)
    .single() as { data: Chapter | null };

  // Fetch adjacent exercises for navigation
  const { data: adjacentExercises } = await supabase
    .from("exercises")
    .select("id, exercise_number")
    .eq("chapter_id", exercise.chapter_id)
    .order("exercise_number") as { data: Array<{ id: string; exercise_number: string }> | null };

  const currentIndex = adjacentExercises?.findIndex((e) => e.id === id) ?? -1;
  const prevExercise = currentIndex > 0 ? adjacentExercises?.[currentIndex - 1] : null;
  const nextExercise = currentIndex < (adjacentExercises?.length ?? 0) - 1 ? adjacentExercises?.[currentIndex + 1] : null;

  const difficultyColors: Record<string, string> = {
    easy: "bg-green-500/10 text-green-500",
    medium: "bg-yellow-500/10 text-yellow-500",
    hard: "bg-red-500/10 text-red-500",
  };

  const typeLabels: Record<string, string> = {
    multiple_choice: "Multiple Choice",
    single_select: "Single Select",
    short_answer: "Short Answer",
    long_answer: "Long Answer",
    mathematical: "Mathematical",
    coding: "Coding",
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <Link
          href={`/document/${exercise.document_id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Document
        </Link>

        <div className="flex items-center gap-2">
          {prevExercise && (
            <Link href={`/exercise/${prevExercise.id}`}>
              <Button variant="outline" size="sm">
                <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Prev
              </Button>
            </Link>
          )}
          {nextExercise && (
            <Link href={`/exercise/${nextExercise.id}`}>
              <Button variant="outline" size="sm">
                Next
                <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Exercise Card */}
      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {chapter && (
                  <span className="text-sm text-muted-foreground">
                    Chapter {chapter.chapter_number}: {chapter.title}
                  </span>
                )}
              </div>
              <CardTitle className="text-xl">
                Exercise {exercise.exercise_number}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className={difficultyColors[exercise.difficulty || "medium"]}>
                {exercise.difficulty || "Medium"}
              </Badge>
              <Badge variant="outline">
                {typeLabels[exercise.exercise_type] || exercise.exercise_type}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Question */}
          <div className="prose prose-invert max-w-none">
            <p className="text-lg text-foreground leading-relaxed">
              {exercise.question_text}
            </p>
          </div>

          {/* Exercise Renderer (handles different types) */}
          <ExerciseRenderer
            exerciseId={exercise.id}
            exerciseType={exercise.exercise_type}
            options={exercise.options as string | null}
          />

          {/* Topics */}
          {exercise.topics && exercise.topics.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-4 border-t border-border/50">
              <span className="text-sm text-muted-foreground">Topics:</span>
              {(exercise.topics as string[]).map((topic) => (
                <Badge key={topic} variant="secondary" className="bg-primary/10 text-primary">
                  {topic}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Solution Card */}
      {solution && (
        <SolutionViewer solution={solution} />
      )}
    </div>
  );
}
