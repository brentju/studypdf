"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDropzone } from "react-dropzone";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Database } from "@/types/database";

type UploadState = "idle" | "selected" | "uploading" | "processing" | "complete" | "error";
type TextbookInsert = Database["public"]["Tables"]["textbooks"]["Insert"];
type TextbookRow = Database["public"]["Tables"]["textbooks"]["Row"];

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pdfFile = acceptedFiles[0];
    if (pdfFile) {
      setFile(pdfFile);
      setUploadState("selected");
      // Auto-fill title from filename
      const fileName = pdfFile.name.replace(/\.pdf$/i, "");
      setTitle(fileName);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
    maxSize: 500 * 1024 * 1024, // 500MB
    onDropRejected: (rejections) => {
      const rejection = rejections[0];
      if (rejection.errors[0]?.code === "file-too-large") {
        setError("File is too large. Maximum size is 500MB.");
      } else if (rejection.errors[0]?.code === "file-invalid-type") {
        setError("Please upload a PDF file.");
      } else {
        setError("Failed to upload file. Please try again.");
      }
    },
  });

  const handleUpload = async () => {
    if (!file || !title.trim()) {
      setError("Please provide a title for the textbook.");
      return;
    }

    setUploadState("uploading");
    setError(null);

    try {
      const supabase = createClient();

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("You must be logged in to upload.");
        setUploadState("error");
        return;
      }

      // Generate unique filename
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      setUploadProgress(10);
      const { error: uploadError } = await supabase.storage
        .from("textbooks")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      setUploadProgress(50);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("textbooks")
        .getPublicUrl(fileName);

      setUploadProgress(70);

      // Create textbook record
      const insertData: TextbookInsert = {
        user_id: user.id,
        title: title.trim(),
        author: author.trim() || null,
        pdf_url: publicUrl,
        processing_status: "pending",
      };

      const { data: textbook, error: dbError } = await supabase
        .from("textbooks")
        .insert(insertData as never)
        .select()
        .single() as { data: TextbookRow | null; error: Error | null };

      if (dbError || !textbook) {
        throw new Error(dbError?.message || "Failed to create textbook record");
      }

      setUploadProgress(90);

      // Trigger processing pipeline
      await fetch("/api/process-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: textbook.id }),
      });

      setUploadProgress(100);
      setUploadState("complete");

      // Redirect to textbook page after short delay
      setTimeout(() => {
        router.push(`/textbook/${textbook.id}`);
      }, 1500);

    } catch (err) {
      console.error("Upload error:", err);
      setError(err instanceof Error ? err.message : "Failed to upload. Please try again.");
      setUploadState("error");
    }
  };

  const resetUpload = () => {
    setFile(null);
    setTitle("");
    setAuthor("");
    setUploadState("idle");
    setUploadProgress(0);
    setError(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
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
        <h1 className="text-3xl font-bold text-foreground">Upload Textbook</h1>
        <p className="text-muted-foreground mt-1">
          Upload a PDF textbook to extract exercises and generate solutions
        </p>
      </div>

      {/* Upload Card */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle>PDF File</CardTitle>
          <CardDescription>
            Drag and drop your textbook PDF or click to browse. Max size: 500MB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Dropzone */}
          {uploadState === "idle" || uploadState === "error" ? (
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors
                ${isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-secondary/30"
                }
              `}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-4">
                <div className="rounded-full bg-primary/10 p-4">
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
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                </div>
                {isDragActive ? (
                  <p className="text-primary font-medium">Drop the PDF here...</p>
                ) : (
                  <>
                    <p className="text-foreground font-medium">
                      Drag & drop your PDF here
                    </p>
                    <p className="text-sm text-muted-foreground">
                      or click to browse files
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* File selected or uploading */
            <div className="rounded-lg border border-border bg-secondary/30 p-4">
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-primary/10 p-3">
                  <svg
                    className="h-6 w-6 text-primary"
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
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {file?.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {file && formatFileSize(file.size)}
                  </p>
                  {uploadState === "uploading" && (
                    <div className="mt-3">
                      <Progress value={uploadProgress} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-1">
                        Uploading... {uploadProgress}%
                      </p>
                    </div>
                  )}
                  {uploadState === "complete" && (
                    <p className="text-sm text-green-500 mt-2 flex items-center gap-1">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Upload complete! Redirecting...
                    </p>
                  )}
                </div>
                {uploadState === "selected" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetUpload}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Metadata fields */}
          {(uploadState === "selected" || uploadState === "error") && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Textbook Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Introduction to Algorithms"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="author">Author (optional)</Label>
                <Input
                  id="author"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="e.g., Thomas H. Cormen"
                />
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Actions */}
          {uploadState === "selected" && (
            <div className="flex gap-3">
              <Button onClick={handleUpload} className="flex-1">
                <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload & Process
              </Button>
              <Button variant="outline" onClick={resetUpload}>
                Cancel
              </Button>
            </div>
          )}

          {uploadState === "error" && (
            <Button variant="outline" onClick={resetUpload} className="w-full">
              Try Again
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-border/50 bg-secondary/30">
        <CardContent className="p-6">
          <h3 className="font-semibold text-foreground mb-3">What happens next?</h3>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs text-primary font-medium">1</span>
              <span>We&apos;ll extract the text and structure from your PDF</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs text-primary font-medium">2</span>
              <span>AI will identify chapters, sections, and exercises</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs text-primary font-medium">3</span>
              <span>Solutions will be generated for each exercise</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs text-primary font-medium">4</span>
              <span>You can start practicing with instant feedback!</span>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
