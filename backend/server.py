from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, File, UploadFile, Form
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from motor.motor_asyncio import AsyncIOMotorClient
import json
from datetime import datetime, timezone
import uuid
from typing import Dict, List, Set, Optional
import tempfile
import logging
import asyncio
import aiofiles
from dotenv import load_dotenv

# Configure logging first
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Optional import for AI chat feature
try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    EMERGENT_AVAILABLE = True
except ImportError:
    EMERGENT_AVAILABLE = False
    logger.warning("emergentintegrations not available - AI chat feature will be disabled")

# Optional import for PDF processing
try:
    from pdf_processor import PDFProcessor, EmbeddingGenerator, SupabaseRAGStorage
    PDF_PROCESSING_AVAILABLE = True
except ImportError:
    PDF_PROCESSING_AVAILABLE = False
    logger.warning("pdf_processor not available - PDF upload feature will be disabled")

# Load environment variables
load_dotenv()

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
    """Stream Claude Sonnet 4 chat completion response"""
    if not EMERGENT_AVAILABLE:
        return {"error": "AI chat feature not available - emergentintegrations package not installed"}, 503
    
    try:
        # Get Emergent LLM key
        api_key = os.getenv("EMERGENT_LLM_KEY")
        if not api_key:
            return {"error": "API key not configured"}, 500
        
        # Create chat instance with Claude Sonnet 4
        chat = LlmChat(
            api_key=api_key,
            session_id=f"canvas-session",
            system_message="You are a helpful assistant integrated into a collaborative drawing canvas. Provide clear, concise, and helpful responses."
        ).with_model("anthropic", "claude-sonnet-4-20250514")
        
        # Create user message
        user_message = UserMessage(text=request.prompt)
        
        async def generate():
            """Generator function to stream responses"""
            try:
                # Send message and get response
                # Note: emergentintegrations doesn't have send_message_stream, so we get full response
                response = await chat.send_message(user_message)
                
                # Simulate streaming by sending the response in chunks
                chunk_size = 10  # characters per chunk
                for i in range(0, len(response), chunk_size):
                    chunk = response[i:i + chunk_size]
                    yield f"data: {json.dumps({'content': chunk})}\n\n"
                    await asyncio.sleep(0.02)  # Small delay to simulate streaming
                
                # Send completion signal
                yield "data: [DONE]\n\n"
            except Exception as e:
                error_msg = f"Error during streaming: {str(e)}"
                yield f"data: {json.dumps({'error': error_msg})}\n\n"
        
        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
    
    except Exception as e:
        return {"error": str(e)}, 500

# Initialize PDF processor (if available)
if PDF_PROCESSING_AVAILABLE:
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")  # Use service role key for backend
    OPENAI_KEY = os.getenv("OPENAI_API_KEY")

    # Initialize with service role key for full permissions
    pdf_processor = PDFProcessor(SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_KEY, openai_base_url=None)
    embedding_gen = EmbeddingGenerator(OPENAI_KEY, base_url=None)
    storage = SupabaseRAGStorage(SUPABASE_URL, SUPABASE_SERVICE_KEY)
else:
    pdf_processor = None
    embedding_gen = None
    storage = None

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
    if not PDF_PROCESSING_AVAILABLE:
        raise HTTPException(status_code=503, detail="PDF processing feature not available - pdf_processor module not installed")
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
    if not PDF_PROCESSING_AVAILABLE or not storage:
        raise HTTPException(status_code=503, detail="PDF processing feature not available")
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
    if not PDF_PROCESSING_AVAILABLE or not storage:
        raise HTTPException(status_code=503, detail="PDF processing feature not available")
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
    if not PDF_PROCESSING_AVAILABLE or not embedding_gen or not storage:
        raise HTTPException(status_code=503, detail="PDF processing feature not available")
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
        # Create uploads directory if it doesn't exist
        upload_dir = "/app/backend/uploads/handwriting"
        os.makedirs(upload_dir, exist_ok=True)
        
        # Generate filename using frameId or timestamp
        filename = f"{frameId or datetime.now(timezone.utc).timestamp()}.png"
        file_path = os.path.join(upload_dir, filename)
        
        # Save file asynchronously
        async with aiofiles.open(file_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
        logger.info(f"Uploaded handwriting image: {filename}")
        
        return {
            "success": True,
            "path": file_path,
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