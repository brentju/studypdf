import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import type { Database } from "@/types/database";

type Document = Database["public"]["Tables"]["documents"]["Row"];

export async function POST(request: Request) {
  try {
    const { documentId } = await request.json();

    if (!documentId) {
      return NextResponse.json(
        { error: "documentId is required" },
        { status: 400 }
      );
    }

    // Verify the document exists and belongs to the user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: document, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single() as { data: Document | null; error: Error | null };

    if (error || !document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // Only process PDFs
    if (document.file_type !== "pdf") {
      return NextResponse.json(
        { error: "Only PDF documents can be processed" },
        { status: 400 }
      );
    }

    // Send event to Inngest to start background processing
    await inngest.send({
      name: "document/uploaded",
      data: {
        documentId: document.id,
        fileUrl: document.file_url,
        userId: user.id,
      },
    });

    return NextResponse.json({ success: true, documentId });
  } catch (error) {
    console.error("Error triggering document processing:", error);
    return NextResponse.json(
      { error: "Failed to start processing" },
      { status: 500 }
    );
  }
}
