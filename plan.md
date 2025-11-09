# Multiplayer Infinite Canvas with AI Chat & PDF Upload — Development Plan

## Objectives
- ✅ Build a multiplayer infinite canvas using tldraw's built-in demo sync (https://demo.tldraw.xyz)
- ✅ Provide a single default room that everyone joins automatically
- ✅ Integrate AI chat powered by Claude Sonnet 4 via Emergent Universal LLM Key
- ✅ AI responses create TEXT SHAPES ON THE CANVAS (not sidebar)
- ✅ Upload PDFs via web UI with progress tracking
- ✅ Persist PDF binaries in Supabase Storage and store metadata in DB
- ✅ Extract text from PDFs, chunk intelligently, embed with OpenAI, and store vectors in Supabase pgvector
- ⏳ Render PDFs as scrollable viewers on the canvas (react-pdf)
- ⏳ Sync canvas with a lightweight PDF shape that references the stored file/metadata
- ✅ Deliver real-time collaboration with user presence indicators
- ✅ Follow design guidelines: canvas-first layout, form at bottom, tools at top

## Current Status
**Phase 1: ✅ FULLY COMPLETED** - Multiplayer canvas + PDF infrastructure ready and Supabase configured
**Phase 2: ✅ FULLY COMPLETED** - AI Chat + Backend API + Frontend upload UI working with Emergent universal key
**Phase 3: ⏳ READY TO START** - PDF Viewer Integration with tldraw

## Phase 1: Multiplayer Canvas + PDF Infrastructure (COMPLETED ✅)

### Multiplayer Canvas Achievements
- ✅ Used tldraw's `useSyncDemo` hook for instant multiplayer functionality
- ✅ Connected to tldraw's demo server (https://demo.tldraw.xyz)
- ✅ Real-time collaboration working out of the box
- ✅ User presence indicators showing collaborators
- ✅ All 29 tldraw drawing tools available
- ✅ Infinite canvas with pan/zoom
- ✅ Automatic persistence via tldraw's demo server
- ✅ Clean, minimal UI with canvas-first design

### PDF Infrastructure Achievements
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
   - Emergent LLM key obtained and configured
   - All environment variables documented

### Deliverables Created
- `/app/backend/setup_supabase.sql` - Database schema and functions ✅ DEPLOYED
- `/app/backend/setup_supabase_storage.py` - Bucket creation script
- `/app/backend/poc_pdf_rag_pipeline.py` - Complete POC pipeline
- `/app/backend/SUPABASE_SETUP_INSTRUCTIONS.md` - Setup guide
- `/app/backend/requirements.txt` - Updated with all dependencies
- `/app/backend/.env` - Configured with credentials

## Phase 2: AI Chat + PDF Upload API (COMPLETED ✅)

### AI Chat ON THE CANVAS (COMPLETED ✅)
**Status:** COMPLETED - AI responses create text shapes directly on the canvas

**Achievements:**
- ✅ Backend (FastAPI):
  - Installed `emergentintegrations` library for Claude Sonnet 4 access
  - Created `/api/ask` endpoint with streaming responses
  - Integrated Emergent Universal LLM Key (no user API key needed)
  - Configured Claude Sonnet 4 model (`claude-sonnet-4-20250514`)
  - Simulated streaming by chunking responses for smooth UX
  - Added `python-dotenv` for environment variable loading
  - Fixed EMERGENT_LLM_KEY loading issue

- ✅ Frontend (React):
  - Created `PromptInput` component at bottom of screen
  - Implemented Cmd+K (Mac) / Ctrl+K (Windows) keyboard shortcut
  - Form expands on focus (400px → 50% width)
  - AI responses create TEXT SHAPES ON THE CANVAS
  - Used `toRichText()` helper for proper tldraw v4 text shapes
  - Real-time streaming updates the text shape as response arrives
  - Shapes are synced across all users via tldraw's multiplayer
  - Auto-zoom to created AI response shape
  - Clean form design with submit button

### PDF Upload API Achievements

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

### User Stories Completed
1. ✅ As a user, I can press Cmd+K to focus the AI prompt input
2. ✅ As a user, I can type a question and press Enter
3. ✅ As a user, I see a text shape appear ON THE CANVAS with my question
4. ✅ As a user, I see Claude Sonnet 4's response stream in real-time ON THE CANVAS
5. ✅ As a user, other collaborators can see my AI responses appear on the shared canvas
6. ✅ As a user, the form is at the bottom and doesn't block the drawing tools at the top
7. ✅ As a user, I can click "Upload PDF" button on the canvas
8. ✅ As a user, I can select a PDF file from my device
9. ✅ As a user, I see a progress indicator while the PDF uploads and is processed
10. ✅ As a user, I receive a success notification when upload completes
11. ✅ As a user, I get a clear error message if upload fails, with option to retry
12. ✅ As a user, I can see a count of uploaded documents
13. ✅ As a developer, I can query similar chunks via API

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

### Phase 3.1: Auto-Frame Handwriting Feature ✅ COMPLETED
**Status:** COMPLETED - Feature fully functional

**Achievements:**
- ✅ Implemented keyboard shortcut 's' to auto-frame selected handwriting strokes
- ✅ Frame creation with proper z-index (frame appears behind strokes using `sendToBack`)
- ✅ Automatic reparenting of handwriting strokes into the frame
- ✅ Grouping of frame + strokes as single object
- ✅ Non-resizable behavior (group can only be moved, not resized)
- ✅ Integration with tldraw's native behaviors (undo, delete, multiplayer sync)
- ✅ Custom `beforeChange` handler to prevent resize operations on groups with `noResize` meta flag
- ✅ Extended to capture PNG snapshots and upload to backend

**Implementation Details:**
- Modified `/app/frontend/src/components/Canvas.jsx`
- Added `editorRef` to capture editor instance on mount
- Created `autoFrameHandwriting()` helper function
- Created `captureAndUploadFrame()` helper function for image capture and upload
- Added `POST /api/handwriting-upload` backend endpoint
- Used tldraw's `overrides` prop to inject custom 's' keyboard action
- All operations wrapped in `editor.run()` for proper history and multiplayer sync

**User Stories Completed:**
1. ✅ As a user, I can select handwriting strokes and press 's' to auto-frame them
2. ✅ As a user, the frame appears behind my strokes (not covering them)
3. ✅ As a user, the framed group behaves like a note (movable but not resizable)
4. ✅ As a user, when I press 's' to frame handwriting, a snapshot is automatically captured and uploaded
5. ✅ As a user, I can undo the frame operation with ⌘+Z
6. ✅ As a user, the auto-frame feature works in multiplayer (syncs to other users)

3. **Research tldraw v4 custom shapes** (Status: Pending)
   - Study tldraw shape API documentation
   - Determine best approach: custom shape vs. HTML overlay
   - Create proof-of-concept shape
   - Test shape persistence and multiplayer sync

**Planned Features:**
1. **UI Polish**
   - Keyboard shortcuts displayed in tooltips (V=select, D=draw, S=auto-frame, etc.)
   - Improved focus states for accessibility
   - Refined shadows and transitions
   - Respect `prefers-reduced-motion` media query

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

## Phase 4: Testing & Polish ⏳ NOT STARTED

### ✅ What's Working
- **Backend:** FastAPI server with AI chat, PDF processing, and handwriting upload endpoints
- **Frontend:** tldraw v4.1.2 canvas with full drawing tools, multiplayer sync, AI chat, PDF upload
- **Design:** Clean minimal UI following design guidelines (Inter font, neutral colors, no gradients)
- **AI Chat:** Claude Sonnet 4 integration with streaming responses creating text shapes ON THE CANVAS
- **PDF Upload:** Complete upload infrastructure with progress tracking and vector storage
- **Auto-Frame Feature:** Keyboard shortcut 's' to frame handwriting strokes (non-resizable, movable)
- **Image Capture:** Automatic PNG snapshot capture and upload to backend server

### Implementation Steps (Pending)

1. **Call testing agent** (Status: Pending)
   - Provide comprehensive test plan covering:
     - Backend endpoints (upload, retrieve, search, list, handwriting upload)
     - Frontend upload flow (validation, progress, errors)
     - PDF viewer functionality (zoom, scroll, page navigation)
     - AI chat functionality (streaming, shape creation)
     - Handwriting frame capture (auto-frame, image upload)
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

## Success Criteria

### Phase 1 & 2 (ACHIEVED ✅)
- ✅ Real-time: Multiplayer collaboration via tldraw's useSyncDemo
- ✅ Persistence: Canvas state persists via tldraw's demo server
- ✅ AI Chat: Claude Sonnet 4 integration with streaming responses ON THE CANVAS
- ✅ PDF Upload: Complete upload infrastructure with vector storage
- ✅ UX: Canvas-first minimal UI with Inter font and tokenized colors

### Phase 3.1 & 3.2 (ACHIEVED ✅)
- ✅ Auto-frame: 's' keyboard shortcut creates frame around selected handwriting
- ✅ Positioning: Frame appears behind strokes (proper z-index)
- ✅ Behavior: Grouped frame is movable but not resizable
- ✅ Integration: Works with undo, delete, and multiplayer sync
- ✅ Image Capture: PNG snapshots captured automatically after framing
- ✅ Upload: Images uploaded to backend without blocking UI
- ✅ Storage: Files saved to organized directory structure

### Phase 3 Remaining (TARGET)
- PDF Viewer: PDFs render on canvas with zoom/scroll controls
- Real-time: Two or more clients observe each other's edits within 300ms median
- Presence: Users see each other's cursors with names and colors
- Stability: No crashes on malformed input; rate limits prevent abuse
- Performance: Batched operations, throttled cursor updates

### Phase 4 (TARGET)
- Export: PNG/SVG export working from UI
- Polish: Keyboard shortcuts, accessibility features, mobile responsive
- Reliability: Cold-start recovery verified, backups automated
- Tests: Comprehensive E2E suite with 95%+ pass rate

## Technical Stack

### Backend
- **Framework:** FastAPI 0.110.1
- **AI Integration:** emergentintegrations library
- **LLM:** Claude Sonnet 4 (via Emergent Universal LLM Key)
- **PDF Processing:** pdfplumber for text extraction
- **Chunking:** 1000 chars per chunk, 200 char overlap
- **Embeddings:** OpenAI text-embedding-3-small (1536 dims) via Emergent LLM key + litellm
- **Vector DB:** Supabase pgvector with HNSW index
- **Storage:** Supabase Storage bucket "pdfs" (public for development)
- **File Storage:** Local filesystem with aiofiles for handwriting images
- **Environment:** python-dotenv for config
- **Server:** uvicorn[standard] with WebSocket support

### Frontend
- **Canvas:** tldraw v4.1.2
- **Sync:** @tldraw/sync (useSyncDemo hook)
- **Framework:** React 19.0.0
- **Build:** Create React App
- **PDF Rendering:** react-pdf (10.2.0) + pdfjs-dist (5.4.394)
- **Styling:** Inline styles + Shadcn UI components
- **Text Shapes:** toRichText() helper for proper tldraw v4 format
- **Animations:** framer-motion (12.23.24)

### Infrastructure
- **Deployment:** Kubernetes cluster
- **Sync Server:** tldraw's demo server (https://demo.tldraw.xyz)
- **Preview URL:** https://collab-canvas-25.preview.emergentagent.com

### Backend Endpoints
- `GET /api/health` - Health check
- `POST /api/ask` - AI chat endpoint (Claude Sonnet 4)
  - Request: `{"prompt": "question"}`
  - Response: Server-Sent Events stream
  - Format: `data: {"content": "text"}\n\n`
  - Completion: `data: [DONE]\n\n`
- `POST /api/pdf/upload` - Upload PDF file
- `GET /api/pdf/{document_id}` - Get document metadata
- `POST /api/pdf/search` - Semantic search on PDF chunks
- `GET /api/pdf/documents` - List all documents
- `POST /api/handwriting-upload` - Upload handwriting frame image

## Keyboard Shortcuts

### Native TLDraw Shortcuts
- `V` - Select tool
- `D` - Draw tool
- `E` - Eraser tool
- `A` - Arrow tool
- `R` - Rectangle tool
- `O` - Ellipse tool
- `T` - Text tool
- `N` - Note tool
- `F` - Frame tool
- `⌘+Z` / `Ctrl+Z` - Undo
- `⌘+Shift+Z` / `Ctrl+Shift+Z` - Redo
- `⌘+A` / `Ctrl+A` - Select all
- `Delete` / `Backspace` - Delete selection
- `Cmd+K` / `Ctrl+K` - Focus AI prompt input

### Custom Shortcuts
- `S` - Auto-frame selected handwriting strokes + capture & upload image

## File Storage

### Handwriting Images
- **Directory:** `/app/backend/uploads/handwriting/`
- **Format:** PNG (2x scale)
- **Naming:** `{frameId}.png`
- **Created:** Automatically on 's' key press after framing
- **Access:** Local filesystem, expandable to cloud storage (S3, etc.)

### Environment Variables
- `EMERGENT_LLM_KEY` - Universal LLM key for Claude Sonnet 4 (backend/.env)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service role key
- `OPENAI_API_KEY` - OpenAI API key (via Emergent universal key)
- `REACT_APP_BACKEND_URL` - Backend API URL (frontend)

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

## Usage Instructions

### For Users
1. **Open the app:** https://collab-canvas-25.preview.emergentagent.com
2. **Start drawing:** Use the toolbar at the top to select tools
3. **Collaborate:** Share the URL with friends - they'll see your drawings in real-time
4. **Ask AI:** Press Cmd+K (Mac) or Ctrl+K (Windows) to focus the input at the bottom
5. **Get AI Response:** Type your question and press Enter
6. **See Response ON CANVAS:** A text shape appears with Claude Sonnet 4's streaming answer
7. **Upload PDF:** Click the upload button in the top-left to upload a PDF
8. **View PDF:** PDFs will render on the canvas (Phase 3 feature)
9. **Frame Handwriting:** Select handwriting strokes and press 's' to auto-frame and capture

### Keyboard Shortcuts
- `Cmd+K` / `Ctrl+K` - Focus AI prompt input
- `Enter` - Submit question (creates AI text shape on canvas)
- `V` - Select tool
- `D` - Draw tool
- `E` - Eraser tool
- `R` - Rectangle tool
- `O` - Ellipse tool
- `T` - Text tool
- `A` - Arrow tool
- `N` - Note/sticky tool

## Key Decisions Made

### 1. Simplified Architecture
**Decision:** Use tldraw's `useSyncDemo` instead of custom FastAPI backend for sync
**Rationale:** 
- Instant multiplayer with zero backend sync code
- Built-in user presence and cursors
- Automatic persistence via tldraw's cloud
- Reduced complexity
- More reliable (tldraw's production-tested sync)

### 2. AI Responses ON THE CANVAS
**Decision:** Create text shapes on the canvas instead of sidebar chat
**Rationale:**
- User explicitly requested "ON THE FUCKING CANVAS"
- AI responses become part of the collaborative canvas
- All users see AI responses in real-time (multiplayer sync)
- Responses can be moved, edited, deleted like any canvas object
- More integrated with the drawing experience
- Form at bottom doesn't interfere with tools at top

### 3. Claude Sonnet 4 via Emergent Key
**Decision:** Use Emergent Universal LLM Key instead of user-provided API key
**Rationale:**
- No API key management for users
- Instant access to Claude Sonnet 4
- Simplified onboarding
- Cost handled by platform

### 4. PDF Processing with litellm
**Decision:** Use litellm library instead of direct OpenAI client for embeddings
**Rationale:**
- Required for Emergent universal key support
- Works seamlessly once configured
- Handles Emergent key automatically

### 5. toRichText() for Text Shapes
**Decision:** Use tldraw's `toRichText()` helper instead of plain text
**Rationale:**
- tldraw v4 text shapes require `richText` prop (not `text`)
- Validation errors with plain text, note shapes, geo shapes
- `toRichText()` is the official v4 API for creating text content
- Ensures proper formatting and compatibility

### 6. Simulated Streaming
**Decision:** Chunk full responses instead of true streaming
**Rationale:**
- `emergentintegrations` library doesn't support streaming
- Simulated streaming provides smooth UX
- 10 char chunks with 20ms delay feels natural
- Maintains Server-Sent Events format for frontend

## Lessons Learned

### What Worked Well
1. **tldraw's useSyncDemo:** Instant multiplayer with minimal code
2. **Emergent Universal LLM Key:** Seamless Claude Sonnet 4 integration
3. **toRichText() API:** Proper way to create text shapes in tldraw v4
4. **Form positioning:** Bottom placement keeps tools accessible
5. **Real-time shape updates:** Streaming text updates work smoothly
6. **litellm Integration:** Works seamlessly once configured, handles Emergent key automatically
7. **Public Bucket:** Using public Supabase bucket simplifies development significantly

### Challenges Overcome
1. **Text shape validation errors:** 
   - Problem: text/note/geo shapes rejected `text` property
   - Solution: Use `richText` with `toRichText()` helper
2. **Environment variables:** 
   - Problem: EMERGENT_LLM_KEY not loading
   - Solution: Added python-dotenv and load_dotenv()
3. **Form blocking tools:**
   - Problem: Input covered bottom toolbar
   - Solution: Moved form to bottom, tools stay at top
4. **Streaming API mismatch:** 
   - Problem: No native streaming support
   - Solution: Implemented simulated streaming with chunking
5. **Emergent Universal Key Compatibility:**
   - Problem: Direct OpenAI client doesn't work with sk-emergent-* keys
   - Solution: Must use litellm library for compatibility

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
- ✅ Phase 1: Multiplayer canvas + POC infrastructure complete and Supabase configured
- ✅ Phase 2: AI Chat + Users can upload PDFs via web UI with progress tracking
- ⏳ Phase 3: PDFs render on canvas with zoom/scroll controls
- ⏳ Phase 4: All tests passing, no critical bugs, polished UX

## Conclusion

The multiplayer infinite canvas with AI chat and PDF upload is **partially complete**. Users can:
- Collaborate in real-time on an infinite canvas
- See each other's presence and changes instantly
- Ask Claude Sonnet 4 questions via Cmd+K
- See AI responses appear as TEXT SHAPES ON THE CANVAS
- Watch responses stream in real-time
- Upload PDFs with progress tracking
- Share the URL to invite friends
- All AI responses are synced across all users

**Status: IN PROGRESS - Phase 2 Complete, Phase 3 Ready to Start ✅**

## References
- **Design Guidelines:** `/app/design_guidelines.md`
- **Test Reports:** `/app/test_reports/iteration_1.json`
- **Preview URL:** https://collab-canvas-25.preview.emergentagent.com
- **tldraw Documentation:** https://tldraw.dev/docs
- **tldraw v4 API:** https://tldraw.dev/reference/editor
- **Auto-Frame Implementation:** `/app/frontend/src/components/Canvas.jsx` (autoFrameHandwriting function)
- **Upload Endpoint:** `/app/backend/server.py` (POST /api/handwriting-upload)
