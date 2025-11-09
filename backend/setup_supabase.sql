-- Supabase Setup Script for PDF RAG System
-- Run this script in your Supabase SQL Editor

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create pdf_documents table to store document metadata
CREATE TABLE IF NOT EXISTS pdf_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    page_count INTEGER,
    file_size INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create pdf_chunks table to store text chunks with embeddings
CREATE TABLE IF NOT EXISTS pdf_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES pdf_documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding VECTOR(1536),  -- For text-embedding-3-small (1536 dimensions)
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pdf_chunks_document_id ON pdf_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_pdf_chunks_page_number ON pdf_chunks(page_number);

-- Create HNSW index for fast vector similarity search
CREATE INDEX IF NOT EXISTS idx_pdf_chunks_embedding ON pdf_chunks 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Create function for similarity search
CREATE OR REPLACE FUNCTION match_pdf_chunks(
    query_embedding VECTOR(1536),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 10,
    filter_document_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    chunk_text TEXT,
    page_number INTEGER,
    similarity FLOAT,
    metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        pdf_chunks.id,
        pdf_chunks.document_id,
        pdf_chunks.chunk_text,
        pdf_chunks.page_number,
        1 - (pdf_chunks.embedding <=> query_embedding) AS similarity,
        pdf_chunks.metadata
    FROM pdf_chunks
    WHERE 
        (filter_document_id IS NULL OR pdf_chunks.document_id = filter_document_id)
        AND 1 - (pdf_chunks.embedding <=> query_embedding) > match_threshold
    ORDER BY pdf_chunks.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Create function to get document statistics
CREATE OR REPLACE FUNCTION get_document_stats(doc_id UUID)
RETURNS TABLE (
    document_id UUID,
    filename TEXT,
    total_chunks INTEGER,
    total_pages INTEGER,
    created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
AS $$
    SELECT 
        d.id AS document_id,
        d.filename,
        COUNT(c.id)::INTEGER AS total_chunks,
        d.page_count AS total_pages,
        d.created_at
    FROM pdf_documents d
    LEFT JOIN pdf_chunks c ON d.id = c.document_id
    WHERE d.id = doc_id
    GROUP BY d.id, d.filename, d.page_count, d.created_at;
$$;

-- Create storage bucket for PDFs (this may require running separately via Supabase UI or API)
-- Go to Storage > Create a new bucket named 'pdfs'
-- Set it to public or private based on your needs
-- For this script, we'll document the manual step
-- Bucket name: pdfs
-- Public: false (use signed URLs for access)
-- File size limit: 50MB
-- Allowed MIME types: application/pdf

-- Grant permissions (adjust based on your auth setup)
-- For service role access (backend), permissions are automatically granted
-- For RLS (Row Level Security), add policies as needed

-- Example RLS policies (optional, for multi-tenant scenarios)
-- ALTER TABLE pdf_documents ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE pdf_chunks ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to read their own documents
-- CREATE POLICY "Users can view their own documents"
-- ON pdf_documents FOR SELECT
-- USING (auth.uid() = user_id);  -- Add user_id column if needed

COMMENT ON TABLE pdf_documents IS 'Stores metadata for uploaded PDF documents';
COMMENT ON TABLE pdf_chunks IS 'Stores text chunks and embeddings from PDF documents';
COMMENT ON FUNCTION match_pdf_chunks IS 'Performs semantic similarity search on PDF chunks';
COMMENT ON FUNCTION get_document_stats IS 'Returns statistics for a specific document';

-- Link PDF canvas shapes to stored documents
CREATE TABLE IF NOT EXISTS pdf_canvas_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shape_id TEXT UNIQUE NOT NULL,
    document_id UUID NOT NULL REFERENCES pdf_documents(id) ON DELETE CASCADE,
    room_id TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdf_canvas_links_shape_id ON pdf_canvas_links(shape_id);
CREATE INDEX IF NOT EXISTS idx_pdf_canvas_links_document_id ON pdf_canvas_links(document_id);

COMMENT ON TABLE pdf_canvas_links IS 'Maps canvas PDF shapes to Supabase documents';

-- Handwriting notes tables
CREATE TABLE IF NOT EXISTS handwriting_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    frame_id TEXT UNIQUE NOT NULL,
    room_id TEXT,
    storage_path TEXT NOT NULL,
    stroke_ids TEXT[],
    page_bounds JSONB,
    group_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    ocr_text TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS handwriting_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES handwriting_notes(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    chunk_text TEXT NOT NULL,
    embedding VECTOR(1536),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handwriting_notes_frame_id ON handwriting_notes(frame_id);
CREATE INDEX IF NOT EXISTS idx_handwriting_chunks_note_id ON handwriting_chunks(note_id);
CREATE INDEX IF NOT EXISTS idx_handwriting_chunks_embedding
    ON handwriting_chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE OR REPLACE FUNCTION match_handwriting_chunks(
    query_embedding VECTOR(1536),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 10,
    filter_note_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    note_id UUID,
    chunk_text TEXT,
    similarity FLOAT,
    metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        hc.id,
        hc.note_id,
        hc.chunk_text,
        1 - (hc.embedding <=> query_embedding) AS similarity,
        hc.metadata
    FROM handwriting_chunks hc
    WHERE 
        (filter_note_id IS NULL OR hc.note_id = filter_note_id)
        AND 1 - (hc.embedding <=> query_embedding) > match_threshold
    ORDER BY hc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

COMMENT ON TABLE handwriting_notes IS 'Stores metadata and OCR text for handwriting frames';
COMMENT ON TABLE handwriting_chunks IS 'Stores OCR chunks + embeddings for handwriting frames';
COMMENT ON FUNCTION match_handwriting_chunks IS 'Performs semantic similarity search on handwriting chunks';

-- Typed note tables
CREATE TABLE IF NOT EXISTS typed_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    frame_id TEXT UNIQUE NOT NULL,
    room_id TEXT,
    storage_path TEXT,
    page_bounds JSONB,
    stroke_ids TEXT[],
    status TEXT NOT NULL DEFAULT 'ready',
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS typed_note_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES typed_notes(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    chunk_text TEXT NOT NULL,
    embedding VECTOR(1536),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_typed_notes_frame_id ON typed_notes(frame_id);
CREATE INDEX IF NOT EXISTS idx_typed_note_chunks_note_id ON typed_note_chunks(note_id);
CREATE INDEX IF NOT EXISTS idx_typed_note_chunks_embedding
    ON typed_note_chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE OR REPLACE FUNCTION match_typed_note_chunks(
    query_embedding VECTOR(1536),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 10,
    filter_note_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    note_id UUID,
    chunk_text TEXT,
    similarity FLOAT,
    metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        tnc.id,
        tnc.note_id,
        tnc.chunk_text,
        1 - (tnc.embedding <=> query_embedding) AS similarity,
        tnc.metadata
    FROM typed_note_chunks tnc
    WHERE 
        (filter_note_id IS NULL OR tnc.note_id = filter_note_id)
        AND 1 - (tnc.embedding <=> query_embedding) > match_threshold
    ORDER BY tnc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

COMMENT ON TABLE typed_notes IS 'Stores metadata for typed text notes on the canvas';
COMMENT ON TABLE typed_note_chunks IS 'Stores typed note chunks + embeddings';
COMMENT ON FUNCTION match_typed_note_chunks IS 'Performs semantic similarity search on typed note chunks';
