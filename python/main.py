"""
StudyPDF - PDF Extraction Service

This FastAPI service handles PDF text extraction using Marker and PyMuPDF.
It's designed to be called by the Inngest background jobs.
"""

import os
import tempfile
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain_pymupdf4llm import PyMuPDF4LLMLoader


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


class PageInfo(BaseModel):
    page_number: int
    page_content: str


class ExtractionResponse(BaseModel):
    textbook_title: str
    page_count: int
    pages: list[PageInfo]
    markdown: str


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

        # Extract using langchain pymupdf4llm
        extraction_response = extract_with_langchain_pymupdf4llm(tmp_path)
    
        # Clean up temp file
        os.unlink(tmp_path)

        return extraction_response

    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"Failed to download PDF: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


def extract_with_langchain_pymupdf4llm(pdf_path: str) -> ExtractionResponse:
    """
    Extract PDF content using langchain pymupdf4ll library.
    """
    # TODO: come back and increase error handling to avoid crashes
    loader = PyMuPDF4LLMLoader(pdf_path)
    docs = loader.load()
    pages = [PageInfo(page_number=page.metadata.get('page'), page_content=page.page_content) for page in docs]
    page_count = docs[0].metadata.get('total_pages', 0)
    full_text = "\n\n".join([f"--- PAGE: {doc.metadata.get('page')} --- \n\n" + doc.page_content for doc in docs])
    # TODO: come back and replace unknown title with extraction from pdf path
    textbook_title = docs[0].metadata.get('title', 'Unknown Title')
    return ExtractionResponse(textbook_title=textbook_title, page_count=page_count, pages=pages, markdown=full_text)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
