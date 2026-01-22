import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DeleteDocumentButton } from "./delete-document-button";
import type { Database, FileType } from "@/types/database";

type Document = Database["public"]["Tables"]["documents"]["Row"];

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false }) as { data: Document[] | null };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">My Documents</h1>
          <p className="text-muted-foreground mt-1">
            Upload and manage your documents
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
            Upload Document
          </Button>
        </Link>
      </div>

      {/* Documents Grid */}
      {documents && documents.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {documents.map((document) => (
            <DocumentCard key={document.id} document={document} />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

// Get icon for file type
function FileTypeIcon({ fileType }: { fileType: FileType }) {
  if (fileType === "pdf") {
    return (
      <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  }
  if (fileType === "doc" || fileType === "docx") {
    return (
      <svg className="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  }
  if (fileType === "ppt" || fileType === "pptx") {
    return (
      <svg className="h-5 w-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  }
  if (fileType === "image") {
    return (
      <svg className="h-5 w-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  }
  if (fileType === "code") {
    return (
      <svg className="h-5 w-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    );
  }
  // Default text/document icon
  return (
    <svg className="h-5 w-5 text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function DocumentCard({
  document,
}: {
  document: Document;
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
    document.processing_status
  );

  // Non-PDF files are always "completed" immediately
  const isPdf = document.file_type === "pdf";

  return (
    <Card className="group border-border/50 bg-card/50 transition-all hover:border-primary/30 hover:bg-card h-full">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* File type icon */}
          <div className="shrink-0 w-10 h-12 rounded bg-secondary/50 flex items-center justify-center">
            <FileTypeIcon fileType={document.file_type} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <Link href={`/document/${document.id}`} className="block">
              <h3 className="font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                {document.title}
              </h3>
              {document.author && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {document.author}
                </p>
              )}
            </Link>

            {/* Status and progress */}
            <div className="mt-2 flex items-center gap-2">
              {isPdf ? (
                <Badge
                  variant="secondary"
                  className={`text-xs ${statusColors[document.processing_status] || statusColors.pending}`}
                >
                  {statusLabels[document.processing_status] || document.processing_status}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-500">
                  Uploaded
                </Badge>
              )}
              {document.total_pages && (
                <span className="text-xs text-muted-foreground">
                  {document.total_pages} pages
                </span>
              )}
            </div>

            {isPdf && isProcessing && (
              <Progress value={33} className="h-1 mt-2" />
            )}
          </div>

          {/* Delete button */}
          <DeleteDocumentButton
            documentId={document.id}
            documentTitle={document.title}
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
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          No documents yet
        </h3>
        <p className="text-muted-foreground text-center max-w-sm mb-6">
          Upload your first document to get started. PDF textbooks will have
          exercises extracted and AI solutions generated.
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
            Upload Your First Document
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
