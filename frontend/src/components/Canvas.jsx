import React, { useState } from 'react';
import { Tldraw } from 'tldraw';
import { useSyncDemo } from '@tldraw/sync';
import { PdfUploadButton } from './PdfUploadButton';
import 'tldraw/tldraw.css';

export default function Canvas() {
  const [uploadedDocuments, setUploadedDocuments] = useState([]);

  // Use tldraw's built-in demo sync
  const store = useSyncDemo({
    roomId: 'default',
  });

  const handleUploadSuccess = (documentData) => {
    console.log('PDF uploaded successfully:', documentData);
    setUploadedDocuments(prev => [...prev, documentData]);
    // TODO: Create PDF shape on canvas in Phase 3
  };

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      {/* Upload button overlay */}
      <div style={{
        position: 'absolute',
        top: '16px',
        left: '16px',
        zIndex: 1000,
        display: 'flex',
        gap: '8px',
        alignItems: 'center'
      }}>
        <PdfUploadButton onUploadSuccess={handleUploadSuccess} />
        {uploadedDocuments.length > 0 && (
          <div style={{
            padding: '8px 12px',
            background: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            fontSize: '12px',
            fontWeight: '500',
            color: '#64748B'
          }}>
            {uploadedDocuments.length} PDF{uploadedDocuments.length !== 1 ? 's' : ''} uploaded
          </div>
        )}
      </div>
      
      {/* tldraw canvas */}
      <Tldraw store={store} />
    </div>
  );
}