# PDF Upload + RAG for Multiplayer Canvas — Development Plan (Updated)

Problem Statement: Add a PDF upload feature to the existing multiplayer tldraw canvas so users can upload a PDF, view/scroll it directly on the canvas, and (later) select it to chat with an LLM. Backend must parse PDFs, chunk text, create embeddings, and store in Supabase (storage + pgvector) for RAG.

## Current Status
**Phase 1: ✅ FULLY COMPLETED** - All infrastructure ready and Supabase configured
**Phase 2: 🚧 IN PROGRESS** - Building FastAPI endpoints and React upload UI

## Objectives
- Upload PDFs and render them as scrollable viewers on the canvas (react-pdf)
- Persist PDF binaries in Supabase Storage and store metadata in DB
- Extract text from PDFs, chunk intelligently, embed with OpenAI, and store vectors in Supabase pgvector
- Sync canvas with a lightweight PDF shape that references the stored file/metadata
- Prepare for later LLM chat using stored vectors (no chat yet)

## Phase 1: Core POC Infrastructure ✅ FULLY COMPLETED

### Completed Implementation Steps
1. ✅ Web search completed: Researched Supabase pgvector best practices, OpenAI embeddings (text-embedding-3-small with 1536 dims), pdfplumber extraction techniques, and optimal chunk sizes (800-1000 chars with 200 overlap)
2. ✅ Integration Playbook obtained: Comprehensive OpenAI embeddings integration guide received with code examples, security best practices, and production deployment considerations
3. ✅ Supabase resources configured:
   - SQL schema deployed to production:
     - `pdf_documents` table (id uuid pk, filename, storage_path, page_count, file_size, created_at, updated_at)
     - `pdf_chunks` table (id uuid pk, document_id fk, page_number, chunk_index, chunk_text, embedding vector(1536), metadata jsonb)
     - pgvector extension enabled
     - HNSW index for fast vector similarity search (m=16, ef_construction=64)
     - `match_pdf_chunks()` function for semantic search
     - `get_document_stats()` function for document analytics
   - Storage bucket "pdfs" created (public for development simplicity)
4. ✅ Backend dependencies installed:
   - pdfplumber (0.11.8) - PDF text extraction
   - supabase (2.24.0) - Supabase client
   - vecs (0.4.5) - Vector operations
   - openai (2.7.1) - OpenAI API client
   - tiktoken (0.12.0) - Token counting
   - All supporting libraries (httpx, sqlalchemy, psycopg2-binary, etc.)
5. ✅ Comprehensive POC script created (`poc_pdf_rag_pipeline.py`) with:
   - PDFExtractor class using pdfplumber
   - TextChunker class with configurable chunk size and overlap
   - EmbeddingGenerator class with batch processing
   - SupabaseRAGStorage class for file upload and vector storage
   - Complete end-to-end pipeline function
   - Similarity search validation
   - Detailed logging and error handling
6. ✅ Environment configured:
   - `.env` file updated with Supabase credentials
   - Emergent LLM key obtained and configured (sk-emergent-701A84a3b005930B86)
   - All environment variables documented

### Deliverables Created
- `/app/backend/setup_supabase.sql` - Database schema and functions ✅ DEPLOYED
- `/app/backend/setup_supabase_storage.py` - Bucket creation script
- `/app/backend/poc_pdf_rag_pipeline.py` - Complete POC pipeline
- `/app/backend/SUPABASE_SETUP_INSTRUCTIONS.md` - Setup guide
- `/app/backend/requirements.txt` - Updated with all dependencies
- `/app/backend/.env` - Configured with credentials

### User Stories (Phase 1) - All Complete ✅
- ✅ As a developer, I can run a script that uploads a PDF to Supabase Storage
- ✅ As a developer, I can parse PDF text into page-aware chunks
- ✅ As a developer, I can embed chunks via OpenAI and store vectors in Supabase
- ✅ As a developer, I can run a similarity search query on stored chunks
- ✅ As a developer, I can retrieve a public URL for the PDF file

### Exit Criteria (Phase 1) - All Met ✅
- ✅ POC script created and ready to use
- ✅ Supabase database schema deployed (verified via match_pdf_chunks function)
- ✅ Storage bucket "pdfs" created (public access for development)
- ✅ All dependencies installed and environment configured

## Phase 2: Backend API + Frontend Upload UI 🚧 IN PROGRESS

### Implementation Steps

#### Backend (FastAPI)
1. **Refactor POC classes into reusable modules** (Status: Pending)
   - Extract PDFExtractor, TextChunker, EmbeddingGenerator, SupabaseRAGStorage from POC
   - Create `/app/backend/pdf_processor.py` module
   - Add proper async support for FastAPI integration
   - Implement connection pooling for Supabase client

2. **Add PDF upload endpoint** (Status: Pending)
   - Route: `POST /api/pdf/upload`
   - Accept multipart/form-data with PDF file
   - Validate file type (application/pdf only)
   - Validate file size (20MB max client-side, 50MB storage limit)
   - Return: `{ document_id, filename, page_count, status, public_url }`
   - Process pipeline: upload → extract → chunk → embed → store
   - Handle errors gracefully with detailed messages

3. **Add document retrieval endpoint** (Status: Pending)
   - Route: `GET /api/pdf/{document_id}`
   - Return document metadata and public URL
   - Include page count, chunk count, creation date
   - Return 404 if document not found

4. **Add semantic search endpoint** (Status: Pending)
   - Route: `POST /api/pdf/search`
   - Accept: `{ query: string, limit?: number, threshold?: number, document_id?: string }`
   - Generate query embedding
   - Call match_pdf_chunks function
   - Return: Array of matching chunks with similarity scores and page numbers

5. **Add document list endpoint** (Status: Pending)
   - Route: `GET /api/pdf/documents`
   - List all uploaded documents with metadata
   - Support pagination (limit, offset)
   - Return document statistics via get_document_stats

6. **Implement proper error handling** (Status: Pending)
   - HTTPException with appropriate status codes
   - Detailed error messages for debugging
   - Log all errors with context
   - Handle OpenAI API errors (rate limits, invalid key)
   - Handle Supabase errors (connection, storage)

#### Frontend (React)
7. **Install frontend dependencies** (Status: Pending)
   ```bash
   yarn add react-pdf pdfjs-dist @supabase/supabase-js framer-motion
   ```

8. **Add Sonner Toaster to root** (Status: Pending)
   - Import Toaster from `@/components/ui/sonner`
   - Add `<Toaster />` to App.js
   - Configure position and styling per design guidelines

9. **Create PdfUploadButton component** (Status: Pending)
   - File: `/app/frontend/src/components/PdfUploadButton.jsx`
   - Use Shadcn Dialog, Button, Tooltip components
   - File input with accept="application/pdf"
   - Client-side validation (type, size)
   - data-testid="pdf-upload-trigger-button"
   - data-testid="pdf-upload-input"

10. **Create upload progress handler** (Status: Pending)
    - Use Sonner toast for upload progress
    - Show: "Uploading..." → "Processing..." → "Complete!"
    - Display progress percentage if available
    - Handle errors with error toast and retry option
    - data-testid="upload-toast"

11. **Integrate upload with Canvas** (Status: Pending)
    - Add PdfUploadButton to Canvas toolbar
    - Position near existing tldraw controls
    - On successful upload, prepare for PDF shape creation (Phase 3)
    - Store uploaded document metadata in React state

12. **Update Canvas.jsx styling** (Status: Pending)
    - Add toolbar container for upload button
    - Follow design_guidelines.md for positioning
    - Ensure button doesn't interfere with tldraw UI
    - Use design tokens for colors and spacing

### User Stories (Phase 2)
- As a user, I can click "Upload PDF" button on the canvas
- As a user, I can select a PDF file from my device
- As a user, I see a progress indicator while the PDF uploads and is processed
- As a user, I receive a success notification when upload completes
- As a user, I get a clear error message if upload fails, with option to retry
- As a user, I can see a list of uploaded documents
- As a developer, I can query similar chunks via API

### Exit Criteria (Phase 2)
- ✅ All backend endpoints implemented and tested
- ✅ Frontend upload UI integrated with Canvas
- ✅ End-to-end flow working: upload → process → store → success notification
- ✅ Error handling tested (wrong file type, oversized file, network errors)
- ✅ All components have data-testid attributes
- ✅ Manual testing via curl confirms API functionality

### Technical Decisions (Phase 2)
- **Bucket Access**: Public bucket for development (simplifies URL access)
- **File Size Limit**: 20MB enforced client-side, 50MB storage bucket limit
- **Processing**: Synchronous for Phase 2 (async background processing in future phases)
- **Progress Tracking**: Toast-based notifications (no WebSocket for now)
- **Error Strategy**: Fail fast with clear messages, allow retry

## Phase 3: PDF Viewer Integration with tldraw (Status: Not Started)

### Implementation Steps
1. **Install react-pdf and configure** (Status: Pending)
   - Configure PDF.js worker
   - Set up proper CORS for PDF loading
   - Test basic PDF rendering

2. **Create PdfViewer component** (Status: Pending)
   - File: `/app/frontend/src/components/PdfViewer.jsx`
   - Use react-pdf Document and Page components
   - Wrap in Shadcn ScrollArea
   - Add zoom controls (+/-, slider)
   - Add page indicator (e.g., "3 / 15")
   - Implement framer-motion animations for controls
   - All controls with data-testid attributes

3. **Research tldraw v4 custom shapes** (Status: Pending)
   - Study tldraw shape API documentation
   - Determine best approach: custom shape vs. overlay
   - Create proof-of-concept shape

4. **Implement PDF shape for canvas** (Status: Pending)
   - Create PdfShape that stores: document_id, file_url, page_count
   - Render PdfViewer at shape position
   - Make draggable and resizable
   - Sync state via tldraw store for multiplayer

5. **Optimize PDF rendering** (Status: Pending)
   - Disable text layer and annotation layer
   - Memoize Document component
   - Implement lazy loading for pages
   - Clamp scale between 0.5 and 2.0

6. **Add error states** (Status: Pending)
   - Create PdfError component
   - Handle PDF load failures
   - Show loading skeleton
   - Provide retry/replace options

7. **Style per design guidelines** (Status: Pending)
   - Use design tokens from design_guidelines.md
   - White surfaces with subtle shadows
   - Glass-morphism for floating controls
   - Ensure WCAG AA contrast

### User Stories (Phase 3)
- As a user, I see the uploaded PDF rendered on the canvas
- As a user, I can zoom in/out on the PDF
- As a user, I can scroll through PDF pages
- As a user, I see a page indicator showing current page
- As a user, I can drag and resize the PDF shape
- As a collaborator, I see PDF shapes added by others in real-time

### Exit Criteria (Phase 3)
- ✅ PDF renders smoothly in canvas shape
- ✅ All controls functional (zoom, scroll, page navigation)
- ✅ Multiplayer sync working
- ✅ Styling matches design guidelines
- ✅ All elements have data-testid attributes

## Phase 4: Testing & Polish (Status: Not Started)

### Implementation Steps
1. **Call testing agent** (Status: Pending)
   - Provide comprehensive test plan
   - Test backend endpoints
   - Test frontend upload flow
   - Test PDF viewer functionality
   - Test error scenarios
   - Test multiplayer sync

2. **Fix issues from testing** (Status: Pending)
   - Address all high priority bugs
   - Address all medium priority bugs
   - Document any low priority issues for future

3. **Performance optimization** (Status: Pending)
   - Monitor embedding generation time
   - Implement caching for repeated uploads
   - Add warning for large PDFs (>200 pages)
   - Optimize PDF rendering performance

4. **Security review** (Status: Pending)
   - Validate file types on server
   - Sanitize filenames
   - Implement rate limiting
   - Review error messages (no sensitive data leaks)

5. **UI/UX polish** (Status: Pending)
   - Add empty state UI
   - Improve loading states
   - Add tooltips to controls
   - Ensure mobile responsiveness
   - Final design review against design_guidelines.md

### User Stories (Phase 4)
- As a user, I experience smooth, bug-free PDF uploads
- As a user, I see polished loading and error states
- As a user, large PDFs are handled gracefully with warnings
- As a tester, all data-testid attributes are present for automation
- As a developer, I can review logs for debugging

### Exit Criteria (Phase 4)
- ✅ Testing agent reports all tests passing
- ✅ No high or medium priority bugs remaining
- ✅ Performance benchmarks met (<30s for typical PDF)
- ✅ Security review complete
- ✅ UI polish complete and approved

## Implementation Notes

### Technical Stack
- **PDF Processing**: pdfplumber for text extraction
- **Chunking**: 1000 chars per chunk, 200 char overlap
- **Embeddings**: OpenAI text-embedding-3-small (1536 dims) via Emergent LLM key
- **Vector DB**: Supabase pgvector with HNSW index
- **Storage**: Supabase Storage bucket "pdfs" (public for development)
- **Frontend**: React + react-pdf + tldraw v4 + Shadcn UI
- **Backend**: FastAPI with async support

### Key Configurations
- Chunk size: 1000 characters
- Chunk overlap: 200 characters (20%)
- Embedding model: text-embedding-3-small
- Embedding dimensions: 1536
- Max file size: 20MB (client) / 50MB (storage)
- Vector index: HNSW with m=16, ef_construction=64
- Similarity metric: Cosine distance (<=>)
- Bucket access: Public (for development)

### Design Guidelines Compliance
- Follow `/app/design_guidelines.md` strictly
- Use Shadcn components exclusively
- Color palette: Neutral slate surfaces with ocean blue accents
- Typography: Space Grotesk (headings) + Inter (body)
- No saturated gradients (GRADIENT RESTRICTION RULE)
- All interactive elements require data-testid attributes
- Glass-morphism only for floating PDF controls

## Next Actions (Immediate)

### Phase 2 Implementation Order
1. **Backend First** (Recommended):
   - Refactor POC classes into modules
   - Implement FastAPI endpoints
   - Test with curl/Postman
   - Verify end-to-end pipeline works

2. **Frontend Second**:
   - Install dependencies
   - Create upload UI components
   - Integrate with backend API
   - Test upload flow

3. **Integration Testing**:
   - Test complete flow in browser
   - Verify error handling
   - Check progress indicators
   - Validate success states

### Development Approach
- Build incrementally, test frequently
- Use POC script as reference implementation
- Follow design guidelines from the start
- Add data-testid attributes immediately
- Log extensively for debugging

## Success Criteria (Overall)
- ✅ Phase 1: POC infrastructure complete and Supabase configured
- 🚧 Phase 2: Users can upload PDFs via web UI with progress tracking
- ⏳ Phase 3: PDFs render on canvas with zoom/scroll controls
- ⏳ Phase 4: All tests passing, no critical bugs, polished UX

## Risk Assessment

### Resolved Risks ✅
- ✅ Supabase setup dependency - User completed manual setup
- ✅ OpenAI integration complexity - Playbook obtained
- ✅ Dependency conflicts - All packages installed
- ✅ Supabase schema design - Deployed and verified

### Current Risks
1. **tldraw v4 Custom Shapes** (MEDIUM)
   - Risk: Complex API, may require significant research
   - Mitigation: Research early in Phase 3, consider overlay approach if needed

2. **Large PDF Performance** (MEDIUM)
   - Risk: Processing 100+ page PDFs may be slow
   - Mitigation: Page limits, async processing, progress indicators

3. **OpenAI API Costs** (LOW)
   - Risk: Costs scale with document size
   - Mitigation: Batch processing, caching, cost monitoring

4. **Multiplayer Sync Complexity** (MEDIUM)
   - Risk: PDF shapes may not sync correctly across users
   - Mitigation: Test thoroughly, follow tldraw best practices

### Monitoring
- Track OpenAI API usage and costs
- Monitor PDF processing times
- Log all errors with context
- Measure user upload success rates
