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
from system_prompt import SYSTEM_PROMPT
from image_search_tool import get_image_search_tool

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

class TypedNoteShape(BaseModel):
    shapeId: str
    text: str
    order: Optional[int] = None
    props: Optional[dict] = None

class TypedNoteSyncRequest(BaseModel):
    frameId: str
    roomId: Optional[str] = "default"
    bounds: Optional[dict] = None
    textShapes: List[TypedNoteShape]


def format_selection_context(entries: List[Dict]) -> str:
    if not entries:
        return ""
    lines = []
    for idx, entry in enumerate(entries, start=1):
        snippet = (entry.get("text") or "").strip().replace("\n", " ")
        snippet = " ".join(snippet.split())
        source_type = entry.get("source_type")
        if source_type == "handwriting":
            label = f"Handwriting frame {entry.get('frame_id')}"
        elif source_type == "pdf":
            doc_label = entry.get("filename") or entry.get("document_id")
            page = entry.get("page_number")
            page_suffix = f" (page {page})" if page is not None else ""
            label = f"PDF {doc_label}{page_suffix}"
        elif source_type == "typed":
            label = f"Typed note {entry.get('frame_id')}"
        else:
            label = "Context"
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

def parse_tool_arguments(tool_call: Dict) -> Dict:
    """
    Safely parse tool call arguments, handling edge cases.
    
    Args:
        tool_call: Dictionary containing tool call information
        
    Returns:
        Parsed arguments as dictionary
    """
    arguments = tool_call.get("arguments")
    
    # Handle None or missing arguments
    if arguments is None:
        return {}
    
    # If arguments is already a dict (already parsed), return it
    if isinstance(arguments, dict):
        return arguments
    
    # If arguments is a string, parse it
    if isinstance(arguments, str):
        # Handle empty string
        if not arguments.strip():
            return {}
        
        try:
            return json.loads(arguments)
        except json.JSONDecodeError as e:
            # Log the error for debugging
            logger.error(f"Failed to parse tool arguments: {arguments}")
            logger.error(f"Parse error: {e}")
            return {}
    
    # Fallback: return empty dict
    return {}


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
                typed_limit_per_note=5,
                threshold=0.2,
            )
        except Exception as e:
            logger.error("Failed generating embeddings or searching context: %s", e, exc_info=True)
            selection_context_entries = storage.get_context_for_shape_ids(
                selected_shape_ids,
                handwriting_limit_per_note=5,
                pdf_limit_per_document=5,
                typed_limit_per_note=5,
            )

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
            
            # Get image search tool
            image_tool = get_image_search_tool()
            
            messages = [
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT
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
            
            # Prepare tools (only if image search is enabled)
            tools = None
            if image_tool.enabled:
                tools = [image_tool.get_tool_definition()]
            
            # Create streaming completion with tools
            completion_params = {
                "model": "c1/anthropic/claude-sonnet-4/v-20250930",
                "messages": messages,
                "stream": True
            }
            if tools:
                completion_params["tools"] = tools
            
            # Stream the response
            if selection_context_entries:
                yield f"data: {json.dumps({'context_entries': selection_context_entries})}\n\n"

            # Track tool calls
            current_tool_call = None
            tool_call_id = None
            
            # Use a while loop to handle multiple tool call rounds
            max_tool_call_rounds = 10  # Prevent infinite loops
            tool_call_round = 0
            
            while tool_call_round < max_tool_call_rounds:
                tool_call_round += 1
                stream = await client.chat.completions.create(**completion_params)
                tool_call_executed = False
                last_finish_reason = None
                
                async for chunk in stream:
                    if chunk.choices and len(chunk.choices) > 0:
                        delta = chunk.choices[0].delta
                        finish_reason = chunk.choices[0].finish_reason
                        if finish_reason:
                            last_finish_reason = finish_reason
                        
                        # Handle regular content
                        if delta.content:
                            yield f"data: {json.dumps({'content': delta.content})}\n\n"
                        
                        # Handle tool calls
                        if delta.tool_calls:
                            for tool_call_delta in delta.tool_calls:
                                if tool_call_delta.function:
                                    if tool_call_delta.id:
                                        # Check if this is a new tool call or continuation of existing one
                                        if current_tool_call and tool_call_id == tool_call_delta.id:
                                            # Same ID - accumulate data instead of resetting
                                            existing_name = current_tool_call.get("name", "").strip()
                                            if tool_call_delta.function.name:
                                                if not existing_name:
                                                    current_tool_call["name"] = tool_call_delta.function.name
                                                    logger.debug(f"Tool call name set in continuation chunk: '{tool_call_delta.function.name}'")
                                                elif existing_name != tool_call_delta.function.name:
                                                    logger.warning(f"Tool call name mismatch: existing='{existing_name}', new='{tool_call_delta.function.name}', keeping existing")
                                            
                                            # Accumulate arguments
                                            args_chunk = tool_call_delta.function.arguments or ""
                                            if args_chunk:
                                                current_tool_call["arguments"] += args_chunk
                                                logger.debug(f"Accumulated args chunk ({len(args_chunk)} chars): '{args_chunk[:50]}...'")
                                        else:
                                            # Different ID or no existing call - start new tool call
                                            if current_tool_call and tool_call_id and tool_call_id != tool_call_delta.id:
                                                logger.warning(f"New tool call started (ID: {tool_call_delta.id}) while previous incomplete call exists (ID: {tool_call_id}). Resetting previous call.")
                                            
                                            tool_call_id = tool_call_delta.id
                                            initial_name = tool_call_delta.function.name or ""
                                            initial_args = tool_call_delta.function.arguments or ""
                                            current_tool_call = {
                                                "name": initial_name,
                                                "arguments": initial_args
                                            }
                                            logger.info(
                                                f"Tool call started with ID {tool_call_id}: "
                                                f"name='{initial_name}' (present: {bool(tool_call_delta.function.name)}), "
                                                f"args_length={len(initial_args)}, "
                                                f"args_preview='{initial_args[:50]}...'"
                                            )
                                    elif current_tool_call and tool_call_id:
                                        # No ID in this chunk - accumulate data for existing tool call
                                        existing_name = current_tool_call.get("name", "").strip()
                                        if tool_call_delta.function.name:
                                            if not existing_name:
                                                current_tool_call["name"] = tool_call_delta.function.name
                                                logger.debug(f"Tool call name set: '{tool_call_delta.function.name}'")
                                            elif existing_name != tool_call_delta.function.name:
                                                logger.warning(f"Tool call name mismatch: existing='{existing_name}', new='{tool_call_delta.function.name}', keeping existing")
                                        
                                        # Accumulate arguments
                                        args_chunk = tool_call_delta.function.arguments or ""
                                        if args_chunk:
                                            current_tool_call["arguments"] += args_chunk
                                            logger.debug(f"Accumulated args chunk ({len(args_chunk)} chars): '{args_chunk[:50]}...'")
                        
                        # Execute tool when finish_reason is tool_calls
                        # Note: finish_reason may be set in the same chunk as the final tool_call delta,
                        # so we process tool_calls first, then check finish_reason
                        if finish_reason == "tool_calls" and current_tool_call:
                            tool_name = current_tool_call.get('name', '').strip()
                            raw_args = current_tool_call.get('arguments', '')
                            
                            logger.debug(f"Tool call complete check - name: '{tool_name}', args length: {len(raw_args)}, tool_call_id: {tool_call_id}")
                            
                            # Validate tool name exists and is not empty
                            if not tool_name:
                                # Log detailed information to help diagnose the issue
                                args_preview = raw_args[:100] if raw_args else "(empty)"
                                logger.warning(
                                    f"Tool call with empty/missing name, skipping. "
                                    f"Tool call ID: {tool_call_id}, "
                                    f"Arguments preview: '{args_preview}', "
                                    f"Arguments length: {len(raw_args) if raw_args else 0}, "
                                    f"Full raw data: {current_tool_call}"
                                )
                                current_tool_call = None
                                tool_call_id = None
                                continue
                            
                            # Validate arguments format - should be valid JSON
                            if raw_args:
                                raw_args_stripped = raw_args.strip()
                                
                                # Check if arguments are too short to be valid JSON
                                if len(raw_args_stripped) < 3:
                                    logger.warning(f"Tool call '{tool_name}' arguments too short to be valid JSON: '{raw_args}', skipping")
                                    current_tool_call = None
                                    tool_call_id = None
                                    continue
                                
                                # Check if arguments look like JSON (should start with '{' and end with '}')
                                if not raw_args_stripped.startswith('{'):
                                    logger.warning(f"Tool call '{tool_name}' arguments missing opening brace (incomplete JSON): '{raw_args[:100]}...', skipping. This may indicate missing data chunks.")
                                    current_tool_call = None
                                    tool_call_id = None
                                    continue
                                
                                if not raw_args_stripped.endswith('}'):
                                    logger.warning(f"Tool call '{tool_name}' arguments missing closing brace (incomplete JSON): '{raw_args[:100]}...', skipping. This may indicate missing data chunks.")
                                    current_tool_call = None
                                    tool_call_id = None
                                    continue
                            
                            # Parse tool arguments safely using C1-style error handling
                            tool_args = parse_tool_arguments(current_tool_call)
                            logger.debug(f"Parsed arguments for '{tool_name}': {tool_args}")
                            
                            # If parsing failed (returned empty dict) but we had arguments, they were likely incomplete or malformed
                            if not tool_args and raw_args and raw_args.strip():
                                logger.warning(f"Tool call '{tool_name}' arguments failed to parse as JSON: '{raw_args[:100]}...', skipping")
                                current_tool_call = None
                                tool_call_id = None
                                continue
                            
                            # Validate tool-specific requirements
                            if tool_name == "getImageSrc":
                                if not tool_args or not tool_args.get("altText"):
                                    logger.warning(f"getImageSrc called without altText parameter. Args: {tool_args}, Raw: '{raw_args[:50]}'")
                                    current_tool_call = None
                                    tool_call_id = None
                                    continue
                            
                            logger.info(f"Executing tool: {tool_name} with args: {tool_args}")
                            
                            # Send thinking state message
                            thinking_data = {
                                'thinking': 'Searching for images...',
                                'description': 'Finding the perfect image for your canvas.'
                            }
                            yield f"data: {json.dumps(thinking_data)}\n\n"
                            
                            try:
                                # Execute the tool
                                if tool_name == "getImageSrc":
                                    alt_text = tool_args.get("altText", "")
                                    logger.info(f"Searching for image: '{alt_text}'")
                                    
                                    image_url = await image_tool.search_image(alt_text)
                                    
                                    # Add tool result to messages
                                    messages.append({
                                        "role": "assistant",
                                        "content": None,
                                        "tool_calls": [{
                                            "id": tool_call_id,
                                            "type": "function",
                                            "function": {
                                                "name": current_tool_call["name"],
                                                "arguments": current_tool_call["arguments"]
                                            }
                                        }]
                                    })
                                    messages.append({
                                        "role": "tool",
                                        "tool_call_id": tool_call_id,
                                        "content": image_url or "No image found"
                                    })
                                    
                                    # Mark that we executed a tool call
                                    tool_call_executed = True
                                    current_tool_call = None
                                    tool_call_id = None
                                    # Break out of the inner stream loop to restart with new messages
                                    break
                                
                            except Exception as tool_error:
                                logger.error(f"Tool execution error: {tool_error}", exc_info=True)
                                # Continue without the tool result
                                current_tool_call = None
                                tool_call_id = None
                
                # After processing the stream, check if we need to continue with tool results
                # If a tool was executed, the while loop will continue and create a new stream
                # If finish_reason indicates normal completion (not tool_calls), break out of the while loop
                if tool_call_executed:
                    logger.info("Tool executed, continuing with new stream for tool result processing")
                    # Continue the while loop to process the continuation stream
                    continue
                elif last_finish_reason and last_finish_reason != "tool_calls":
                    # Normal completion (stop, length, etc.) - break out of while loop
                    logger.debug(f"Stream completed with finish_reason: {last_finish_reason}")
                    break
                elif last_finish_reason == "tool_calls" and not current_tool_call:
                    # Tool calls finished but no tool was executed (maybe validation failed)
                    logger.debug("Tool calls finished but no tool was executed")
                    break
                else:
                    # Stream ended without explicit finish_reason - assume completion
                    logger.debug("Stream ended without explicit finish_reason")
                    break
            
            yield "data: [DONE]\n\n"
            
        except Exception as e:
            logger.error(f"C1 streaming error: {e}", exc_info=True)
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

@app.post("/api/typed-note")
async def sync_typed_note(request: TypedNoteSyncRequest):
    if not request.textShapes:
        raise HTTPException(status_code=400, detail="No text shapes provided")

    try:
        text_shapes_payload = []
        chunk_texts = []
        chunk_metadata = []

        sorted_shapes = sorted(
            request.textShapes,
            key=lambda s: (s.order if s.order is not None else 0),
        )

        for index, shape in enumerate(sorted_shapes):
            text_value = (shape.text or "").strip()
            shape_payload = {
                "shape_id": shape.shapeId,
                "text": shape.text,
                "order": shape.order if shape.order is not None else index,
                "props": shape.props or {},
            }
            text_shapes_payload.append(shape_payload)

            if text_value:
                chunk_texts.append(text_value)
                chunk_metadata.append(
                    {
                        "shape_id": shape.shapeId,
                        "order": shape_payload["order"],
                        "props": shape.props or {},
                    }
                )

        note_id = storage.insert_typed_note(
            frame_id=request.frameId,
            room_id=request.roomId,
            page_bounds=request.bounds,
            text_shapes=text_shapes_payload,
            status="ready",
        )

        embeddings = []
        if chunk_texts:
            embeddings = embedding_gen.generate_embeddings(chunk_texts)

        chunks_payload = []
        for idx, text_value in enumerate(chunk_texts):
            chunks_payload.append(
                {
                    "text": text_value,
                    "chunk_index": idx,
                    "metadata": chunk_metadata[idx],
                }
            )

        storage.replace_typed_note_chunks(note_id, chunks_payload, embeddings)

        return {
            "success": True,
            "note_id": note_id,
            "frameId": request.frameId,
            "chunk_count": len(chunks_payload),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to sync typed note: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to sync typed note")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
