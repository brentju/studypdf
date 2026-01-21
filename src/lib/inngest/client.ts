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
    documentUrl: string;
    userId: string;
  };
};

export type Events = DocumentUploadedEvent;
