import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Database } from "@/types/database";

type Textbook = Database["public"]["Tables"]["textbooks"]["Row"];
type Chapter = Database["public"]["Tables"]["chapters"]["Row"];
type Exercise = Database["public"]["Tables"]["exercises"]["Row"];

export default async function TextbookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch textbook with chapters and exercises
  const { data: textbook, error } = await supabase
    .from("textbooks")
    .select("*")
    .eq("id", id)
    .single() as { data: Textbook | null; error: unknown };

  if (error || !textbook) {
    notFound();
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("*")
    .eq("textbook_id", id)
    .order("chapter_number") as { data: Chapter[] | null };

  const { data: exercises } = await supabase
    .from("exercises")
    .select("*")
    .eq("textbook_id", id) as { data: Exercise[] | null };

  const isProcessing = !["completed", "failed"].includes(textbook.processing_status);

  const statusLabels: Record<string, string> = {
    pending: "Waiting to start",
    uploading: "Uploading PDF",
    extracting: "Extracting text from PDF",
    structuring: "Organizing chapters",
    embedding: "Creating search index",
    extracting_exercises: "Finding exercises",
    generating_solutions: "Generating solutions",
    completed: "Ready to study",
    failed: "Processing failed",
  };

  const statusProgress: Record<string, number> = {
    pending: 0,
    uploading: 10,
    extracting: 25,
    structuring: 40,
    embedding: 55,
    extracting_exercises: 70,
    generating_solutions: 85,
    completed: 100,
    failed: 0,
  };

  // Group exercises by chapter
  const exercisesByChapter = exercises?.reduce((acc, exercise) => {
    const chapterId = exercise.chapter_id;
    if (!acc[chapterId]) acc[chapterId] = [];
    acc[chapterId].push(exercise);
    return acc;
  }, {} as Record<string, Exercise[]>) || {};

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-foreground">{textbook.title}</h1>
          {textbook.author && (
            <p className="text-muted-foreground mt-1">by {textbook.author}</p>
          )}
        </div>
        {textbook.processing_status === "completed" && (
          <Button>
            <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Start Practicing
          </Button>
        )}
      </div>

      {/* Processing Status */}
      {isProcessing && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">Processing your textbook...</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {statusLabels[textbook.processing_status]}
                </p>
                <Progress
                  value={statusProgress[textbook.processing_status]}
                  className="mt-3 h-2"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Failed Status */}
      {textbook.processing_status === "failed" && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-destructive/10 p-2">
                <svg className="h-6 w-6 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">Processing failed</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  There was an error processing your textbook. Please try uploading again.
                </p>
              </div>
              <Button variant="outline">Retry Processing</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completed - Show content */}
      {textbook.processing_status === "completed" && (
        <Tabs defaultValue="chapters" className="space-y-6">
          <TabsList>
            <TabsTrigger value="chapters">
              Chapters ({chapters?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="exercises">
              Exercises ({exercises?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chapters" className="space-y-4">
            {chapters && chapters.length > 0 ? (
              chapters.map((chapter) => (
                <ChapterCard
                  key={chapter.id}
                  chapter={chapter}
                  exercises={exercisesByChapter[chapter.id] || []}
                />
              ))
            ) : (
              <Card className="border-border/50 bg-card/50">
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No chapters found in this textbook.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="exercises" className="space-y-4">
            {exercises && exercises.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {exercises.map((exercise) => (
                  <ExerciseCard key={exercise.id} exercise={exercise} />
                ))}
              </div>
            ) : (
              <Card className="border-border/50 bg-card/50">
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No exercises found in this textbook.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Stats */}
      {textbook.processing_status === "completed" && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-border/50 bg-card/50">
            <CardContent className="p-6">
              <div className="text-3xl font-bold text-primary">{chapters?.length || 0}</div>
              <p className="text-sm text-muted-foreground">Chapters</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50">
            <CardContent className="p-6">
              <div className="text-3xl font-bold text-accent-yellow">{exercises?.length || 0}</div>
              <p className="text-sm text-muted-foreground">Exercises</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50">
            <CardContent className="p-6">
              <div className="text-3xl font-bold text-accent-pink">{textbook.total_pages || "—"}</div>
              <p className="text-sm text-muted-foreground">Pages</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function ChapterCard({
  chapter,
  exercises,
}: {
  chapter: Chapter;
  exercises: Exercise[];
}) {
  return (
    <Card className="border-border/50 bg-card/50 hover:border-primary/30 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            Chapter {chapter.chapter_number}: {chapter.title}
          </CardTitle>
          <Badge variant="secondary" className="bg-primary/10 text-primary">
            {exercises.length} exercises
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {chapter.summary && (
          <p className="text-sm text-muted-foreground mb-4">{chapter.summary}</p>
        )}
        {exercises.length > 0 && (
          <div className="flex gap-2">
            <Link href={`/exercise/${exercises[0].id}`}>
              <Button size="sm">Start Exercises</Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExerciseCard({ exercise }: { exercise: Exercise }) {
  const typeColors: Record<string, string> = {
    multiple_choice: "bg-accent-blue/10 text-accent-blue",
    short_answer: "bg-accent-yellow/10 text-accent-yellow",
    long_answer: "bg-accent-peach/10 text-accent-peach",
    mathematical: "bg-accent-pink/10 text-accent-pink",
    coding: "bg-green-500/10 text-green-500",
  };

  const typeLabels: Record<string, string> = {
    multiple_choice: "Multiple Choice",
    single_select: "Single Select",
    short_answer: "Short Answer",
    long_answer: "Long Answer",
    mathematical: "Math",
    coding: "Coding",
  };

  return (
    <Link href={`/exercise/${exercise.id}`}>
      <Card className="border-border/50 bg-card/50 hover:border-primary/30 hover:bg-card transition-all cursor-pointer h-full">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">
              #{exercise.exercise_number}
            </span>
            <Badge
              variant="secondary"
              className={typeColors[exercise.exercise_type] || "bg-secondary"}
            >
              {typeLabels[exercise.exercise_type] || exercise.exercise_type}
            </Badge>
          </div>
          <p className="text-sm text-foreground line-clamp-2">
            {exercise.question_text}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
