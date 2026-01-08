import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DeleteTextbookButton } from "./delete-textbook-button";
import type { Database } from "@/types/database";

type Textbook = Database["public"]["Tables"]["textbooks"]["Row"];

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: textbooks } = await supabase
    .from("textbooks")
    .select("*")
    .order("created_at", { ascending: false }) as { data: Textbook[] | null };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">My Textbooks</h1>
          <p className="text-muted-foreground mt-1">
            Upload and manage your PDF textbooks
          </p>
        </div>
        <Link href="/dashboard/upload">
          <Button>
            <svg
              className="mr-2 h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Upload Textbook
          </Button>
        </Link>
      </div>

      {/* Textbooks Grid */}
      {textbooks && textbooks.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {textbooks.map((textbook) => (
            <TextbookCard key={textbook.id} textbook={textbook} />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function TextbookCard({
  textbook,
}: {
  textbook: Textbook;
}) {
  const statusColors: Record<string, string> = {
    pending: "bg-accent-yellow/10 text-accent-yellow",
    processing: "bg-accent-blue/10 text-accent-blue",
    completed: "bg-green-500/10 text-green-500",
    failed: "bg-destructive/10 text-destructive",
  };

  const statusLabels: Record<string, string> = {
    pending: "Pending",
    uploading: "Uploading",
    extracting: "Extracting",
    structuring: "Organizing",
    embedding: "Indexing",
    extracting_exercises: "Finding Exercises",
    generating_solutions: "Generating Solutions",
    completed: "Ready",
    failed: "Failed",
  };

  const isProcessing = !["completed", "failed", "pending"].includes(
    textbook.processing_status
  );

  return (
    <Card className="group border-border/50 bg-card/50 transition-all hover:border-primary/30 hover:bg-card h-full">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Small book icon */}
          <div className="shrink-0 w-10 h-12 rounded bg-secondary/50 flex items-center justify-center">
            <svg
              className="h-5 w-5 text-muted-foreground/50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <Link href={`/textbook/${textbook.id}`} className="block">
              <h3 className="font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                {textbook.title}
              </h3>
              {textbook.author && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {textbook.author}
                </p>
              )}
            </Link>

            {/* Status and progress */}
            <div className="mt-2 flex items-center gap-2">
              <Badge
                variant="secondary"
                className={`text-xs ${statusColors[textbook.processing_status] || statusColors.pending}`}
              >
                {statusLabels[textbook.processing_status] || textbook.processing_status}
              </Badge>
              {textbook.total_pages && (
                <span className="text-xs text-muted-foreground">
                  {textbook.total_pages} pages
                </span>
              )}
            </div>

            {isProcessing && (
              <Progress value={33} className="h-1 mt-2" />
            )}
          </div>

          {/* Delete button */}
          <DeleteTextbookButton
            textbookId={textbook.id}
            textbookTitle={textbook.title}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed border-border/50 bg-card/30">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="mb-4 rounded-full bg-primary/10 p-4">
          <svg
            className="h-8 w-8 text-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          No textbooks yet
        </h3>
        <p className="text-muted-foreground text-center max-w-sm mb-6">
          Upload your first PDF textbook to start extracting exercises and
          generating AI solutions.
        </p>
        <Link href="/dashboard/upload">
          <Button>
            <svg
              className="mr-2 h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            Upload Your First Textbook
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
