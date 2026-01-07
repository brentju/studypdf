"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

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

export function ProcessingStatus({
  textbookId,
  initialStatus,
}: {
  textbookId: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const supabase = createClient();

  useEffect(() => {
    // Don't poll if already completed or failed
    if (status === "completed" || status === "failed") {
      return;
    }

    // Poll for updates every 2 seconds
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("textbooks")
        .select("processing_status")
        .eq("id", textbookId)
        .single() as { data: { processing_status: string } | null };

      if (data && data.processing_status !== status) {
        setStatus(data.processing_status);

        // If completed or failed, stop polling and refresh the page
        if (data.processing_status === "completed" || data.processing_status === "failed") {
          clearInterval(interval);
          router.refresh();
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [textbookId, status, supabase, router]);

  if (status === "completed" || status === "failed") {
    return null;
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">Processing your textbook...</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {statusLabels[status]}
            </p>
            <Progress
              value={statusProgress[status]}
              className="mt-3 h-2"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
