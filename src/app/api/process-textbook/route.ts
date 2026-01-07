import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import type { Database } from "@/types/database";

type Textbook = Database["public"]["Tables"]["textbooks"]["Row"];

export async function POST(request: Request) {
  try {
    const { textbookId } = await request.json();

    if (!textbookId) {
      return NextResponse.json(
        { error: "textbookId is required" },
        { status: 400 }
      );
    }

    // Verify the textbook exists and belongs to the user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: textbook, error } = await supabase
      .from("textbooks")
      .select("*")
      .eq("id", textbookId)
      .eq("user_id", user.id)
      .single() as { data: Textbook | null; error: Error | null };

    if (error || !textbook) {
      return NextResponse.json(
        { error: "Textbook not found" },
        { status: 404 }
      );
    }

    // Send event to Inngest to start background processing
    await inngest.send({
      name: "textbook/uploaded",
      data: {
        textbookId: textbook.id,
        pdfUrl: textbook.pdf_url,
        userId: user.id,
      },
    });

    return NextResponse.json({ success: true, textbookId });
  } catch (error) {
    console.error("Error triggering textbook processing:", error);
    return NextResponse.json(
      { error: "Failed to start processing" },
      { status: 500 }
    );
  }
}
