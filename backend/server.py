from fastapi import (
    BackgroundTasks,
    FastAPI,
    WebSocket,
    WebSocketDisconnect,
    HTTPException,
    File,
    UploadFile,
    Form,
)
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
# from emergentintegrations.llm.chat import LlmChat, UserMessage
import os
# from motor.motor_asyncio import AsyncIOMotorClient
import json
import requests
from datetime import datetime, timezone
import uuid
from typing import Dict, List, Set, Optional
import tempfile
import logging
import asyncio
from dotenv import load_dotenv

from pdf_processor import (
    PDFProcessor,
    EmbeddingGenerator,
    SupabaseRAGStorage,
    HandwritingProcessor,
)

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
    shape_ids: Optional[List[str]] = None


def format_selection_context(entries: List[Dict]) -> str:
    if not entries:
        return ""
    lines = []
    for idx, entry in enumerate(entries, start=1):
        snippet = (entry.get("text") or "").strip().replace("\n", " ")
        snippet = " ".join(snippet.split())
        if entry.get("source_type") == "handwriting":
            label = f"Handwriting frame {entry.get('frame_id')}"
        else:
            doc_label = entry.get("filename") or entry.get("document_id")
            page = entry.get("page_number")
            page_suffix = f" (page {page})" if page is not None else ""
            label = f"PDF {doc_label}{page_suffix}"
        similarity = entry.get("similarity")
        sim_text = f" [similarity {similarity:.2f}]" if isinstance(similarity, (int, float)) else ""
        lines.append(f"{idx}. {label}{sim_text}: {snippet}")
    return "Use the following canvas context when answering:\n" + "\n".join(lines)

@app.get("/")
async def root():
    return {"message": "tldraw AI chat server"}

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

# Daily.co Video Call Endpoint
class VideoRoomRequest(BaseModel):
    room_id: str

@app.post("/api/video/room")
async def get_or_create_video_room(request: VideoRoomRequest):
    """Get or create a Daily.co room for the canvas"""
    try:
        api_key = os.getenv("DAILY_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="Daily.co API key not configured")

        # Room name based on canvas room ID
        room_name = f"canvas-{request.room_id}"

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        # Try to get existing room first
        get_url = f"https://api.daily.co/v1/rooms/{room_name}"
        get_response = requests.get(get_url, headers=headers)

        if get_response.status_code == 200:
            # Room exists
            room_data = get_response.json()
            logger.info(f"Found existing Daily.co room: {room_name}")
            return {
                "url": room_data["url"],
                "room_name": room_data["name"],
                "created": False
            }
        elif get_response.status_code == 404:
            # Room doesn't exist, create it
            logger.info(f"Room {room_name} not found, creating new room")
        else:
            # Other error from GET request (e.g., 401, 403, 500)
            logger.error(f"Daily.co API GET error: {get_response.status_code} - {get_response.text}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to check Daily.co room: {get_response.text}"
            )

        # Room doesn't exist, create it
        create_url = "https://api.daily.co/v1/rooms"
        room_config = {
            "name": room_name,
            "properties": {
                "enable_screenshare": True,
                "enable_chat": True,
                "start_video_off": False,
                "start_audio_off": False,
                "enable_recording": "cloud"
            }
        }

        create_response = requests.post(create_url, headers=headers, json=room_config)

        if create_response.status_code in [200, 201]:
            room_data = create_response.json()
            logger.info(f"Created new Daily.co room: {room_name}")
            return {
                "url": room_data["url"],
                "room_name": room_data["name"],
                "created": True
            }
        else:
            logger.error(f"Daily.co API POST error: {create_response.status_code} - {create_response.text}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to create Daily.co room: {create_response.text}"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting/creating video room: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ask")
async def ask_stream(request: PromptRequest):
    """Stream Thesys C1 generative UI response"""
    from openai import AsyncOpenAI

    selected_shape_ids = request.shape_ids or []
    selection_context_entries: List[Dict] = []
    selection_context_text = ""

    if selected_shape_ids:
        logger.info("ask_stream received %d selected shapes", len(selected_shape_ids))
        try:
            query_embedding = embedding_gen.generate_embeddings([request.prompt])[0]
            selection_context_entries = storage.search_context_for_shape_ids(
                selected_shape_ids,
                query_embedding,
                handwriting_limit_per_note=5,
                pdf_limit_per_document=5,
                threshold=0.2,
            )
        except Exception as e:
            logger.error("Failed generating embeddings or searching context: %s", e, exc_info=True)
            selection_context_entries = storage.get_context_for_shape_ids(selected_shape_ids)

        selection_context_text = format_selection_context(selection_context_entries)
    else:
        logger.info("ask_stream invoked without selected shapes")
    
    async def generate_c1_response():
        try:
            # Initialize OpenAI client with Thesys base URL
            client = AsyncOpenAI(
                base_url="https://api.thesys.dev/v1/embed",
                api_key=os.getenv("THESYS_API_KEY")
            )
            
            messages = [
                {
                    "role": "system",
                    "content": """You are a helpful AI assistant that generates rich, interactive UI responses.
When answering questions:
- Use markdown formatting for better readability
- Create tables for comparisons
- Use lists for step-by-step instructions
- Use code blocks with syntax highlighting for code examples
- Be concise but informative
- Generate visual, card-like responses when appropriate"""
                },
                {
                    "role": "user",
                    "content": request.prompt
                }
            ]
            
            # Add context if provided
            if request.context:
                messages.append({
                    "role": "system",
                    "content": f"Additional context: {request.context}"
                })

            if selection_context_text:
                messages.append({
                    "role": "system",
                    "content": selection_context_text
                })
            
            # Create streaming completion
            stream = await client.chat.completions.create(
                model="c1/anthropic/claude-sonnet-4/v-20250930",
                messages=messages,
                stream=True
            )
            
            # Stream the response
            if selection_context_entries:
                yield f"data: {json.dumps({'context_entries': selection_context_entries})}\n\n"

            async for chunk in stream:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        # Yield in SSE format
                        yield f"data: {json.dumps({'content': delta.content})}\n\n"
            
            yield "data: [DONE]\n\n"
            
        except Exception as e:
            logger.error(f"C1 streaming error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate_c1_response(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

# Initialize PDF processor
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")  # Use service role key for backend
OPENAI_KEY = os.getenv("OPENAI_API_KEY")

# Initialize with service role key for full permissions
pdf_processor = PDFProcessor(SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_KEY, openai_base_url=None)
embedding_gen = EmbeddingGenerator(OPENAI_KEY, base_url=None)
storage = SupabaseRAGStorage(SUPABASE_URL, SUPABASE_SERVICE_KEY)
handwriting_processor = HandwritingProcessor(storage, embedding_gen)

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


class PdfCanvasLinkRequest(BaseModel):
    shapeId: str
    documentId: str
    roomId: Optional[str] = None


@app.post("/api/pdf/canvas-link")
async def upsert_pdf_canvas_link(request: PdfCanvasLinkRequest):
    """
    Link a canvas PDF shape to a stored document for future context lookup.
    """
    try:
        # Validate document exists
        document = storage.get_document(request.documentId)
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        link = storage.upsert_pdf_canvas_link(
            shape_id=request.shapeId,
            document_id=request.documentId,
            room_id=request.roomId,
        )
        return {"success": True, "link": link}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to upsert pdf canvas link: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to link canvas shape")

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
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    frameId: Optional[str] = Form(None),
    timestamp: Optional[str] = Form(None),
    bounds: Optional[str] = Form(None),
    handwritingShapeIds: Optional[str] = Form(None),
    groupId: Optional[str] = Form(None),
    roomId: Optional[str] = Form("default"),
):
    """Upload handwriting frame image, store in Supabase, and trigger OCR pipeline."""
    try:
        logger.info(
            "Handwriting upload request received frameId=%s filename=%s content_type=%s",
            frameId,
            file.filename,
            file.content_type,
        )

        if file.content_type not in ("image/png", "image/jpeg", "image/jpg"):
            raise HTTPException(status_code=400, detail="Only PNG or JPG images are allowed")

        image_bytes = await file.read()
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Uploaded image is empty")

        normalized_frame_id = frameId or str(uuid.uuid4())
        filename = f"{normalized_frame_id}.png"

        storage_path = storage.upload_handwriting_image(
            image_bytes=image_bytes,
            filename=filename,
            content_type=file.content_type or "image/png",
        )

        bounds_payload = None
        if bounds:
            try:
                bounds_payload = json.loads(bounds)
            except json.JSONDecodeError:
                logger.warning("Invalid bounds payload for frame %s: %s", normalized_frame_id, bounds)

        stroke_ids = None
        if handwritingShapeIds:
            try:
                stroke_ids = json.loads(handwritingShapeIds)
            except json.JSONDecodeError:
                logger.warning(
                    "Invalid handwritingShapeIds payload for frame %s: %s",
                    normalized_frame_id,
                    handwritingShapeIds,
                )

        metadata = {"timestamp": timestamp} if timestamp else {}
        try:
            note_id = storage.insert_handwriting_note(
                frame_id=normalized_frame_id,
                storage_path=storage_path,
                room_id=roomId,
                stroke_ids=stroke_ids,
                page_bounds=bounds_payload,
                group_id=groupId,
                metadata=metadata,
                status="processing",
            )
        except Exception as e:
            logger.error("Failed to insert handwriting note metadata: %s", e, exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to store handwriting metadata")

        background_tasks.add_task(handwriting_processor.process_note, note_id, image_bytes)

        public_url = storage.get_public_url(storage_path, bucket=storage.handwriting_bucket)

        return {
            "success": True,
            "note_id": note_id,
            "frameId": normalized_frame_id,
            "storage_path": storage_path,
            "public_url": public_url,
            "status": "processing",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading handwriting image: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=True)
