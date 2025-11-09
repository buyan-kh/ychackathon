"""
PDF Processing Module
Handles PDF text extraction, chunking, embedding generation, and Supabase storage
"""

import os
import uuid
from typing import List, Dict, Optional
from datetime import datetime, timezone
import pdfplumber
from openai import OpenAI
from supabase import create_client, Client
import logging

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
        # Configure client with Emergent gateway if using Emergent universal key
        if base_url:
            self.client = OpenAI(api_key=api_key, base_url=base_url)
        else:
            self.client = OpenAI(api_key=api_key)
        self.logger = logging.getLogger(__name__ + '.EmbeddingGenerator')
    
    def generate_embeddings(self, texts: List[str], batch_size: int = 100) -> List[List[float]]:
        """
        Generate embeddings for a list of texts in batches.
        Returns: List of embedding vectors
        """
        all_embeddings = []
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            self.logger.info(f"Generating embeddings for batch {i//batch_size + 1} ({len(batch)} texts)")
            
            try:
                response = self.client.embeddings.create(
                    input=batch,
                    model=self.model
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
    
    def get_public_url(self, storage_path: str) -> str:
        """Get public URL for a file in storage"""
        try:
            result = self.client.storage.from_(self.bucket_name).get_public_url(storage_path)
            return result
        except Exception as e:
            self.logger.error(f"Error getting public URL: {e}")
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
                "file_size": file_size,
                "created_at": datetime.now(timezone.utc).isoformat()
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
    
    def __init__(self, supabase_url: str, supabase_key: str, openai_key: str):
        self.extractor = PDFExtractor()
        self.chunker = TextChunker(chunk_size=1000, overlap=200)
        self.embedding_gen = EmbeddingGenerator(openai_key)
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
