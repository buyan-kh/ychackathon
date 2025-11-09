#!/usr/bin/env python3
"""
PDF RAG Pipeline - Proof of Concept
This script demonstrates the complete pipeline:
1. PDF text extraction with pdfplumber
2. Text chunking with overlap
3. Embedding generation with OpenAI
4. Storage in Supabase (Storage + pgvector)
5. Similarity search validation
"""

import os
import uuid
from typing import List, Dict, Tuple
from datetime import datetime, timezone
import pdfplumber
from openai import OpenAI
from supabase import create_client, Client
from dotenv import load_dotenv
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Initialize clients
supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
openai_client = OpenAI(api_key=OPENAI_API_KEY)


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
                    # Clean the text
                    text = self._clean_text(text)
                    page_texts[page_num + 1] = text
                    self.logger.info(f"Page {page_num + 1}: extracted {len(text)} characters")
                
                self.logger.info(f"Total pages extracted: {len(page_texts)}")
                return page_texts
                
        except Exception as e:
            self.logger.error(f"Error extracting PDF: {e}")
            raise
    
    def _clean_text(self, text: str) -> str:
        """Clean extracted text by removing excessive whitespace"""
        # Replace multiple spaces with single space
        text = " ".join(text.split())
        # Remove common PDF artifacts
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
    
    def __init__(self, model: str = "text-embedding-3-small"):
        self.model = model
        self.client = openai_client
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
                
                # Extract embeddings in order
                batch_embeddings = [item.embedding for item in sorted(response.data, key=lambda x: x.index)]
                all_embeddings.extend(batch_embeddings)
                
                self.logger.info(f"Generated {len(batch_embeddings)} embeddings, tokens used: {response.usage.total_tokens}")
                
            except Exception as e:
                self.logger.error(f"Error generating embeddings: {e}")
                raise
        
        return all_embeddings


class SupabaseRAGStorage:
    """Handle storage of PDFs and embeddings in Supabase"""
    
    def __init__(self):
        self.client = supabase
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
    
    def insert_document(self, filename: str, storage_path: str, page_count: int) -> str:
        """
        Insert document metadata into pdf_documents table.
        Returns: Document ID
        """
        try:
            data = {
                "filename": filename,
                "storage_path": storage_path,
                "page_count": page_count,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            response = self.client.table("pdf_documents").insert(data).execute()
            doc_id = response.data[0]["id"]
            
            self.logger.info(f"Inserted document with ID: {doc_id}")
            return doc_id
            
        except Exception as e:
            self.logger.error(f"Error inserting document: {e}")
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
                self.logger.info(f"Inserted batch {i//batch_size + 1}: {len(batch)} chunks")
            
            self.logger.info(f"Total chunks inserted: {total_inserted}")
            return total_inserted
            
        except Exception as e:
            self.logger.error(f"Error inserting chunks: {e}")
            raise
    
    def similarity_search(self, query_embedding: List[float], limit: int = 5, threshold: float = 0.7) -> List[Dict]:
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
                    "match_count": limit
                }
            ).execute()
            
            results = response.data
            self.logger.info(f"Found {len(results)} similar chunks")
            
            for i, result in enumerate(results, 1):
                self.logger.info(f"Result {i}: Page {result['page_number']}, Similarity: {result['similarity']:.4f}")
                self.logger.info(f"  Text preview: {result['chunk_text'][:100]}...")
            
            return results
            
        except Exception as e:
            self.logger.error(f"Error in similarity search: {e}")
            raise


def run_poc_pipeline(pdf_path: str):
    """
    Run the complete POC pipeline from PDF to searchable embeddings.
    """
    logger.info("=" * 80)
    logger.info("STARTING PDF RAG PIPELINE POC")
    logger.info("=" * 80)
    
    # Step 1: Extract text from PDF
    logger.info("\nStep 1: Extracting text from PDF...")
    extractor = PDFExtractor()
    page_texts = extractor.extract_text_by_page(pdf_path)
    
    # Step 2: Chunk the text
    logger.info("\nStep 2: Chunking text...")
    chunker = TextChunker(chunk_size=1000, overlap=200)
    all_chunks = []
    
    for page_num, text in page_texts.items():
        page_chunks = chunker.chunk_text(text, page_num)
        all_chunks.extend(page_chunks)
        logger.info(f"Page {page_num}: created {len(page_chunks)} chunks")
    
    logger.info(f"Total chunks created: {len(all_chunks)}")
    
    # Step 3: Generate embeddings
    logger.info("\nStep 3: Generating embeddings...")
    embedding_gen = EmbeddingGenerator()
    chunk_texts = [chunk['text'] for chunk in all_chunks]
    embeddings = embedding_gen.generate_embeddings(chunk_texts)
    
    # Step 4: Upload to Supabase
    logger.info("\nStep 4: Uploading to Supabase...")
    storage = SupabaseRAGStorage()
    
    # Upload PDF file
    filename = os.path.basename(pdf_path)
    storage_path = storage.upload_pdf_file(pdf_path, filename)
    
    # Insert document metadata
    document_id = storage.insert_document(filename, storage_path, len(page_texts))
    
    # Insert chunks with embeddings
    chunks_inserted = storage.insert_chunks(document_id, all_chunks, embeddings)
    
    # Step 5: Test similarity search
    logger.info("\nStep 5: Testing similarity search...")
    test_query = "What is the main topic of this document?"
    logger.info(f"Query: {test_query}")
    
    # Generate embedding for query
    query_embedding = embedding_gen.generate_embeddings([test_query])[0]
    
    # Search
    results = storage.similarity_search(query_embedding, limit=3, threshold=0.5)
    
    logger.info("=" * 80)
    logger.info("POC PIPELINE COMPLETED SUCCESSFULLY!")
    logger.info("=" * 80)
    logger.info(f"\nSummary:")
    logger.info(f"- Document ID: {document_id}")
    logger.info(f"- Pages processed: {len(page_texts)}")
    logger.info(f"- Chunks created: {len(all_chunks)}")
    logger.info(f"- Embeddings generated: {len(embeddings)}")
    logger.info(f"- Chunks stored: {chunks_inserted}")
    logger.info(f"- Similar chunks found: {len(results)}")
    
    return document_id, results


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python poc_pdf_rag_pipeline.py <path_to_pdf_file>")
        print("\nExample:")
        print("  python poc_pdf_rag_pipeline.py sample.pdf")
        sys.exit(1)
    
    pdf_file = sys.argv[1]
    
    if not os.path.exists(pdf_file):
        print(f"Error: File not found: {pdf_file}")
        sys.exit(1)
    
    if not pdf_file.lower().endswith('.pdf'):
        print("Error: File must be a PDF")
        sys.exit(1)
    
    try:
        document_id, search_results = run_poc_pipeline(pdf_file)
        print("\n✓ Pipeline completed successfully!")
        print(f"✓ Document ID: {document_id}")
        print(f"✓ Found {len(search_results)} relevant chunks")
        
    except Exception as e:
        logger.error(f"Pipeline failed: {e}", exc_info=True)
        sys.exit(1)
