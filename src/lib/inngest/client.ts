import { Inngest } from "inngest";

// Create Inngest client
export const inngest = new Inngest({
  id: "studypdf",
  name: "StudyPDF",
});

// Event types
export type TextbookUploadedEvent = {
  name: "textbook/uploaded";
  data: {
    textbookId: string;
    pdfUrl: string;
    userId: string;
  };
};

export type TextbookExtractedEvent = {
  name: "textbook/extracted";
  data: {
    textbookId: string;
    markdown: string;
    pageCount: number;
  };
};

export type TextbookStructuredEvent = {
  name: "textbook/structured";
  data: {
    textbookId: string;
    chapterIds: string[];
  };
};

export type TextbookEmbeddedEvent = {
  name: "textbook/embedded";
  data: {
    textbookId: string;
    chunkCount: number;
  };
};

export type ExercisesExtractedEvent = {
  name: "exercises/extracted";
  data: {
    textbookId: string;
    exerciseIds: string[];
  };
};

export type Events =
  | TextbookUploadedEvent
  | TextbookExtractedEvent
  | TextbookStructuredEvent
  | TextbookEmbeddedEvent
  | ExercisesExtractedEvent;
