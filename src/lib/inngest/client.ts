import { Inngest } from "inngest";

// Create Inngest client
export const inngest = new Inngest({
  id: "studypdf",
  name: "StudyPDF",
});

// Event types
export type DocumentUploadedEvent = {
  name: "document/uploaded";
  data: {
    documentId: string;
    fileUrl: string;
    userId: string;
  };
};

export type DocumentExtractedEvent = {
  name: "document/extracted";
  data: {
    documentId: string;
    markdown: string;
    pageCount: number;
  };
};

export type DocumentStructuredEvent = {
  name: "document/structured";
  data: {
    documentId: string;
    chapterIds: string[];
    markdown: string; // Full text content for chunking
  };
};

export type DocumentEmbeddedEvent = {
  name: "document/embedded";
  data: {
    documentId: string;
    chunkCount: number;
  };
};

export type ExercisesExtractedEvent = {
  name: "exercises/extracted";
  data: {
    documentId: string;
    exerciseIds: string[];
  };
};

export type Events =
  | DocumentUploadedEvent
  | DocumentExtractedEvent
  | DocumentStructuredEvent
  | DocumentEmbeddedEvent
  | ExercisesExtractedEvent;
