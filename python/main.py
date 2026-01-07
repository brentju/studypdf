"""
StudyPDF - PDF Extraction Service

This FastAPI service handles PDF text extraction using Marker and PyMuPDF.
It's designed to be called by the Inngest background jobs.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import tempfile
import os
from pathlib import Path

app = FastAPI(
    title="StudyPDF PDF Extractor",
    description="PDF text extraction service for StudyPDF",
    version="0.1.0",
)

# CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ExtractionRequest(BaseModel):
    pdf_url: str


class ChapterInfo(BaseModel):
    number: int
    title: str
    start_page: int | None = None
    end_page: int | None = None


class ExtractionResponse(BaseModel):
    markdown: str
    page_count: int
    chapters: list[ChapterInfo]


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "pdf-extractor"}


@app.post("/extract", response_model=ExtractionResponse)
async def extract_pdf(request: ExtractionRequest):
    """
    Extract text and structure from a PDF file.

    Downloads the PDF from the provided URL and extracts:
    - Full text as markdown
    - Page count
    - Chapter structure (if detectable)
    """
    try:
        # Download PDF to temp file
        async with httpx.AsyncClient() as client:
            response = await client.get(request.pdf_url, follow_redirects=True)
            response.raise_for_status()

        # Save to temporary file
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_file:
            tmp_file.write(response.content)
            tmp_path = tmp_file.name

        try:
            # Try using Marker for extraction (better quality)
            markdown, page_count, chapters = extract_with_marker(tmp_path)
        except Exception as marker_error:
            print(f"Marker extraction failed, falling back to PyMuPDF: {marker_error}")
            # Fallback to PyMuPDF
            markdown, page_count, chapters = extract_with_pymupdf(tmp_path)
        finally:
            # Clean up temp file
            os.unlink(tmp_path)

        return ExtractionResponse(
            markdown=markdown,
            page_count=page_count,
            chapters=chapters,
        )

    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"Failed to download PDF: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


def extract_with_marker(pdf_path: str) -> tuple[str, int, list[ChapterInfo]]:
    """
    Extract PDF content using Marker library.
    Marker provides high-quality markdown output with good structure preservation.
    """
    try:
        from marker.convert import convert_single_pdf
        from marker.models import load_all_models

        # Load models (cached after first load)
        models = load_all_models()

        # Convert PDF to markdown
        full_text, images, out_meta = convert_single_pdf(
            pdf_path,
            models,
            max_pages=None,
            parallel_factor=1,
        )

        # Extract page count from metadata
        page_count = out_meta.get("pages", 0)

        # Parse chapters from markdown
        chapters = parse_chapters_from_markdown(full_text)

        return full_text, page_count, chapters

    except ImportError:
        raise Exception("Marker library not properly installed")


def extract_with_pymupdf(pdf_path: str) -> tuple[str, int, list[ChapterInfo]]:
    """
    Fallback extraction using PyMuPDF.
    Simpler but faster extraction method.
    """
    import fitz  # PyMuPDF

    doc = fitz.open(pdf_path)
    page_count = len(doc)

    # Extract text from all pages
    full_text_parts = []
    for page_num, page in enumerate(doc):
        text = page.get_text("text")
        full_text_parts.append(f"<!-- Page {page_num + 1} -->\n{text}")

    full_text = "\n\n".join(full_text_parts)

    # Try to extract TOC for chapter info
    toc = doc.get_toc()
    chapters = []

    for i, entry in enumerate(toc):
        level, title, page = entry
        if level == 1:  # Only top-level entries as chapters
            chapters.append(ChapterInfo(
                number=len(chapters) + 1,
                title=title,
                start_page=page,
            ))

    # If no TOC, try to detect chapters from text
    if not chapters:
        chapters = parse_chapters_from_markdown(full_text)

    doc.close()

    return full_text, page_count, chapters


def parse_chapters_from_markdown(text: str) -> list[ChapterInfo]:
    """
    Parse chapter structure from markdown/text content.
    Looks for common chapter patterns.
    """
    import re

    chapters = []

    # Common chapter patterns
    patterns = [
        r'^#{1,2}\s*Chapter\s+(\d+)[:\s]*(.+)$',  # # Chapter 1: Title
        r'^#{1,2}\s*(\d+)[.\s]+(.+)$',  # # 1. Title
        r'^Chapter\s+(\d+)[:\s]*(.+)$',  # Chapter 1: Title
        r'^CHAPTER\s+(\d+)[:\s]*(.+)$',  # CHAPTER 1: Title
    ]

    for pattern in patterns:
        matches = re.findall(pattern, text, re.MULTILINE | re.IGNORECASE)
        if matches:
            for match in matches:
                try:
                    chapter_num = int(match[0])
                    title = match[1].strip()
                    chapters.append(ChapterInfo(
                        number=chapter_num,
                        title=title,
                    ))
                except (ValueError, IndexError):
                    continue
            break  # Use first pattern that finds chapters

    # If still no chapters, create a default
    if not chapters:
        chapters = [ChapterInfo(number=1, title="Main Content")]

    return chapters


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
