from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, File, UploadFile, Form
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
# from emergentintegrations.llm.chat import LlmChat, UserMessage
import os
from pathlib import Path
# from motor.motor_asyncio import AsyncIOMotorClient
import json
from datetime import datetime, timezone
import uuid
from typing import Dict, List, Set, Optional
import tempfile
import logging
import asyncio
import aiofiles
from dotenv import load_dotenv

from pdf_processor import PDFProcessor, EmbeddingGenerator, SupabaseRAGStorage

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PromptRequest(BaseModel):
    prompt: str
    context: str | None = None

@app.get("/")
async def root():
    return {"message": "tldraw AI chat server"}

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

@app.post("/api/ask")
async def ask_stream(request: PromptRequest):
    """Stream Claude Sonnet 4 chat completion response - DISABLED (emergentintegrations not available)"""
    return JSONResponse(
        content={"error": "AI chat is disabled. Install emergentintegrations to enable."},
        status_code=503
    )

# Initialize PDF processor
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")  # Use service role key for backend
OPENAI_KEY = os.getenv("OPENAI_API_KEY")

# Initialize with service role key for full permissions
pdf_processor = PDFProcessor(SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_KEY, openai_base_url=None)
embedding_gen = EmbeddingGenerator(OPENAI_KEY, base_url=None)
storage = SupabaseRAGStorage(SUPABASE_URL, SUPABASE_SERVICE_KEY)

BASE_DIR = Path(__file__).resolve().parent
HANDWRITING_UPLOAD_DIR = Path(
    os.getenv("HANDWRITING_UPLOAD_DIR", BASE_DIR / "uploads" / "handwriting")
)

# Pydantic models for PDF endpoints
class SearchRequest(BaseModel):
    query: str
    limit: int = 10
    threshold: float = 0.7
    document_id: Optional[str] = None

class SearchResult(BaseModel):
    id: str
    document_id: str
    chunk_text: str
    page_number: int
    similarity: float
    metadata: dict

# PDF Endpoints
@app.post("/api/pdf/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """
    Upload a PDF file, extract text, generate embeddings, and store in Supabase.
    """
    try:
        # Validate file type
        if not file.filename.endswith('.pdf'):
            raise HTTPException(status_code=400, detail="Only PDF files are allowed")
        
        # Validate file size (20MB limit)
        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)
        
        if file_size > 20 * 1024 * 1024:  # 20MB
            raise HTTPException(status_code=400, detail="File size exceeds 20MB limit")
        
        # Save to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_path = temp_file.name
        
        try:
            # Process the PDF
            result = await pdf_processor.process_pdf(temp_path, file.filename)
            return JSONResponse(content=result, status_code=200)
            
        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                os.unlink(temp_path)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PDF upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")

@app.get("/api/pdf/{document_id}")
async def get_document(document_id: str):
    """
    Get document metadata by ID.
    """
    try:
        document = storage.get_document(document_id)
        
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Add public URL
        public_url = storage.get_public_url(document['storage_path'])
        document['public_url'] = public_url
        
        return document
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get document: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/pdf/documents")
async def list_documents(limit: int = 50, offset: int = 0):
    """
    List all documents with pagination.
    """
    try:
        documents = storage.list_documents(limit, offset)
        
        # Add public URLs
        for doc in documents:
            doc['public_url'] = storage.get_public_url(doc['storage_path'])
        
        return {
            "documents": documents,
            "count": len(documents),
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"Failed to list documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/pdf/search")
async def search_pdfs(request: SearchRequest):
    """
    Perform semantic search on PDF chunks.
    """
    try:
        # Generate embedding for query
        query_embedding = embedding_gen.generate_embeddings([request.query])[0]
        
        # Search
        results = storage.similarity_search(
            query_embedding=query_embedding,
            limit=request.limit,
            threshold=request.threshold,
            document_id=request.document_id
        )
        
        return {
            "query": request.query,
            "results": results,
            "count": len(results)
        }
        
    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/handwriting-upload")
async def upload_handwriting_image(
    file: UploadFile = File(...),
    frameId: Optional[str] = Form(None),
    timestamp: Optional[str] = Form(None)
):
    """Upload handwriting frame image"""
    try:
        logger.info(
            "Handwriting upload request received frameId=%s filename=%s content_type=%s",
            frameId,
            file.filename,
            file.content_type,
        )
        # Create uploads directory if it doesn't exist
        HANDWRITING_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        
        # Generate filename using frameId or timestamp
        filename = f"{frameId or datetime.now(timezone.utc).timestamp()}.png"
        file_path = HANDWRITING_UPLOAD_DIR / filename
        
        # Save file asynchronously
        async with aiofiles.open(str(file_path), 'wb') as f:
            content = await file.read()
            content_length = len(content)
            logger.info(
                "Saving handwriting image to %s (bytes=%s)",
                str(file_path),
                content_length,
            )
            if content_length == 0:
                logger.warning(
                    "Handwriting image upload has zero bytes (frameId=%s filename=%s)",
                    frameId,
                    file.filename,
                )
            await f.write(content)
        
        logger.info(f"Uploaded handwriting image: {filename}")
        
        return {
            "success": True,
            "path": str(file_path),
            "filename": filename,
            "frameId": frameId,
            "timestamp": timestamp
        }
    except Exception as e:
        logger.error(f"Error uploading image: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
