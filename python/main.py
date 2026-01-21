import os
import tempfile
from typing import List

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import Client, create_client

from langchain_community.vectorstores import SupabaseVectorStore
from langchain_openai import OpenAIEmbeddings
from langchain_pymupdf4llm import PyMuPDF4LLMLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter


# Load environment variables
load_dotenv("../.env.local")

app = FastAPI(
    title="StudyPDF Processing Service",
    description="Complete PDF processing and RAG pipeline for StudyPDF",
    version="0.2.0",
)

# CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase Client (Singleton)
supabase: Client = create_client(
    os.getenv("NEXT_PUBLIC_SUPABASE_URL", ""),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
)

# Embeddings Model (Singleton)
embeddings_model = OpenAIEmbeddings()

# LangChain Text Splitter (Singleton)
text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)

# Supabase Vector Store (Singleton)
vector_store = SupabaseVectorStore(
            embedding=embeddings_model,
            client=supabase,
            table_name="documents",
            query_name="match_documents",
        )


class ProcessRequest(BaseModel):
    document_id: str
    document_url: str


class ProcessResponse(BaseModel):
    document_id: str
    success: bool
    chunk_count: int


# ============================================================================
# Helper Functions
# ============================================================================

def sanitize_text(text: str) -> str:
    """
    Remove null bytes for PostgreSQL compatibility.

    PostgreSQL does not support null bytes in TEXT fields.
    See: https://github.com/langchain-ai/langchain/issues/26033
    """
    return text.replace('\x00', '')


async def process_document_pipeline(
    process_request: ProcessRequest,
) -> ProcessResponse:
    """
    Complete pipeline: Extract -> Parse -> Chunk -> Embed -> Store
    """

    # TODO: Eventually support other document types as well

    # Step 1: Download PDF
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(process_request.document_url, follow_redirects=True)
        response.raise_for_status()

    # Save to temp file
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_file:
        tmp_file.write(response.content)
        tmp_path = tmp_file.name

    try:

        # TODO create a factory or something that takes in the document path and decides which extraction method to use based on file type
        # and returns a list of documents
        # Step 2: Extract PDF text

        loader = PyMuPDF4LLMLoader(tmp_path)
        docs = loader.load()

        # Chunk documents
        chunks = text_splitter.split_documents(docs)

        # Sanitize chunks to remove null bytes (PostgreSQL requirement)
        # Also add metadata for document_id and chunk_index for future retrieval from DB
        for i, chunk in enumerate(chunks):
            chunk.page_content = sanitize_text(chunk.page_content)
            chunk.metadata['document_id'] = process_request.document_id
            chunk.metadata['chunk_index'] = i

        # Step 3: Store in Supabase Vector Store
        vector_store.add_documents(chunks)

        return ProcessResponse(
            success=True,
            document_id=process_request.document_id,
            chunk_count=len(chunks)
        )

    finally:
        # Clean up temp file
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "pdf-processor"}


# TODO: turn this into a factory of some kind so we can use different document types
@app.post("/process", response_model=ProcessResponse)
async def process_document(request: ProcessRequest):
    """
    Complete RAG pipeline:
    1. Extract PDF text
    2. Chunk text with LangChain
    3. Generate embeddings with OpenAI
    4. Store everything in Supabase
    """
    try:
        result = await process_document_pipeline(
            process_request=request,
        )
        return result

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Processing failed: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
