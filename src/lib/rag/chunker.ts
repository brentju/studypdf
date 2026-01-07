/**
 * Text chunking utilities for RAG pipeline
 *
 * Strategy:
 * - Target chunk size: 400-512 tokens (~1600-2000 characters)
 * - Overlap: 15% (~75 tokens / 300 characters)
 * - Preserve: Headers, page boundaries where possible
 * - Split hierarchy: Headers → Paragraphs → Sentences
 */

export interface TextChunk {
  content: string;
  index: number;
  metadata: {
    startChar: number;
    endChar: number;
    pageNumber?: number;
    chapterNumber?: number;
    sectionTitle?: string;
  };
}

export interface ChunkOptions {
  maxChunkSize?: number;      // Max characters per chunk (default: 1800)
  minChunkSize?: number;      // Min characters per chunk (default: 200)
  overlapSize?: number;       // Overlap between chunks (default: 300)
  preservePageBoundaries?: boolean;
}

const DEFAULT_OPTIONS: Required<ChunkOptions> = {
  maxChunkSize: 1800,
  minChunkSize: 200,
  overlapSize: 300,
  preservePageBoundaries: true,
};

/**
 * Sanitize text for PostgreSQL storage
 * Removes null bytes and other problematic Unicode characters
 */
export function sanitizeText(text: string): string {
  return text
    // Remove null bytes (PostgreSQL doesn't support \u0000)
    .replace(/\u0000/g, "")
    // Remove other problematic control characters (except newlines, tabs)
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    // Normalize unicode
    .normalize("NFC");
}

/**
 * Split text into chunks suitable for embedding
 */
export function chunkText(
  text: string,
  options: ChunkOptions = {}
): TextChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunks: TextChunk[] = [];

  // Sanitize input text first
  text = sanitizeText(text);

  // First, try to split by headers/sections
  const sections = splitByHeaders(text);

  let chunkIndex = 0;
  let globalCharOffset = 0;

  for (const section of sections) {
    const sectionChunks = chunkSection(section.content, opts, chunkIndex, globalCharOffset);

    // Add section metadata to each chunk
    for (const chunk of sectionChunks) {
      chunk.metadata.sectionTitle = section.title;
      chunk.metadata.chapterNumber = section.chapterNumber;
      chunks.push(chunk);
      chunkIndex++;
    }

    globalCharOffset += section.content.length;
  }

  return chunks;
}

/**
 * Split text by markdown headers
 */
function splitByHeaders(text: string): Array<{
  title?: string;
  chapterNumber?: number;
  content: string;
}> {
  const sections: Array<{ title?: string; chapterNumber?: number; content: string }> = [];

  // Match ## or # headers
  const headerRegex = /^(#{1,2})\s+(?:Chapter\s+)?(\d+)?[:\s]*(.+)$/gm;

  let lastIndex = 0;
  let lastTitle: string | undefined;
  let lastChapterNumber: number | undefined;
  let match;

  while ((match = headerRegex.exec(text)) !== null) {
    // Save content before this header
    if (match.index > lastIndex) {
      const content = text.slice(lastIndex, match.index).trim();
      if (content) {
        sections.push({
          title: lastTitle,
          chapterNumber: lastChapterNumber,
          content,
        });
      }
    }

    lastTitle = match[3]?.trim();
    lastChapterNumber = match[2] ? parseInt(match[2]) : undefined;
    lastIndex = match.index + match[0].length;
  }

  // Don't forget the last section
  const remainingContent = text.slice(lastIndex).trim();
  if (remainingContent) {
    sections.push({
      title: lastTitle,
      chapterNumber: lastChapterNumber,
      content: remainingContent,
    });
  }

  // If no headers found, return the whole text as one section
  if (sections.length === 0) {
    sections.push({ content: text });
  }

  return sections;
}

/**
 * Chunk a single section of text
 */
function chunkSection(
  text: string,
  opts: Required<ChunkOptions>,
  startIndex: number,
  globalCharOffset: number
): TextChunk[] {
  const chunks: TextChunk[] = [];

  // If text is small enough, return as single chunk
  if (text.length <= opts.maxChunkSize) {
    return [{
      content: text,
      index: startIndex,
      metadata: {
        startChar: globalCharOffset,
        endChar: globalCharOffset + text.length,
      },
    }];
  }

  // Split into paragraphs first
  const paragraphs = text.split(/\n\n+/);

  let currentChunk = "";
  let chunkStartChar = globalCharOffset;
  let currentCharOffset = globalCharOffset;

  for (const paragraph of paragraphs) {
    const paragraphWithBreak = paragraph + "\n\n";

    // If adding this paragraph exceeds max size, save current chunk
    if (currentChunk.length + paragraphWithBreak.length > opts.maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        index: startIndex + chunks.length,
        metadata: {
          startChar: chunkStartChar,
          endChar: currentCharOffset,
        },
      });

      // Start new chunk with overlap
      const overlapStart = Math.max(0, currentChunk.length - opts.overlapSize);
      currentChunk = currentChunk.slice(overlapStart);
      chunkStartChar = currentCharOffset - (currentChunk.length);
    }

    // If single paragraph is too long, split by sentences
    if (paragraphWithBreak.length > opts.maxChunkSize) {
      const sentences = splitIntoSentences(paragraph);

      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > opts.maxChunkSize && currentChunk.length > 0) {
          chunks.push({
            content: currentChunk.trim(),
            index: startIndex + chunks.length,
            metadata: {
              startChar: chunkStartChar,
              endChar: currentCharOffset,
            },
          });

          const overlapStart = Math.max(0, currentChunk.length - opts.overlapSize);
          currentChunk = currentChunk.slice(overlapStart);
          chunkStartChar = currentCharOffset - currentChunk.length;
        }

        currentChunk += sentence + " ";
        currentCharOffset += sentence.length + 1;
      }
    } else {
      currentChunk += paragraphWithBreak;
      currentCharOffset += paragraphWithBreak.length;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length >= opts.minChunkSize) {
    chunks.push({
      content: currentChunk.trim(),
      index: startIndex + chunks.length,
      metadata: {
        startChar: chunkStartChar,
        endChar: currentCharOffset,
      },
    });
  } else if (chunks.length > 0) {
    // Append to last chunk if too small
    chunks[chunks.length - 1].content += "\n\n" + currentChunk.trim();
    chunks[chunks.length - 1].metadata.endChar = currentCharOffset;
  } else {
    // If this is the only chunk, include it even if small
    chunks.push({
      content: currentChunk.trim(),
      index: startIndex,
      metadata: {
        startChar: chunkStartChar,
        endChar: currentCharOffset,
      },
    });
  }

  return chunks;
}

/**
 * Split text into sentences
 */
function splitIntoSentences(text: string): string[] {
  // Simple sentence splitting - handles common cases
  // Regex matches: period/question/exclamation followed by space and capital letter
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  return sentences.filter(s => s.trim().length > 0);
}

/**
 * Extract page numbers from PyMuPDF-style markers
 * Format: <!-- Page X -->
 */
export function extractPageInfo(text: string): Map<number, { start: number; end: number }> {
  const pageMap = new Map<number, { start: number; end: number }>();
  const pageRegex = /<!--\s*Page\s+(\d+)\s*-->/g;

  let lastPage = 0;
  let lastStart = 0;
  let match;

  while ((match = pageRegex.exec(text)) !== null) {
    const pageNum = parseInt(match[1]);

    if (lastPage > 0) {
      pageMap.set(lastPage, { start: lastStart, end: match.index });
    }

    lastPage = pageNum;
    lastStart = match.index + match[0].length;
  }

  // Last page extends to end of text
  if (lastPage > 0) {
    pageMap.set(lastPage, { start: lastStart, end: text.length });
  }

  return pageMap;
}

/**
 * Add page numbers to chunks based on character positions
 */
export function addPageNumbersToChunks(
  chunks: TextChunk[],
  pageMap: Map<number, { start: number; end: number }>
): TextChunk[] {
  for (const chunk of chunks) {
    // Find which page this chunk primarily belongs to
    for (const [pageNum, { start, end }] of pageMap) {
      const chunkMidpoint = (chunk.metadata.startChar + chunk.metadata.endChar) / 2;
      if (chunkMidpoint >= start && chunkMidpoint < end) {
        chunk.metadata.pageNumber = pageNum;
        break;
      }
    }
  }

  return chunks;
}
