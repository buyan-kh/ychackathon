import { BaseBoxShapeUtil, HTMLContainer } from 'tldraw';
import React, { memo, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Memoized PDF viewer component
const PdfViewerComponent = memo(({ shape }) => {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const documentUrl = shape.props.documentUrl;
  const documentId = shape.props.documentId;
  const filename = shape.props.filename || 'document.pdf';

  const onDocumentLoadSuccess = ({ numPages }) => {
    console.log('PDF loaded successfully:', documentUrl, 'Pages:', numPages);
    setNumPages(numPages);
    setLoading(false);
  };

  const onDocumentLoadError = (error) => {
    console.error('Error loading PDF:', error);
    console.error('Document URL:', documentUrl);
    console.error('Error details:', error.message, error);
    setError(error.message || 'Failed to load PDF');
    setLoading(false);
  };

  // Log when component mounts
  React.useEffect(() => {
    console.log('PdfViewerComponent mounted with URL:', documentUrl);
    console.log('Document ID:', documentId);
    console.log('Filename:', filename);
  }, [documentUrl, documentId, filename]);

  const goToPrevPage = () => {
    setPageNumber(prev => Math.max(1, prev - 1));
  };

  const goToNextPage = () => {
    setPageNumber(prev => Math.min(numPages || prev, prev + 1));
  };

  // Calculate scale to fit PDF in shape bounds
  const scale = Math.min(shape.props.w / 600, shape.props.h / 800);

  if (error) {
    return (
      <HTMLContainer>
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FEF2F2',
          borderRadius: '8px',
          border: '1px solid #FCA5A5',
          padding: '20px'
        }}>
          <div style={{
            textAlign: 'center',
            color: '#DC2626'
          }}>
            <p style={{ fontWeight: '600', marginBottom: '8px' }}>Error loading PDF</p>
            <p style={{ fontSize: '14px' }}>{error}</p>
          </div>
        </div>
      </HTMLContainer>
    );
  }

  return (
    <HTMLContainer style={{
      display: 'flex',
      flexDirection: 'column',
      background: 'white',
      borderRadius: '8px',
      border: '1px solid #E5E7EB',
      overflow: 'hidden',
      pointerEvents: 'all'
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #E5E7EB',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#F9FAFB',
        flexShrink: 0
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          overflow: 'hidden'
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#111827',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {filename}
          </span>
        </div>
      </div>

      {/* PDF Content */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'auto',
        background: '#F3F4F6',
        padding: '16px',
        position: 'relative'
      }}>
        {loading && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            zIndex: 10
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              border: '3px solid #E5E7EB',
              borderTopColor: '#3B82F6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <p style={{ fontSize: '14px', color: '#6B7280' }}>Loading PDF...</p>
          </div>
        )}
        <Document
          file={{
            url: documentUrl,
            httpHeaders: {
              'Access-Control-Allow-Origin': '*',
            },
            withCredentials: false,
          }}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading=""
          options={{
            cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
            cMapPacked: true,
            standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
          }}
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            loading=""
          />
        </Document>
      </div>

      {/* Footer with controls */}
      {numPages && numPages > 1 && (
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #E5E7EB',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          background: '#F9FAFB',
          flexShrink: 0
        }}>
          <button
            onClick={goToPrevPage}
            disabled={pageNumber <= 1}
            style={{
              padding: '6px 12px',
              background: pageNumber <= 1 ? '#F3F4F6' : 'white',
              border: '1px solid #E5E7EB',
              borderRadius: '6px',
              cursor: pageNumber <= 1 ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              color: pageNumber <= 1 ? '#9CA3AF' : '#111827',
              fontWeight: '500'
            }}
          >
            ←
          </button>
          <span style={{
            fontSize: '14px',
            color: '#6B7280',
            minWidth: '80px',
            textAlign: 'center'
          }}>
            {pageNumber} / {numPages}
          </span>
          <button
            onClick={goToNextPage}
            disabled={pageNumber >= numPages}
            style={{
              padding: '6px 12px',
              background: pageNumber >= numPages ? '#F3F4F6' : 'white',
              border: '1px solid #E5E7EB',
              borderRadius: '6px',
              cursor: pageNumber >= numPages ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              color: pageNumber >= numPages ? '#9CA3AF' : '#111827',
              fontWeight: '500'
            }}
          >
            →
          </button>
        </div>
      )}
    </HTMLContainer>
  );
});

PdfViewerComponent.displayName = 'PdfViewerComponent';

export class PdfShapeUtil extends BaseBoxShapeUtil {
  static type = 'pdf-viewer';

  getDefaultProps() {
    return {
      w: 600,
      h: 800,
      documentUrl: '',
      documentId: '',
      filename: 'document.pdf'
    };
  }

  onResize = (shape, info) => {
    const { scaleX, scaleY } = info;
    return {
      props: {
        ...shape.props,
        w: Math.max(300, shape.props.w * scaleX),
        h: Math.max(400, shape.props.h * scaleY),
      },
    };
  };

  component = (shape) => {
    return <PdfViewerComponent shape={shape} />;
  };

  indicator(shape) {
    return <rect width={shape.props.w} height={shape.props.h} />;
  }
}

// Add spin animation
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}
