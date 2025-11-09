"""
PDF Processing Module
Handles PDF text extraction, chunking, embedding generation, and Supabase storage
"""

import os
import uuid
from io import BytesIO
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timezone
import tempfile
import pdfplumber
from openai import OpenAI
from supabase import create_client, Client
# from emergentintegrations.llm.utils import get_integration_proxy_url
import logging
from PIL import Image, ImageEnhance, ImageFilter
import pytesseract
from pytesseract import Output
from postgrest import APIError

logger = logging.getLogger(__name__)


class PDFExtractor:
    """Extract text from PDF files using pdfplumber"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__ + '.PDFExtractor')
    
    def extract_text_by_page(self, pdf_path: str) -> Dict[int, str]:
        """
        Extract text from PDF, organized by page number.
        Returns: Dict with page numbers as keys and extracted text as values
        """
        self.logger.info(f"Extracting text from: {pdf_path}")
        page_texts = {}
        
        try:
            with pdfplumber.open(pdf_path) as pdf:
                for page_num, page in enumerate(pdf.pages):
                    text = page.extract_text() or ""
                    text = self._clean_text(text)
                    page_texts[page_num + 1] = text
                    self.logger.debug(f"Page {page_num + 1}: extracted {len(text)} characters")
                
                self.logger.info(f"Total pages extracted: {len(page_texts)}")
                return page_texts
                
        except Exception as e:
            self.logger.error(f"Error extracting PDF: {e}")
            raise
    
    def _clean_text(self, text: str) -> str:
        """Clean extracted text by removing excessive whitespace"""
        text = " ".join(text.split())
        text = text.replace("\x00", "")
        text = text.replace("\ufffd", "")
        return text.strip()


class TextChunker:
    """Chunk text into overlapping segments for embedding"""
    
    def __init__(self, chunk_size: int = 1000, overlap: int = 200):
        self.chunk_size = chunk_size
        self.overlap = overlap
        self.logger = logging.getLogger(__name__ + '.TextChunker')
    
    def chunk_text(self, text: str, page_number: int) -> List[Dict]:
        """
        Split text into overlapping chunks with metadata.
        Returns: List of dicts with chunk text and metadata
        """
        chunks = []
        start = 0
        chunk_index = 0
        
        while start < len(text):
            end = start + self.chunk_size
            chunk_text = text[start:end]
            
            # Only include chunks that have meaningful content
            if len(chunk_text.strip()) > 50:
                chunks.append({
                    'text': chunk_text,
                    'page_number': page_number,
                    'chunk_index': chunk_index,
                    'char_start': start,
                    'char_end': end
                })
                chunk_index += 1
            
            start += (self.chunk_size - self.overlap)
        
        return chunks


class EmbeddingGenerator:
    """Generate embeddings using OpenAI API"""
    
    def __init__(self, api_key: str, model: str = "text-embedding-3-small", base_url: str = None):
        self.model = model
        self.api_key = api_key
        self.logger = logging.getLogger(__name__ + '.EmbeddingGenerator')
        
        # Initialize OpenAI client (direct to OpenAI API)
        self.client = OpenAI(api_key=api_key)
        self.logger.info(f"Initialized with OpenAI API for embeddings")
    
    def generate_embeddings(self, texts: List[str], batch_size: int = 100) -> List[List[float]]:
        """
        Generate embeddings for a list of texts in batches using OpenAI via Emergent proxy.
        Returns: List of embedding vectors
        """
        all_embeddings = []
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            self.logger.info(f"Generating embeddings for batch {i//batch_size + 1} ({len(batch)} texts)")
            
            try:
                response = self.client.embeddings.create(
                    model=self.model,
                    input=batch
                )
                
                batch_embeddings = [item.embedding for item in sorted(response.data, key=lambda x: x.index)]
                all_embeddings.extend(batch_embeddings)
                
                self.logger.info(f"Generated {len(batch_embeddings)} embeddings, tokens used: {response.usage.total_tokens}")
                
            except Exception as e:
                self.logger.error(f"Error generating embeddings: {e}")
                raise
        
        return all_embeddings


class SupabaseRAGStorage:
    """Handle storage of PDFs and embeddings in Supabase"""
    
    def __init__(self, supabase_url: str, supabase_key: str):
        self.client: Client = create_client(supabase_url, supabase_key)
        self.bucket_name = "pdfs"
        self.handwriting_bucket = os.getenv("HANDWRITING_BUCKET", "handwriting")
        self.logger = logging.getLogger(__name__ + '.SupabaseRAGStorage')
    
    def upload_pdf_file(self, file_path: str, filename: str) -> str:
        """
        Upload PDF file to Supabase Storage.
        Returns: Storage path of uploaded file
        """
        storage_path = f"{uuid.uuid4()}/{filename}"
        
        try:
            with open(file_path, 'rb') as f:
                self.client.storage.from_(self.bucket_name).upload(
                    path=storage_path,
                    file=f,
                    file_options={"content-type": "application/pdf"}
                )
            
            self.logger.info(f"Uploaded PDF to: {storage_path}")
            return storage_path
            
        except Exception as e:
            self.logger.error(f"Error uploading PDF: {e}")
            raise
    
    def upload_handwriting_image(
        self,
        image_bytes: bytes,
        filename: str,
        content_type: str = "image/png",
    ) -> str:
        """
        Upload handwriting snapshot to Supabase Storage.
        Returns: Storage path of uploaded file
        """
        storage_path = f"{uuid.uuid4()}/{filename}"

        tmp_file = tempfile.NamedTemporaryFile(delete=False)
        try:
            tmp_file.write(image_bytes)
            tmp_file.flush()
            tmp_file.close()

            with open(tmp_file.name, 'rb') as f:
                self.client.storage.from_(self.handwriting_bucket).upload(
                    path=storage_path,
                    file=f,
                    file_options={"content-type": content_type}
                )
            self.logger.info(f"Uploaded handwriting image to: {storage_path}")
            return storage_path
        except Exception as e:
            self.logger.error(f"Error uploading handwriting image: {e}")
            raise
        finally:
            try:
                os.unlink(tmp_file.name)
            except OSError:
                pass

    def get_public_url(self, storage_path: str, bucket: Optional[str] = None) -> str:
        """Get public URL for a file in storage"""
        target_bucket = bucket or self.bucket_name
        try:
            result = self.client.storage.from_(target_bucket).get_public_url(storage_path)
            return result
        except Exception as e:
            self.logger.error(f"Error getting public URL: {e}")
            raise

    def insert_handwriting_note(
        self,
        frame_id: str,
        storage_path: str,
        room_id: Optional[str],
        stroke_ids: Optional[List[str]],
        page_bounds: Optional[Dict],
        group_id: Optional[str],
        metadata: Optional[Dict] = None,
        status: str = "pending"
    ) -> str:
        """
        Insert handwriting note metadata.
        """
        base_metadata = metadata.copy() if metadata else {}
        if stroke_ids is not None:
            base_metadata["stroke_ids"] = stroke_ids
        if page_bounds is not None:
            base_metadata["page_bounds"] = page_bounds
        if group_id is not None:
            base_metadata["group_id"] = group_id

        payload = {
            "frame_id": frame_id,
            "storage_path": storage_path,
            "room_id": room_id,
            "status": status,
            "metadata": base_metadata,
        }

        if stroke_ids is not None:
            payload["stroke_ids"] = stroke_ids
        if page_bounds is not None:
            payload["page_bounds"] = page_bounds
        if group_id is not None:
            payload["group_id"] = group_id

        try:
            response = self.client.table("handwriting_notes").insert(payload).execute()
            note_id = response.data[0]["id"]
            self.logger.info(f"Inserted handwriting note {note_id} for frame {frame_id}")
            return note_id
        except APIError as e:
            # Supabase schema might not yet have optional columns; fall back to metadata-only insert.
            error_message = getattr(e, "message", str(e))
            if e.code == "PGRST204" or "schema cache" in error_message.lower():
                self.logger.warning(
                    "Handwriting notes table missing optional columns, falling back to metadata-only insert: %s",
                    e,
                )
                safe_payload = {
                    "frame_id": frame_id,
                    "storage_path": storage_path,
                    "room_id": room_id,
                    "status": status,
                    "metadata": base_metadata,
                }
                response = self.client.table("handwriting_notes").insert(safe_payload).execute()
                note_id = response.data[0]["id"]
                self.logger.info(
                    "Inserted handwriting note %s without optional columns (frame %s)",
                    note_id,
                    frame_id,
                )
                return note_id
            self.logger.error(f"Error inserting handwriting note: {e}", exc_info=True)
            raise
        except Exception as e:
            self.logger.error(f"Error inserting handwriting note: {e}", exc_info=True)
            raise

    def update_handwriting_note(self, note_id: str, updates: Dict) -> None:
        """Update handwriting note record."""
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        try:
            self.client.table("handwriting_notes").update(updates).eq("id", note_id).execute()
            self.logger.debug(f"Updated handwriting note {note_id} with {list(updates.keys())}")
        except Exception as e:
            self.logger.error(f"Error updating handwriting note {note_id}: {e}", exc_info=True)
            raise

    def insert_handwriting_chunks(self, note_id: str, chunks: List[Dict], embeddings: List[List[float]]) -> int:
        """
        Insert OCR chunks with embeddings into handwriting_chunks table.
        """
        if not chunks or not embeddings:
            return 0

        rows = []
        for chunk, embedding in zip(chunks, embeddings):
            rows.append({
                "note_id": note_id,
                "chunk_index": chunk["chunk_index"],
                "chunk_text": chunk["text"],
                "embedding": embedding,
                "metadata": {
                    "char_start": chunk["char_start"],
                    "char_end": chunk["char_end"],
                    **chunk.get("metadata", {})
                }
            })

        try:
            batch_size = 50
            total_inserted = 0
            for i in range(0, len(rows), batch_size):
                batch = rows[i:i + batch_size]
                self.client.table("handwriting_chunks").insert(batch).execute()
                total_inserted += len(batch)
            self.logger.info(f"Inserted {total_inserted} handwriting chunks for note {note_id}")
            return total_inserted
        except Exception as e:
            self.logger.error(f"Error inserting handwriting chunks: {e}", exc_info=True)
            raise

    def insert_document(self, filename: str, storage_path: str, page_count: int, file_size: int) -> str:
        """
        Insert document metadata into pdf_documents table.
        Returns: Document ID
        """
        try:
            data = {
                "filename": filename,
                "storage_path": storage_path,
                "page_count": page_count,
                "file_size": file_size
            }

            response = self.client.table("pdf_documents").insert(data).execute()
            doc_id = response.data[0]["id"]
            
            self.logger.info(f"Inserted document with ID: {doc_id}")
            return doc_id
            
        except Exception as e:
            self.logger.error(f"Error inserting document: {e}")
            raise
    
    def get_document(self, document_id: str) -> Optional[Dict]:
        """Get document metadata by ID"""
        try:
            response = self.client.table("pdf_documents").select("*").eq("id", document_id).execute()
            if response.data:
                return response.data[0]
            return None
        except Exception as e:
            self.logger.error(f"Error getting document: {e}")
            raise
    
    def list_documents(self, limit: int = 50, offset: int = 0) -> List[Dict]:
        """List all documents with pagination"""
        try:
            response = self.client.table("pdf_documents").select("*").order("created_at", desc=True).range(offset, offset + limit - 1).execute()
            return response.data
        except Exception as e:
            self.logger.error(f"Error listing documents: {e}")
            raise
    
    def insert_chunks(self, document_id: str, chunks: List[Dict], embeddings: List[List[float]]) -> int:
        """
        Insert chunks with embeddings into pdf_chunks table.
        Returns: Number of chunks inserted
        """
        try:
            rows = []
            for chunk, embedding in zip(chunks, embeddings):
                row = {
                    "document_id": document_id,
                    "page_number": chunk['page_number'],
                    "chunk_index": chunk['chunk_index'],
                    "chunk_text": chunk['text'],
                    "embedding": embedding,
                    "metadata": {
                        "char_start": chunk['char_start'],
                        "char_end": chunk['char_end'],
                        "text_length": len(chunk['text'])
                    }
                }
                rows.append(row)
            
            # Insert in batches to avoid payload size limits
            batch_size = 50
            total_inserted = 0
            
            for i in range(0, len(rows), batch_size):
                batch = rows[i:i + batch_size]
                self.client.table("pdf_chunks").insert(batch).execute()
                total_inserted += len(batch)
                self.logger.debug(f"Inserted batch {i//batch_size + 1}: {len(batch)} chunks")
            
            self.logger.info(f"Total chunks inserted: {total_inserted}")
            return total_inserted
            
        except Exception as e:
            self.logger.error(f"Error inserting chunks: {e}")
            raise

    def upsert_pdf_canvas_link(
        self,
        shape_id: str,
        document_id: str,
        room_id: Optional[str] = None,
        metadata: Optional[Dict] = None,
    ) -> Dict:
        """
        Link a canvas shape to a PDF document for provenance.
        """
        payload = {
            "shape_id": shape_id,
            "document_id": document_id,
            "room_id": room_id,
            "metadata": metadata or {},
        }
        try:
            response = self.client.table("pdf_canvas_links").upsert(
                payload,
                on_conflict="shape_id",
                returning='representation'
            ).execute()
            link = response.data[0]
            self.logger.info("Linked PDF shape %s -> document %s", shape_id, document_id)
            return link
        except Exception as e:
            self.logger.error("Failed to upsert pdf_canvas_link: %s", e, exc_info=True)
            raise

    def delete_pdf_canvas_link(self, shape_id: str) -> None:
        """Remove a canvas link if the shape is deleted."""
        try:
            self.client.table("pdf_canvas_links").delete().eq("shape_id", shape_id).execute()
        except Exception as e:
            self.logger.error("Failed to delete pdf_canvas_link: %s", e, exc_info=True)
            raise

    def _get_handwriting_notes(self, frame_ids: List[str]) -> List[Dict]:
        if not frame_ids:
            return []
        try:
            notes_resp = (
                self.client.table("handwriting_notes")
                .select("id,frame_id,metadata")
                .in_("frame_id", frame_ids)
                .execute()
            )
            return notes_resp.data or []
        except Exception as e:
            self.logger.error("Failed to fetch handwriting context: %s", e, exc_info=True)
            return []

    def get_handwriting_context_for_frames(
        self,
        frame_ids: List[str],
        chunk_limit_per_note: int = 3,
    ) -> List[Dict]:
        notes = self._get_handwriting_notes(frame_ids)
        if not notes:
            return []

        contexts: List[Dict] = []
        for note in notes:
            try:
                chunks_resp = (
                    self.client.table("handwriting_chunks")
                    .select("id,chunk_text,chunk_index,metadata")
                    .eq("note_id", note["id"])
                    .order("chunk_index")
                    .limit(chunk_limit_per_note)
                    .execute()
                )
            except Exception as e:
                self.logger.error("Failed to fetch handwriting chunks: %s", e, exc_info=True)
                continue

            for chunk in chunks_resp.data or []:
                contexts.append(
                    {
                        "source_type": "handwriting",
                        "frame_id": note["frame_id"],
                        "note_id": note["id"],
                        "chunk_id": chunk["id"],
                        "text": chunk.get("chunk_text", ""),
                        "metadata": chunk.get("metadata") or {},
                        "chunk_index": chunk.get("chunk_index"),
                    }
                )
        return contexts

    def get_pdf_links(self, shape_ids: List[str]) -> List[Dict]:
        if not shape_ids:
            return []
        try:
            links_resp = (
                self.client.table("pdf_canvas_links")
                .select("shape_id,document_id,metadata")
                .in_("shape_id", shape_ids)
                .execute()
            )
            return links_resp.data or []
        except Exception as e:
            self.logger.error("Failed to fetch pdf links: %s", e, exc_info=True)
            return []

    def get_pdf_context_for_shapes(
        self,
        shape_ids: List[str],
        chunk_limit_per_document: int = 3,
    ) -> List[Dict]:
        links = self.get_pdf_links(shape_ids)
        if not links:
            return []

        doc_ids = list({link["document_id"] for link in links})
        docs_lookup: Dict[str, Dict] = {}
        if doc_ids:
            try:
                docs_resp = (
                    self.client.table("pdf_documents")
                    .select("id,filename")
                    .in_("id", doc_ids)
                    .execute()
                )
                for doc in docs_resp.data or []:
                    docs_lookup[doc["id"]] = doc
            except Exception as e:
                self.logger.error("Failed to fetch pdf documents: %s", e, exc_info=True)

        contexts: List[Dict] = []
        for link in links:
            document_id = link["document_id"]
            shape_id = link["shape_id"]
            try:
                chunks_resp = (
                    self.client.table("pdf_chunks")
                    .select("id,chunk_text,page_number,metadata")
                    .eq("document_id", document_id)
                    .order("page_number")
                    .limit(chunk_limit_per_document)
                    .execute()
                )
            except Exception as e:
                self.logger.error("Failed to fetch pdf chunks: %s", e, exc_info=True)
                continue

            for chunk in chunks_resp.data or []:
                contexts.append(
                    {
                        "source_type": "pdf",
                        "shape_id": shape_id,
                        "document_id": document_id,
                        "chunk_id": chunk["id"],
                        "text": chunk.get("chunk_text", ""),
                        "metadata": chunk.get("metadata") or {},
                        "page_number": chunk.get("page_number"),
                        "filename": docs_lookup.get(document_id, {}).get("filename"),
                    }
                )
        return contexts

    def get_context_for_shape_ids(
        self,
        shape_ids: List[str],
        handwriting_limit_per_note: int = 3,
        pdf_limit_per_document: int = 3,
    ) -> List[Dict]:
        contexts: List[Dict] = []
        contexts.extend(
            self.get_handwriting_context_for_frames(shape_ids, chunk_limit_per_note=handwriting_limit_per_note)
        )
        contexts.extend(
            self.get_pdf_context_for_shapes(shape_ids, chunk_limit_per_document=pdf_limit_per_document)
        )
        return contexts

    def search_handwriting_context(
        self,
        frame_ids: List[str],
        query_embedding: List[float],
        limit_per_note: int = 5,
        threshold: float = 0.2,
    ) -> List[Dict]:
        notes = self._get_handwriting_notes(frame_ids)
        if not notes:
            return []

        matches: List[Dict] = []
        for note in notes:
            try:
                resp = self.client.rpc(
                    "match_handwriting_chunks",
                    {
                        "query_embedding": query_embedding,
                        "match_threshold": threshold,
                        "match_count": limit_per_note,
                        "filter_note_id": note["id"],
                    },
                ).execute()
            except Exception as e:
                self.logger.error("Handwriting match RPC failed: %s", e, exc_info=True)
                continue

            for row in resp.data or []:
                matches.append(
                    {
                        "source_type": "handwriting",
                        "frame_id": note["frame_id"],
                        "note_id": note["id"],
                        "chunk_id": row["id"],
                        "text": row.get("chunk_text", ""),
                        "metadata": row.get("metadata") or {},
                        "similarity": row.get("similarity"),
                    }
                )
        return matches

    def search_pdf_context(
        self,
        shape_ids: List[str],
        query_embedding: List[float],
        limit_per_document: int = 5,
        threshold: float = 0.2,
    ) -> List[Dict]:
        links = self.get_pdf_links(shape_ids)
        if not links:
            return []

        doc_lookup: Dict[str, Dict] = {}
        doc_ids = list({link["document_id"] for link in links})
        if doc_ids:
            try:
                docs_resp = (
                    self.client.table("pdf_documents")
                    .select("id,filename")
                    .in_("id", doc_ids)
                    .execute()
                )
                for doc in docs_resp.data or []:
                    doc_lookup[doc["id"]] = doc
            except Exception as e:
                self.logger.error("Failed to fetch pdf documents: %s", e, exc_info=True)

        matches: List[Dict] = []
        for link in links:
            try:
                resp = self.client.rpc(
                    "match_pdf_chunks",
                    {
                        "query_embedding": query_embedding,
                        "match_threshold": threshold,
                        "match_count": limit_per_document,
                        "filter_document_id": link["document_id"],
                    },
                ).execute()
            except Exception as e:
                self.logger.error("PDF match RPC failed: %s", e, exc_info=True)
                continue

            for row in resp.data or []:
                matches.append(
                    {
                        "source_type": "pdf",
                        "shape_id": link["shape_id"],
                        "document_id": link["document_id"],
                        "chunk_id": row["id"],
                        "text": row.get("chunk_text", ""),
                        "metadata": row.get("metadata") or {},
                        "page_number": row.get("page_number"),
                        "filename": doc_lookup.get(link["document_id"], {}).get("filename"),
                        "similarity": row.get("similarity"),
                    }
                )
        return matches

    def search_context_for_shape_ids(
        self,
        shape_ids: List[str],
        query_embedding: List[float],
        handwriting_limit_per_note: int = 5,
        pdf_limit_per_document: int = 5,
        threshold: float = 0.2,
    ) -> List[Dict]:
        matches: List[Dict] = []
        matches.extend(
            self.search_handwriting_context(
                shape_ids, query_embedding, limit_per_note=handwriting_limit_per_note, threshold=threshold
            )
        )
        matches.extend(
            self.search_pdf_context(
                shape_ids, query_embedding, limit_per_document=pdf_limit_per_document, threshold=threshold
            )
        )
        # sort by similarity descending if available
        matches.sort(key=lambda x: x.get("similarity", 0), reverse=True)
        return matches
    
    def similarity_search(
        self, 
        query_embedding: List[float], 
        limit: int = 5, 
        threshold: float = 0.7,
        document_id: Optional[str] = None
    ) -> List[Dict]:
        """
        Perform similarity search using the match_pdf_chunks function.
        Returns: List of matching chunks with similarity scores
        """
        try:
            response = self.client.rpc(
                "match_pdf_chunks",
                {
                    "query_embedding": query_embedding,
                    "match_threshold": threshold,
                    "match_count": limit,
                    "filter_document_id": document_id
                }
            ).execute()
            
            results = response.data
            self.logger.info(f"Found {len(results)} similar chunks")
            return results
            
        except Exception as e:
            self.logger.error(f"Error in similarity search: {e}")
            raise


class PDFProcessor:
    """Main class coordinating the entire PDF processing pipeline"""
    
    def __init__(self, supabase_url: str, supabase_key: str, openai_key: str, openai_base_url: str = None):
        self.extractor = PDFExtractor()
        self.chunker = TextChunker(chunk_size=1000, overlap=200)
        self.embedding_gen = EmbeddingGenerator(openai_key, base_url=openai_base_url)
        self.storage = SupabaseRAGStorage(supabase_url, supabase_key)
        self.logger = logging.getLogger(__name__ + '.PDFProcessor')
    
    async def process_pdf(self, pdf_path: str, filename: str) -> Dict:
        """
        Process a PDF file through the complete pipeline.
        Returns: Dictionary with document_id, stats, and public_url
        """
        try:
            # Get file size
            file_size = os.path.getsize(pdf_path)
            
            # Step 1: Extract text
            self.logger.info("Step 1: Extracting text from PDF...")
            page_texts = self.extractor.extract_text_by_page(pdf_path)
            
            # Step 2: Chunk text
            self.logger.info("Step 2: Chunking text...")
            all_chunks = []
            for page_num, text in page_texts.items():
                page_chunks = self.chunker.chunk_text(text, page_num)
                all_chunks.extend(page_chunks)
            
            self.logger.info(f"Created {len(all_chunks)} chunks from {len(page_texts)} pages")
            
            # Step 3: Generate embeddings
            self.logger.info("Step 3: Generating embeddings...")
            chunk_texts = [chunk['text'] for chunk in all_chunks]
            embeddings = self.embedding_gen.generate_embeddings(chunk_texts)
            
            # Step 4: Upload to Supabase
            self.logger.info("Step 4: Uploading to Supabase...")
            storage_path = self.storage.upload_pdf_file(pdf_path, filename)
            public_url = self.storage.get_public_url(storage_path)
            
            # Insert document metadata
            document_id = self.storage.insert_document(filename, storage_path, len(page_texts), file_size)
            
            # Insert chunks with embeddings
            chunks_inserted = self.storage.insert_chunks(document_id, all_chunks, embeddings)
            
            self.logger.info("PDF processing completed successfully")
            
            return {
                "document_id": document_id,
                "filename": filename,
                "page_count": len(page_texts),
                "chunk_count": chunks_inserted,
                "file_size": file_size,
                "public_url": public_url,
                "status": "success"
            }
            
        except Exception as e:
            self.logger.error(f"PDF processing failed: {e}", exc_info=True)
            raise


class HandwritingProcessor:
    """Process handwriting snapshots: OCR + embeddings + Supabase persistence"""

    def __init__(self, storage: SupabaseRAGStorage, embedding_gen: EmbeddingGenerator, chunk_size: int = 400, overlap: int = 80):
        self.storage = storage
        self.embedding_gen = embedding_gen
        self.chunk_size = chunk_size
        self.overlap = overlap
        self.logger = logging.getLogger(__name__ + '.HandwritingProcessor')

    def process_note(self, note_id: str, image_bytes: bytes) -> None:
        """Run OCR + embedding generation for a handwriting note"""
        try:
            self.logger.info(f"Processing handwriting note {note_id}")
            ocr_text, ocr_metadata = self._perform_ocr(image_bytes)

            if not ocr_text.strip():
                self.storage.update_handwriting_note(note_id, {
                    "status": "no_text",
                    "ocr_text": "",
                    "metadata": {**ocr_metadata, "message": "No text found by OCR"}
                })
                self.logger.warning(f"No OCR text extracted for note {note_id}")
                return

            chunks = self._chunk_text(ocr_text)
            chunk_texts = [chunk["text"] for chunk in chunks]
            embeddings = self.embedding_gen.generate_embeddings(chunk_texts)
            inserted = self.storage.insert_handwriting_chunks(note_id, chunks, embeddings)

            self.storage.update_handwriting_note(note_id, {
                "status": "processed",
                "ocr_text": ocr_text,
                "metadata": {**ocr_metadata, "chunk_count": inserted}
            })

            self.logger.info(f"Handwriting note {note_id} processed successfully")

        except Exception as e:
            self.logger.error(f"Failed to process handwriting note {note_id}: {e}", exc_info=True)
            try:
                self.storage.update_handwriting_note(note_id, {
                    "status": "failed",
                    "metadata": {"error": str(e)}
                })
            except Exception:
                pass

    def _perform_ocr(self, image_bytes: bytes) -> Tuple[str, Dict]:
        """Extract text via pytesseract with light preprocessing"""
        image = Image.open(BytesIO(image_bytes))
        grayscale = image.convert("L")
        enhanced = ImageEnhance.Contrast(grayscale).enhance(2.0)
        filtered = enhanced.filter(ImageFilter.MedianFilter(size=3))

        try:
            text = pytesseract.image_to_string(filtered)
        except pytesseract.TesseractNotFoundError as e:
            raise RuntimeError("Tesseract OCR binary is not installed") from e
        text = text.replace("\x0c", "").strip()

        ocr_data = {}
        try:
            data = pytesseract.image_to_data(filtered, output_type=Output.DICT)
            confidences = [float(conf) for conf in data.get("conf", []) if conf not in ("-1", "")]
            if confidences:
                avg_conf = sum(confidences) / len(confidences)
                ocr_data["avg_confidence"] = avg_conf
                ocr_data["word_count"] = len(confidences)
        except Exception as e:
            self.logger.warning(f"Failed to capture OCR metadata: {e}")

        return text, ocr_data

    def _chunk_text(self, text: str) -> List[Dict]:
        """Chunk OCR text to improve embedding recall"""
        normalized = " ".join(text.split())
        if not normalized:
            return []

        chunks = []
        start = 0
        index = 0
        while start < len(normalized):
            end = min(len(normalized), start + self.chunk_size)
            chunk_text = normalized[start:end]
            if chunk_text.strip():
                chunks.append({
                    "chunk_index": index,
                    "text": chunk_text,
                    "char_start": start,
                    "char_end": end,
                })
                index += 1
            if end == len(normalized):
                break
            next_start = max(0, end - self.overlap)
            if next_start <= start:
                next_start = end
            start = next_start

        return chunks if chunks else [{
            "chunk_index": 0,
            "text": normalized,
            "char_start": 0,
            "char_end": len(normalized),
        }]
