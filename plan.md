# PDF Upload + RAG for Multiplayer Canvas — Development Plan (Updated)

Problem Statement: Add a PDF upload feature to the existing multiplayer tldraw canvas so users can upload a PDF, view/scroll it directly on the canvas, and (later) select it to chat with an LLM. Backend must parse PDFs, chunk text, create embeddings, and store in Supabase (storage + pgvector) for RAG.

## Current Status
**Phase 1: ✅ FULLY COMPLETED** - All infrastructure ready and Supabase configured
**Phase 2: ✅ FULLY COMPLETED** - Backend API + Frontend upload UI working with Emergent universal key
**Phase 3: ⏳ READY TO START** - PDF Viewer Integration with tldraw

## Objectives
- ✅ Upload PDFs via web UI with progress tracking
- ✅ Persist PDF binaries in Supabase Storage and store metadata in DB
- ✅ Extract text from PDFs, chunk intelligently, embed with OpenAI, and store vectors in Supabase pgvector
- ⏳ Render PDFs as scrollable viewers on the canvas (react-pdf)
- ⏳ Sync canvas with a lightweight PDF shape that references the stored file/metadata
- ⏳ Prepare for later LLM chat using stored vectors (no chat yet)

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
   - emergentintegrations (0.1.0) - Emergent universal key support
   - litellm (1.79.2) - Universal LLM interface
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

## Phase 2: Backend API + Frontend Upload UI ✅ FULLY COMPLETED

### Completed Implementation Steps

#### Backend (FastAPI) - All Complete ✅
1. ✅ **Refactored POC classes into reusable modules**
   - Created `/app/backend/pdf_processor.py` module
   - Extracted PDFExtractor, TextChunker, EmbeddingGenerator, SupabaseRAGStorage classes
   - **CRITICAL FIX**: Switched from OpenAI client to litellm for Emergent universal key compatibility
   - Implemented proper error handling and logging throughout

2. ✅ **Added PDF upload endpoint**
   - Route: `POST /api/pdf/upload`
   - Accepts multipart/form-data with PDF file
   - Validates file type (application/pdf only)
   - Validates file size (20MB max)
   - Returns: `{ document_id, filename, page_count, chunk_count, file_size, public_url, status }`
   - Full pipeline: upload → extract → chunk → embed → store
   - Comprehensive error handling with detailed messages

3. ✅ **Added document retrieval endpoint**
   - Route: `GET /api/pdf/{document_id}`
   - Returns document metadata and public URL
   - Includes page count, file size, creation date
   - Returns 404 if document not found

4. ✅ **Added semantic search endpoint**
   - Route: `POST /api/pdf/search`
   - Accepts: `{ query: string, limit?: number, threshold?: number, document_id?: string }`
   - Generates query embedding using litellm
   - Calls match_pdf_chunks function
   - Returns: Array of matching chunks with similarity scores and page numbers

5. ✅ **Added document list endpoint**
   - Route: `GET /api/pdf/documents`
   - Lists all uploaded documents with metadata
   - Supports pagination (limit, offset)
   - Returns public URLs for all documents

6. ✅ **Implemented comprehensive error handling**
   - HTTPException with appropriate status codes (400, 404, 500)
   - Detailed error messages for debugging
   - Extensive logging with context
   - Handles litellm API errors gracefully
   - Handles Supabase errors (connection, storage)
   - Temporary file cleanup in all code paths

#### Frontend (React) - All Complete ✅
7. ✅ **Installed frontend dependencies**
   - react-pdf (10.2.0) - PDF rendering
   - pdfjs-dist (5.4.394) - PDF.js library
   - framer-motion (12.23.24) - Animations
   - @supabase/supabase-js (2.80.0) - Supabase client

8. ✅ **Added Sonner Toaster to root**
   - Imported Toaster from `@/components/ui/sonner`
   - Added `<Toaster position="top-right" />` to App.js
   - Configured for toast notifications

9. ✅ **Created PdfUploadButton component**
   - File: `/app/frontend/src/components/PdfUploadButton.jsx`
   - Uses Shadcn Dialog, Button, Tooltip components
   - File input with accept="application/pdf,.pdf"
   - Client-side validation (type, size)
   - data-testid="pdf-upload-trigger-button"
   - data-testid="pdf-upload-input"
   - Lucide icons (Upload, FileText)

10. ✅ **Implemented upload progress handler**
    - Uses Sonner toast for upload progress
    - Shows: "Uploading..." → progress % → "Complete!"
    - Displays page count and chunk count on success
    - Error toast with retry action on failure
    - data-testid="upload-toast"

11. ✅ **Integrated upload with Canvas**
    - Added PdfUploadButton to Canvas toolbar (top-left overlay)
    - Positioned with proper z-index (1000) above canvas
    - On successful upload, stores document metadata in React state
    - Shows document counter: "X PDF(s) uploaded"
    - Callback system ready for Phase 3 PDF shape creation

12. ✅ **Updated Canvas.jsx styling**
    - Added toolbar container with absolute positioning
    - Follows design guidelines for spacing and shadows
    - Button doesn't interfere with tldraw UI
    - Uses inline styles for overlay positioning

### Technical Achievements (Phase 2)
- **Emergent Universal Key Integration**: Successfully configured litellm to work with sk-emergent-* keys
- **Full Pipeline Working**: PDF upload → text extraction → chunking → embedding generation → vector storage
- **Error Handling**: Comprehensive validation and error messages at every step
- **Progress Tracking**: Real-time upload progress with axios onUploadProgress
- **Data Persistence**: All PDFs and embeddings stored in Supabase with public URLs

### User Stories (Phase 2) - All Complete ✅
- ✅ As a user, I can click "Upload PDF" button on the canvas
- ✅ As a user, I can select a PDF file from my device
- ✅ As a user, I see a progress indicator while the PDF uploads and is processed
- ✅ As a user, I receive a success notification when upload completes
- ✅ As a user, I get a clear error message if upload fails, with option to retry
- ✅ As a user, I can see a count of uploaded documents
- ✅ As a developer, I can query similar chunks via API

### Exit Criteria (Phase 2) - All Met ✅
- ✅ All backend endpoints implemented and tested
- ✅ Frontend upload UI integrated with Canvas
- ✅ End-to-end flow working: upload → process → store → success notification
- ✅ Error handling tested (wrong file type, oversized file, API errors)
- ✅ All components have data-testid attributes
- ✅ Manual testing confirms functionality

### Technical Decisions (Phase 2)
- **Emergent Key Solution**: Using litellm library instead of direct OpenAI client for universal key compatibility
- **Bucket Access**: Public bucket for development (simplifies URL access, no signed URLs needed)
- **File Size Limit**: 20MB enforced client-side, 50MB storage bucket limit
- **Processing**: Synchronous for Phase 2 (async background processing in future phases)
- **Progress Tracking**: Toast-based notifications (no WebSocket for now)
- **Error Strategy**: Fail fast with clear messages, allow retry via toast action

### Key Files Modified/Created (Phase 2)
- ✅ `/app/backend/pdf_processor.py` - Core processing classes with litellm
- ✅ `/app/backend/server.py` - Added 4 new API endpoints
- ✅ `/app/frontend/src/App.js` - Added Sonner Toaster
- ✅ `/app/frontend/src/components/PdfUploadButton.jsx` - Upload UI component
- ✅ `/app/frontend/src/components/Canvas.jsx` - Integrated upload button

## Phase 3: PDF Viewer Integration with tldraw ⏳ READY TO START

### Implementation Steps (Pending)

1. **Configure react-pdf and PDF.js worker** (Status: Pending)
   - Set up PDF.js worker URL in index.html or component
   - Configure CORS for PDF loading from Supabase
   - Test basic PDF rendering with uploaded documents
   - Handle PDF.js initialization errors

2. **Create PdfViewer component** (Status: Pending)
   - File: `/app/frontend/src/components/PdfViewer.jsx`
   - Use react-pdf Document and Page components
   - Wrap in Shadcn ScrollArea for scrolling
   - Add zoom controls (+/-, slider) with framer-motion
   - Add page indicator (e.g., "3 / 15")
   - Implement keyboard shortcuts (Ctrl/Cmd +/-)
   - All controls with data-testid attributes
   - Props: `{ documentId, fileUrl, onClose }`

3. **Research tldraw v4 custom shapes** (Status: Pending)
   - Study tldraw shape API documentation
   - Determine best approach: custom shape vs. HTML overlay
   - Create proof-of-concept shape
   - Test shape persistence and multiplayer sync

4. **Implement PDF shape for canvas** (Status: Pending)
   - Create PdfShape that stores: document_id, file_url, page_count, position, size
   - Render PdfViewer at shape position
   - Make draggable and resizable
   - Sync state via tldraw store for multiplayer
   - Handle shape deletion and cleanup

5. **Optimize PDF rendering** (Status: Pending)
   - Disable text layer and annotation layer for performance
   - Memoize Document component to prevent re-renders
   - Implement lazy loading for pages
   - Clamp scale between 0.5 and 2.0
   - Add loading skeleton while PDF loads

6. **Add error states** (Status: Pending)
   - Create PdfError component per design guidelines
   - Handle PDF load failures (404, CORS, etc.)
   - Show loading skeleton during initial load
   - Provide retry/replace options
   - data-testid="pdf-error-banner"

7. **Style per design guidelines** (Status: Pending)
   - Use design tokens from design_guidelines.md
   - White surfaces with subtle shadows (var(--shadow-md))
   - Glass-morphism for floating controls (bg-white/90 backdrop-blur)
   - Ocean blue accents for active states (var(--accent-blue-600))
   - Ensure WCAG AA contrast (4.5:1 minimum)
   - Add scroll progress indicator on right edge

### User Stories (Phase 3)
- As a user, I see the uploaded PDF rendered on the canvas after upload
- As a user, I can zoom in/out on the PDF using controls or keyboard
- As a user, I can scroll through PDF pages within the shape
- As a user, I see a page indicator showing current page / total pages
- As a user, I can drag and resize the PDF shape like other canvas elements
- As a collaborator, I see PDF shapes added by others in real-time
- As a user, I can close/delete a PDF shape from the canvas

### Exit Criteria (Phase 3)
- ✅ PDF renders smoothly in canvas shape
- ✅ All controls functional (zoom, scroll, page navigation)
- ✅ Multiplayer sync working (shapes visible to all users)
- ✅ Styling matches design guidelines (colors, shadows, spacing)
- ✅ All elements have data-testid attributes
- ✅ Performance acceptable (no lag during zoom/scroll)

### Technical Considerations (Phase 3)
- **PDF.js Worker**: Must be served from same origin or configured properly
- **Memory Management**: Large PDFs may consume significant memory
- **Multiplayer Sync**: Shape state must sync via tldraw store
- **Performance**: Disable unnecessary PDF.js layers, use memoization
- **Accessibility**: Keyboard navigation, ARIA labels, focus management

## Phase 4: Testing & Polish ⏳ NOT STARTED

### Implementation Steps (Pending)

1. **Call testing agent** (Status: Pending)
   - Provide comprehensive test plan covering:
     - Backend endpoints (upload, retrieve, search, list)
     - Frontend upload flow (validation, progress, errors)
     - PDF viewer functionality (zoom, scroll, page navigation)
     - Error scenarios (invalid files, network failures, API errors)
     - Multiplayer sync (shape visibility, state updates)
   - Review test results and prioritize fixes

2. **Fix issues from testing** (Status: Pending)
   - Address all high priority bugs immediately
   - Address all medium priority bugs before completion
   - Document low priority issues for future improvements
   - Re-test after each fix to prevent regressions

3. **Performance optimization** (Status: Pending)
   - Monitor embedding generation time (log metrics)
   - Implement caching for repeated uploads (hash-based)
   - Add warning for large PDFs (>200 pages or >15MB)
   - Optimize PDF rendering (page virtualization if needed)
   - Profile frontend bundle size and optimize imports

4. **Security review** (Status: Pending)
   - Validate file types on server (magic number check)
   - Sanitize filenames (remove path traversal attempts)
   - Implement rate limiting on upload endpoint (10 per hour per IP)
   - Review error messages (no sensitive data leaks)
   - Add CSRF protection if needed
   - Audit Supabase RLS policies

5. **UI/UX polish** (Status: Pending)
   - Add empty state UI ("Upload a PDF to start")
   - Improve loading states (skeleton loaders)
   - Add tooltips to all controls
   - Ensure mobile responsiveness (touch targets ≥44px)
   - Final design review against design_guidelines.md
   - Add keyboard shortcuts documentation

### User Stories (Phase 4)
- As a user, I experience smooth, bug-free PDF uploads
- As a user, I see polished loading and error states
- As a user, large PDFs are handled gracefully with warnings
- As a tester, all data-testid attributes are present for automation
- As a developer, I can review logs for debugging
- As a user, the app works well on mobile devices

### Exit Criteria (Phase 4)
- ✅ Testing agent reports all tests passing
- ✅ No high or medium priority bugs remaining
- ✅ Performance benchmarks met (<30s for typical 10-page PDF)
- ✅ Security review complete with no critical issues
- ✅ UI polish complete and approved
- ✅ Documentation updated (README, API docs)

## Implementation Notes

### Technical Stack
- **PDF Processing**: pdfplumber for text extraction
- **Chunking**: 1000 chars per chunk, 200 char overlap
- **Embeddings**: OpenAI text-embedding-3-small (1536 dims) via Emergent LLM key + litellm
- **Vector DB**: Supabase pgvector with HNSW index
- **Storage**: Supabase Storage bucket "pdfs" (public for development)
- **Frontend**: React + react-pdf + tldraw v4 + Shadcn UI + framer-motion
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
- API Key: Emergent universal key (sk-emergent-*)

### Design Guidelines Compliance
- Follow `/app/design_guidelines.md` strictly
- Use Shadcn components exclusively (no HTML elements)
- Color palette: Neutral slate surfaces with ocean blue accents
- Typography: Space Grotesk (headings) + Inter (body)
- No saturated gradients (GRADIENT RESTRICTION RULE)
- All interactive elements require data-testid attributes
- Glass-morphism only for floating PDF controls
- WCAG AA contrast compliance (4.5:1 minimum)

### Emergent Universal Key Integration
- **Library**: litellm (installed via emergentintegrations)
- **Usage**: `from litellm import embedding`
- **Configuration**: Pass api_key directly, no base_url needed
- **Model**: "text-embedding-3-small" (1536 dimensions)
- **Batch Size**: 100 texts per request
- **Error Handling**: Catches and logs litellm exceptions

## Next Actions (Immediate)

### Phase 3 Implementation Order
1. **PDF.js Setup** (Day 1):
   - Configure PDF.js worker
   - Test basic rendering with uploaded PDFs
   - Verify CORS and public URL access

2. **PdfViewer Component** (Day 1-2):
   - Create basic viewer with Document/Page
   - Add ScrollArea wrapper
   - Implement zoom controls
   - Add page indicator
   - Style per design guidelines

3. **tldraw Integration** (Day 2-3):
   - Research custom shape API
   - Create PdfShape implementation
   - Test dragging and resizing
   - Verify multiplayer sync

4. **Polish & Testing** (Day 3-4):
   - Add error states
   - Optimize performance
   - Add data-testid attributes
   - Manual testing across features

### Development Approach
- Build incrementally, test frequently
- Use uploaded PDFs from Phase 2 for testing
- Follow design guidelines from the start
- Add data-testid attributes immediately
- Log extensively for debugging
- Test multiplayer sync early

## Success Criteria (Overall)
- ✅ Phase 1: POC infrastructure complete and Supabase configured
- ✅ Phase 2: Users can upload PDFs via web UI with progress tracking
- ⏳ Phase 3: PDFs render on canvas with zoom/scroll controls
- ⏳ Phase 4: All tests passing, no critical bugs, polished UX

## Risk Assessment

### Resolved Risks ✅
- ✅ Supabase setup dependency - User completed manual setup
- ✅ OpenAI integration complexity - Solved with litellm
- ✅ Emergent universal key compatibility - Fixed by using litellm instead of OpenAI client
- ✅ Dependency conflicts - All packages installed successfully
- ✅ Supabase schema design - Deployed and verified
- ✅ Backend API implementation - All endpoints working
- ✅ Frontend upload UI - Component created and integrated

### Current Risks
1. **tldraw v4 Custom Shapes** (MEDIUM → HIGH)
   - Risk: Complex API, may require significant research and trial/error
   - Mitigation: Research early in Phase 3, consider HTML overlay approach if custom shapes prove too complex
   - Alternative: Render PDFs as fixed overlays outside tldraw canvas

2. **PDF.js Worker Configuration** (MEDIUM)
   - Risk: Worker path configuration can be tricky in production
   - Mitigation: Test thoroughly, use CDN worker if local fails
   - Fallback: Use pdfjs-dist from CDN

3. **Large PDF Performance** (MEDIUM)
   - Risk: Processing 100+ page PDFs may be slow or crash browser
   - Mitigation: Page limits (warn at 200 pages), lazy loading, page virtualization
   - Current limit: 20MB should prevent most extreme cases

4. **Multiplayer Sync Complexity** (MEDIUM)
   - Risk: PDF shapes may not sync correctly across users
   - Mitigation: Test thoroughly with multiple browser tabs, follow tldraw best practices
   - Fallback: Store shape state in tldraw store, let tldraw handle sync

5. **OpenAI API Costs** (LOW)
   - Risk: Costs scale with document size
   - Mitigation: Batch processing (100 texts/request), caching, cost monitoring
   - Current status: Emergent universal key provides cost control

### Monitoring
- Track litellm API usage and costs via logs
- Monitor PDF processing times (log each step)
- Log all errors with full context
- Measure user upload success rates
- Track PDF viewer performance metrics (load time, render time)

## Lessons Learned

### Phase 1 & 2 Insights
1. **Emergent Universal Key**: Direct OpenAI client doesn't work with sk-emergent-* keys. Must use litellm library for compatibility.
2. **Public Bucket**: Using public Supabase bucket simplifies development significantly (no signed URL complexity).
3. **Litellm Integration**: Works seamlessly once configured, handles Emergent key automatically.
4. **Error Handling**: Comprehensive error messages at every step crucial for debugging.
5. **Progress Tracking**: Users appreciate real-time feedback during long operations.

### Technical Decisions Rationale
- **litellm over OpenAI client**: Required for Emergent universal key support
- **Public bucket**: Simplifies development, can be made private later
- **Synchronous processing**: Acceptable for Phase 2, can optimize later
- **Toast notifications**: Simple, effective, no WebSocket complexity
- **20MB limit**: Balances functionality with performance/cost concerns
