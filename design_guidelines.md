{
  "meta": {
    "app_name": "Multiplayer Infinite Canvas with PDF Upload",
    "app_type": "Collaborative infinite canvas (tldraw) with embedded scrollable PDFs",
    "audience": "Product/design teams, educators, engineers collaborating in real time",
    "brand_attributes": ["professional", "precise", "calm", "confident", "utility-first"],
    "style_fusion": "Swiss typographic rigor + Minimalist functional UI; neutral slate surfaces with ocean blue accents; glassmorphism only for floating PDF controls"
  },
  "typography": {
    "font_pairing": {
      "headings": "Space Grotesk",
      "body": "Inter",
      "mono_optional": "Roboto Mono"
    },
    "css_imports": [
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap"
    ],
    "scale": {
      "h1": "text-4xl sm:text-5xl lg:text-6xl tracking-tight",
      "h2": "text-base md:text-lg font-semibold tracking-tight",
      "body": "text-sm md:text-base leading-6",
      "small": "text-xs leading-5"
    },
    "usage": {
      "canvas_labels": "font-medium text-[var(--slate-700)]",
      "controls": "text-xs text-[var(--slate-700)]",
      "pdf_page_number": "font-medium text-[var(--slate-900)] bg-white/90"
    }
  },
  "color_system": {
    "tokens": {
      "background": "var(--canvas-bg)",
      "surface": "var(--ui-bg)",
      "surface-muted": "var(--ui-bg-secondary)",
      "ink": "var(--slate-900)",
      "ink-muted": "var(--slate-500)",
      "border": "var(--slate-200)",
      "focus": "var(--accent-blue-500)",
      "primary": "var(--accent-blue-600)",
      "primary-quiet": "var(--accent-blue-100)",
      "success": "var(--success)",
      "warning": "var(--warning)",
      "error": "var(--error)"
    },
    "usage": {
      "canvas": "#FAFAFA or pure white; no gradients behind content",
      "topbar_toolbar": "White with subtle shadow var(--shadow-sm)",
      "pdf_controls": "White 88-94% opacity (glass) on hover, solid white at rest for WCAG",
      "selection": "Focus rings and active controls use var(--accent-blue-500/600)"
    },
    "contrast": "All interactive text/icons ≥ 4.5:1 on their background; large text icons ≥ 3:1"
  },
  "gradients_and_texture": {
    "allowed_areas": ["decorative canvas edge vignette (subtle)", "empty-state backdrop", "onboarding hero only"],
    "palette_samples": [
      "linear-gradient(135deg, #F8FBFF 0%, #F4F7FA 50%, #FFFFFF 100%)",
      "linear-gradient(180deg, #F6FAFE 0%, #FFFFFF 100%)"
    ],
    "texture_overlays": "Use a 2-3% opacity soft grain or grid texture image for top bars only to avoid flatness.",
    "restrictions": "Follow GRADIENT RESTRICTION RULE (see appendix). Never on reading areas or small UI elements. Max 20% viewport."
  },
  "css_design_tokens": {
    "note": "Add/ensure these CSS variables exist in :root (index.css already contains many).",
    "css": ":root{ --toolbar-height: 56px; --panel-radius: 12px; --panel-shadow: var(--shadow-md); --ring-width: 2px; --btn-radius: 8px; --btn-shadow: 0 2px 8px rgba(0,0,0,0.06); --elev-float: var(--shadow-floating);}"
  },
  "layout": {
    "grid": {
      "topbar": "Fixed top-left toolbar group aligned to tldraw toolbar. Spacing: px-3 md:px-4, gap-2.",
      "canvas": "Fill viewport (position: fixed; inset: 0). tldraw canvas underneath UI layers.",
      "pdf_shape_container": "A rounded-12 surface with shadow and internal ScrollArea. Controls docked top-right of shape."
    },
    "responsive": [
      "Mobile-first. Controls collapse into a single icon button with popover.",
      ">=768px shows inline zoom +/- and page indicator.",
      ">=1024px shows full control cluster with slider and page jump input."
    ]
  },
  "components": {
    "pdf_upload_entry": {
      "description": "Primary entry to upload PDFs, non-intrusive, placed near main toolbar.",
      "ui": "Use Button with variant=secondary + Tooltip. Clicking opens Dialog with file input and recent uploads.",
      "micro": "Hover: slight elevation and bg shift; Focus: 2px ring. Data-testid on both button and hidden input.",
      "example_jsx": "import { Button } from '@/components/ui/button';\nimport { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle } from '@/components/ui/dialog';\nimport { Progress } from '@/components/ui/progress';\nimport { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';\n\nexport const PdfUploadButton = ({ onFiles }) => (\n  <TooltipProvider>\n    <Dialog>\n      <Tooltip>\n        <TooltipTrigger asChild>\n          <DialogTrigger asChild>\n            <Button variant=\"secondary\" size=\"sm\" data-testid=\"pdf-upload-trigger-button\">Upload PDF</Button>\n          </DialogTrigger>\n        </TooltipTrigger>\n        <TooltipContent side=\"bottom\">Attach a PDF to the canvas</TooltipContent>\n      </Tooltip>\n      <DialogContent className=\"sm:max-w-md\">\n        <DialogHeader>\n          <DialogTitle>Upload PDF</DialogTitle>\n        </DialogHeader>\n        <input type=\"file\" accept=\"application/pdf\" multiple onChange={(e)=>onFiles?.(Array.from(e.target.files||[]))} className=\"mt-2\" data-testid=\"pdf-upload-input\" />\n        <div className=\"text-xs text-[var(--slate-500)] mt-2\">Max 50MB each</div>\n      </DialogContent>\n    </Dialog>\n  </TooltipProvider>\n);"
    },
    "upload_progress": {
      "description": "Toast + inline list for multiple concurrent uploads with cancel.",
      "ui": "Use Sonner for toasts. Progress for inline status in an Uploads sheet (optional).",
      "micro": "Live progress bar animates width; success morphs to check; error shakes slightly.",
      "example_jsx": "import { Toaster as SonnerToaster, toast } from '@/components/ui/sonner';\nimport { Progress } from '@/components/ui/progress';\nimport { Button } from '@/components/ui/button';\n\nexport const enqueueUploadToast = (fileName) => {\n  let progress = 0;\n  const id = toast(\"Uploading \" + fileName, { description: 'Starting...', duration: Infinity, dataTestId: 'upload-toast' });\n  return {\n    id,\n    update: (pct, desc) => toast.custom(() => (\n      <div data-testid=\"upload-toast-content\" className=\"w-64\">\n        <div className=\"text-sm font-medium\">{fileName}</div>\n        <div className=\"text-xs text-muted-foreground\">{desc || Math.round(pct) + '%'}\n        </div>\n        <Progress value={pct} className=\"mt-2\" />\n      </div>\n    ), { id }),\n    success: () => toast.success('Upload complete', { id, dataTestId: 'upload-success-toast' }),\n    error: (msg) => toast.error(msg || 'Upload failed', { id, dataTestId: 'upload-error-toast' })\n  }\n};"
    },
    "pdf_viewer_shape": {
      "description": "A draggable/resizable tldraw shape that renders a scrollable PDF via react-pdf inside a rounded surface with controls cluster.",
      "ui": "Wrap react-pdf's Document/Page in ScrollArea. Controls: ZoomOut, ZoomIn, CurrentScale, Page X/Y, Fit, Download, Close.",
      "micro": "Controls fade in on hover/focus, slide up slightly; page number pill subtly elevates during scroll.",
      "example_jsx": "import { ScrollArea } from '@/components/ui/scroll-area';\nimport { Button } from '@/components/ui/button';\nimport { Slider } from '@/components/ui/slider';\nimport { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';\nimport { Document, Page } from 'react-pdf';\nimport { motion } from 'framer-motion';\n\nexport const PdfShape = ({ fileUrl, scale, setScale, page, setPage, numPages }) => {\n  return (\n    <div className=\"relative bg-white rounded-xl shadow-lg border overflow-hidden\" data-testid=\"pdf-shape\">\n      <ScrollArea className=\"h-[480px] w-[360px] md:h-[640px] md:w-[480px] bg-white\" data-testid=\"pdf-scroll-area\">\n        <Document file={fileUrl} data-testid=\"pdf-document\">\n          <Page pageNumber={page} scale={scale} renderTextLayer={false} renderAnnotationLayer={false} />\n        </Document>\n      </ScrollArea>\n      <motion.div initial={{ opacity: 0, y: 8 }} whileHover={{ opacity: 1, y: 0 }} whileFocus={{ opacity: 1, y: 0 }} className=\"absolute top-2 right-2 bg-white/90 backdrop-blur rounded-lg shadow p-1.5 flex items-center gap-1\" data-testid=\"pdf-controls\">\n        <Tooltip><TooltipTrigger asChild><Button size=\"icon\" variant=\"secondary\" onClick={()=>setScale(Math.max(0.5, scale-0.1))} data-testid=\"pdf-zoom-out-button\">-</Button></TooltipTrigger><TooltipContent>Zoom out</TooltipContent></Tooltip>\n        <div className=\"w-24 px-2\"><Slider min={0.5} max={2} step={0.1} value={[scale]} onValueChange={(v)=>setScale(v[0])} data-testid=\"pdf-zoom-slider\"/></div>\n        <Tooltip><TooltipTrigger asChild><Button size=\"icon\" variant=\"secondary\" onClick={()=>setScale(Math.min(2, scale+0.1))} data-testid=\"pdf-zoom-in-button\">+</Button></TooltipTrigger><TooltipContent>Zoom in</TooltipContent></Tooltip>\n      </motion.div>\n      <div className=\"absolute bottom-2 right-2 text-[11px] px-2 py-1 rounded-md bg-white shadow border\" data-testid=\"pdf-page-indicator\">{page} / {numPages}</div>\n    </div>\n  );\n};"
    },
    "error_states": {
      "description": "User-friendly error banners and toasts for failed uploads or PDF render errors.",
      "ui": "Toast via Sonner + inline error banner inside the PdfShape surface (red border, retry button).",
      "example_jsx": "import { toast } from '@/components/ui/sonner';\nimport { Button } from '@/components/ui/button';\n\nexport const PdfError = ({ message, onRetry }) => (\n  <div className=\"border border-red-200 bg-red-50 text-red-700 text-sm p-3 rounded-md flex items-center justify-between\" data-testid=\"pdf-error-banner\">\n    <span>{message || 'Unable to render PDF'}</span>\n    <Button size=\"sm\" variant=\"outline\" onClick={onRetry} data-testid=\"pdf-error-retry-button\">Retry</Button>\n  </div>\n);\n\nexport const notifyUploadError = (msg) => toast.error(msg || 'Upload failed', { dataTestId: 'upload-error-toast' });"
    }
  },
  "micro_interactions": {
    "principles": [
      "Purposeful, not flashy; 150–250ms ease-out for hover/focus",
      "Entrance: subtle fade+rise for floating controls",
      "No layout shift during control reveal"
    ],
    "framer_motion": {
      "install": "yarn add framer-motion",
      "usage": "Use motion.div for controls containers; animate presence for appear/disappear"
    },
    "scroll_feedback": "Add a thin progress bar at the right edge of PdfShape reflecting scroll position (absolute h-full w-[3px] bg-primary/20 with inner bar)."
  },
  "accessibility": {
    "keyboard": [
      "Upload: Enter/Space triggers Button; file input focusable",
      "PDF shape: Tab cycles to control cluster; Esc closes any Dialog",
      "Zoom keyboard shortcuts: Ctrl/Cmd + +/-; announce via aria-live"
    ],
    "aria": {
      "pdf_document": "role=document aria-label='PDF viewer'",
      "page_indicator": "aria-live=polite"
    },
    "contrast": "Maintain WCAG AA; avoid semi-transparent text over images"
  },
  "data_testid_guidelines": {
    "rule": "Every interactive and key informational element must include a data-testid describing its role in kebab-case.",
    "examples": [
      "data-testid=\"pdf-upload-trigger-button\"",
      "data-testid=\"pdf-upload-input\"",
      "data-testid=\"upload-toast\"",
      "data-testid=\"pdf-shape\"",
      "data-testid=\"pdf-controls\"",
      "data-testid=\"pdf-zoom-in-button\"",
      "data-testid=\"pdf-page-indicator\"",
      "data-testid=\"pdf-error-banner\""
    ]
  },
  "libraries_and_integrations": {
    "tldraw": {
      "usage": "Mount PdfShape within a custom tldraw ShapeUtil; treat fileUrl as asset; lock aspect ratio by first page dimensions.",
      "notes": "Controls should live in HTML overlay layer above canvas to avoid hit-testing conflicts."
    },
    "react_pdf": {
      "install": "yarn add react-pdf",
      "note": "Disable text/annotation layers for performance; implement your own highlights later.",
      "performance": "Lazy load pages; memoize Document; keep scale between 0.5 and 2"
    },
    "supabase_storage": {
      "install": "yarn add @supabase/supabase-js",
      "upload_pattern": "Use upload with onUploadProgress to update Sonner + inline Progress. Provide cancel via AbortController.",
      "example": "const controller = new AbortController(); const { data, error } = await supabase.storage.from('pdfs').upload(path, file, { signal: controller.signal, onUploadProgress: (e)=> updater.update((e.loaded*100)/e.total) });"
    }
  },
  "tailwind_recipes": {
    "pdf_controls_container": "absolute top-2 right-2 bg-white/90 backdrop-blur-sm rounded-lg shadow-md border p-1.5 flex items-center gap-1",
    "page_number_pill": "absolute bottom-2 right-2 text-[11px] px-2 py-1 rounded-md bg-white shadow border",
    "upload_button": "h-9 px-3 rounded-md border bg-white hover:bg-[var(--accent)]/10 focus-visible:ring-2 ring-[var(--accent-blue-500)]"
  },
  "responsive_patterns": [
    "On mobile, collapse zoom slider into +/- only; page indicator stays.",
    "On tablet and up, show slider and percentage label.",
    "Controls never exceed 14% of PdfShape width."
  ],
  "empty_states": {
    "canvas": "A small inline card near toolbar: ‘Upload a PDF to start’ with ghost secondary button.",
    "pdf_shape": "When file missing, show PdfError with Retry/Replace"
  },
  "component_path": [
    { "name": "Button", "path": "@/components/ui/button.jsx" },
    { "name": "Dialog", "path": "@/components/ui/dialog.jsx" },
    { "name": "Progress", "path": "@/components/ui/progress.jsx" },
    { "name": "Tooltip", "path": "@/components/ui/tooltip.jsx" },
    { "name": "ScrollArea", "path": "@/components/ui/scroll-area.jsx" },
    { "name": "Slider", "path": "@/components/ui/slider.jsx" },
    { "name": "Sheet (optional Uploads panel)", "path": "@/components/ui/sheet.jsx" },
    { "name": "Sonner Toaster", "path": "@/components/ui/sonner.jsx" }
  ],
  "image_urls": [
    {
      "url": "https://images.unsplash.com/photo-1573671524049-1b9a7be3b9d6?crop=entropy&cs=srgb&fm=jpg&q=85",
      "category": "subtle-grid-texture",
      "placement": "Optional top toolbar background at 2–3% opacity as overlay",
      "description": "Grey chain link-like grid for a faint structure"
    },
    {
      "url": "https://images.unsplash.com/photo-1759185301753-e63dd521c597?crop=entropy&cs=srgb&fm=jpg&q=85",
      "category": "soft-fabric-noise",
      "placement": "Use as 2% overlay in dialogs to avoid flatness",
      "description": "Dark gray woven texture (use very subtle)"
    },
    {
      "url": "https://images.unsplash.com/photo-1752323497388-d9ff82994e94?crop=entropy&cs=srgb&fm=jpg&q=85",
      "category": "herringbone",
      "placement": "Do not place behind reading; only as tiny decorative strip in empty state",
      "description": "Light herringbone pattern"
    }
  ],
  "instructions_to_main_agent": [
    "1) Ensure index.css :root variables exist (already present) and add css_design_tokens if missing.",
    "2) Place PdfUploadButton near existing tldraw toolbar (top-left).", 
    "3) Implement Supabase upload flow using enqueueUploadToast for progress, adding data-testid attributes exactly as in examples.",
    "4) Create PdfShape and integrate into tldraw as a custom shape or as an overlay component; ensure hit-testing passes through when necessary.",
    "5) Use ScrollArea for PDF content; add right-edge scroll progress indicator.",
    "6) Add Sonner Toaster once at root (index.js or App.js).",
    "7) Respect GRADIENT RESTRICTION RULE; no saturated gradients; keep surfaces solid white.",
    "8) All interactive elements and key messages must include data-testid attributes following kebab-case role naming.",
    "9) Mobile-first: collapse controls; verify touch targets ≥ 40px."
  ]
}


<General UI UX Design Guidelines>  
    - You must **not** apply universal transition. Eg: `transition: all`. This results in breaking transforms. Always add transitions for specific interactive elements like button, input excluding transforms
    - You must **not** center align the app container, ie do not add `.App { text-align: center; }` in the css file. This disrupts the human natural reading flow of text
   - NEVER: use AI assistant Emoji characters like`🤖🧠💭💡🔮🎯📚🎭🎬🎪🎉🎊🎁🎀🎂🍰🎈🎨🎰💰💵💳🏦💎🪙💸🤑📊📈📉💹🔢🏆🥇 etc for icons. Always use **FontAwesome cdn** or **lucid-react** library already installed in the package.json

 **GRADIENT RESTRICTION RULE**
NEVER use dark/saturated gradient combos (e.g., purple/pink) on any UI element.  Prohibited gradients: blue-500 to purple 600, purple 500 to pink-500, green-500 to blue-500, red to pink etc
NEVER use dark gradients for logo, testimonial, footer etc
NEVER let gradients cover more than 20% of the viewport.
NEVER apply gradients to text-heavy content or reading areas.
NEVER use gradients on small UI elements (<100px width).
NEVER stack multiple gradient layers in the same viewport.

**ENFORCEMENT RULE:**
    • Id gradient area exceeds 20% of viewport OR affects readability, **THEN** use solid colors

**How and where to use:**
   • Section backgrounds (not content backgrounds)
   • Hero section header content. Eg: dark to light to dark color
   • Decorative overlays and accent elements only
   • Hero section with 2-3 mild color
   • Gradients creation can be done for any angle say horizontal, vertical or diagonal

- For AI chat, voice application, **do not use purple color. Use color like light green, ocean blue, peach orange etc**

</Font Guidelines>

- Every interaction needs micro-animations - hover states, transitions, parallax effects, and entrance animations. Static = dead. 
   
- Use 2-3x more spacing than feels comfortable. Cramped designs look cheap.

- Subtle grain textures, noise overlays, custom cursors, selection states, and loading animations: separates good from extraordinary.
   
- Before generating UI, infer the visual style from the problem statement (palette, contrast, mood, motion) and immediately instantiate it by setting global design tokens (primary, secondary/accent, background, foreground, ring, state colors), rather than relying on any library defaults. Don't make the background dark as a default step, always understand problem first and define colors accordingly
    Eg: - if it implies playful/energetic, choose a colorful scheme
           - if it implies monochrome/minimal, choose a black–white/neutral scheme

**Component Reuse:**
	- Prioritize using pre-existing components from src/components/ui when applicable
	- Create new components that match the style and conventions of existing components when needed
	- Examine existing components to understand the project's component patterns before creating new ones

**IMPORTANT**: Do not use HTML based component like dropdown, calendar, toast etc. You **MUST** always use `/app/frontend/src/components/ui/ ` only as a primary components as these are modern and stylish component

**Best Practices:**
	- Use Shadcn/UI as the primary component library for consistency and accessibility
	- Import path: ./components/[component-name]

**Export Conventions:**
	- Components MUST use named exports (export const ComponentName = ...)
	- Pages MUST use default exports (export default function PageName() {...})

**Toasts:**
  - Use `sonner` for toasts"
  - Sonner component are located in `/app/src/components/ui/sonner.tsx`

Use 2–4 color gradients, subtle textures/noise overlays, or CSS-based noise to avoid flat visuals.
</General UI UX Design Guidelines>
