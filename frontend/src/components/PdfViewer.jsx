import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { ZoomIn, ZoomOut, X, ChevronLeft, ChevronRight } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker - use CDN with https
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export const PdfViewer = ({ documentUrl, documentId, onClose, position = { x: 100, y: 100 } }) => {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setLoading(false);
  };

  const onDocumentLoadError = (error) => {
    console.error('Error loading PDF:', error);
    setLoading(false);
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.2, 2.0));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.2, 0.5));
  };

  const goToPreviousPage = () => {
    setPageNumber(prev => Math.max(prev - 1, 1));
  };

  const goToNextPage = () => {
    setPageNumber(prev => Math.min(prev + 1, numPages));
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: '600px',
        maxHeight: '80vh',
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        overflow: 'hidden'
      }}
      data-testid="pdf-viewer-container"
    >
      {/* Header with controls */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#f8fafc',
        gap: '8px'
      }}>
        {/* Zoom controls */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
            data-testid="pdf-zoom-out-button"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleZoomIn}
            disabled={scale >= 2.0}
            data-testid="pdf-zoom-in-button"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <span style={{
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            fontSize: '14px',
            fontWeight: '500',
            color: '#64748b'
          }}>
            {Math.round(scale * 100)}%
          </span>
        </div>

        {/* Page navigation */}
        {numPages && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={goToPreviousPage}
              disabled={pageNumber <= 1}
              data-testid="pdf-prev-page-button"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span style={{
              padding: '0 12px',
              fontSize: '14px',
              fontWeight: '500',
              color: '#334155'
            }}>
              {pageNumber} / {numPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={goToNextPage}
              disabled={pageNumber >= numPages}
              data-testid="pdf-next-page-button"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Close button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          data-testid="pdf-close-button"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* PDF content */}
      <ScrollArea style={{ flex: 1, padding: '16px' }}>
        {loading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '400px',
            color: '#64748b'
          }} data-testid="pdf-loading">
            Loading PDF...
          </div>
        )}
        <Document
          file={documentUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading=""
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>
      </ScrollArea>
    </div>
  );
};