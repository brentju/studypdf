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
import type { Database, FileType } from "@/types/database";

type UploadState = "idle" | "selected" | "uploading" | "processing" | "complete" | "error";
type DocumentInsert = Database["public"]["Tables"]["documents"]["Insert"];
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

// Accepted file types configuration
const ACCEPTED_FILE_TYPES = {
  // Documents
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  // Images
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  // Text/Code
  "text/plain": [".txt", ".md", ".csv"],
  "text/javascript": [".js", ".jsx", ".ts", ".tsx"],
  "text/x-python": [".py"],
  "text/html": [".html", ".css"],
  "application/json": [".json"],
};

// Map file extensions to our FileType
function getFileType(filename: string): FileType {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "doc";
  if (["ppt", "pptx"].includes(ext)) return "ppt";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
  if (["js", "jsx", "ts", "tsx", "py", "html", "css", "json"].includes(ext)) return "code";
  if (["txt", "md", "csv"].includes(ext)) return "text";

  return "text"; // Default fallback
}

// Get display name for file type
function getFileTypeDisplay(fileType: FileType): string {
  const displays: Record<FileType, string> = {
    pdf: "PDF Document",
    doc: "Word Document",
    docx: "Word Document",
    ppt: "Presentation",
    pptx: "Presentation",
    image: "Image",
    code: "Code File",
    text: "Text File",
  };
  return displays[fileType] || "Document";
}

// Get icon for file type
function FileTypeIcon({ fileType }: { fileType: FileType }) {
  if (fileType === "pdf") {
    return (
      <svg className="h-6 w-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  }
  if (fileType === "doc" || fileType === "docx") {
    return (
      <svg className="h-6 w-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  }
  if (fileType === "ppt" || fileType === "pptx") {
    return (
      <svg className="h-6 w-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  }
  if (fileType === "image") {
    return (
      <svg className="h-6 w-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  }
  if (fileType === "code") {
    return (
      <svg className="h-6 w-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    );
  }
  // Default text icon
  return (
    <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<FileType>("pdf");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const uploadedFile = acceptedFiles[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      setUploadState("selected");
      // Auto-fill title from filename (remove extension)
      const fileName = uploadedFile.name.replace(/\.[^/.]+$/, "");
      setTitle(fileName);
      // Detect file type
      const detectedType = getFileType(uploadedFile.name);
      setFileType(detectedType);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxFiles: 1,
    maxSize: 500 * 1024 * 1024, // 500MB
    onDropRejected: (rejections) => {
      const rejection = rejections[0];
      if (rejection.errors[0]?.code === "file-too-large") {
        setError("File is too large. Maximum size is 500MB.");
      } else if (rejection.errors[0]?.code === "file-invalid-type") {
        setError("Unsupported file type. Please upload a PDF, Word doc, PowerPoint, image, or code file.");
      } else {
        setError("Failed to upload file. Please try again.");
      }
    },
  });

  const handleUpload = async () => {
    if (!file || !title.trim()) {
      setError("Please provide a title for the document.");
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
        .from("documents")
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
        .from("documents")
        .getPublicUrl(fileName);

      setUploadProgress(70);

      // Create document record
      const insertData: DocumentInsert = {
        user_id: user.id,
        title: title.trim(),
        author: author.trim() || null,
        file_url: publicUrl,
        file_type: fileType,
        processing_status: fileType === "pdf" ? "pending" : "completed",
      };

      const { data: document, error: dbError } = await supabase
        .from("documents")
        .insert(insertData as never)
        .select()
        .single() as { data: DocumentRow | null; error: Error | null };

      if (dbError || !document) {
        throw new Error(dbError?.message || "Failed to create document record");
      }

      setUploadProgress(90);

      // Only trigger processing pipeline for PDFs
      if (fileType === "pdf") {
        await fetch("/api/process-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: document.id }),
        });
      }

      setUploadProgress(100);
      setUploadState("complete");

      // Redirect to document page after short delay
      setTimeout(() => {
        router.push(`/document/${document.id}`);
      }, 1500);

    } catch (err) {
      console.error("Upload error:", err);
      setError(err instanceof Error ? err.message : "Failed to upload. Please try again.");
      setUploadState("error");
    }
  };

  const resetUpload = () => {
    setFile(null);
    setFileType("pdf");
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
        <h1 className="text-3xl font-bold text-foreground">Upload Document</h1>
        <p className="text-muted-foreground mt-1">
          Upload PDFs, Word docs, images, code files, and more
        </p>
      </div>

      {/* Upload Card */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle>Select File</CardTitle>
          <CardDescription>
            Supported: PDF, Word, PowerPoint, images (JPG, PNG), code files, and text files. Max size: 500MB.
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
                  <p className="text-primary font-medium">Drop the file here...</p>
                ) : (
                  <>
                    <p className="text-foreground font-medium">
                      Drag & drop your file here
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
                  <FileTypeIcon fileType={fileType} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {file?.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {file && formatFileSize(file.size)} - {getFileTypeDisplay(fileType)}
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
                <Label htmlFor="title">Document Title *</Label>
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
                {fileType === "pdf" ? "Upload & Process" : "Upload"}
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
          {fileType === "pdf" ? (
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
          ) : (
            <p className="text-sm text-muted-foreground">
              Your {getFileTypeDisplay(fileType).toLowerCase()} will be uploaded and stored securely.
              You can view and download it anytime from your dashboard.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
