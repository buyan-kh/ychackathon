import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Tldraw, DefaultToolbar, TldrawUiMenuItem, useEditor } from 'tldraw';
import { useSyncDemo } from '@tldraw/sync';
import { createShapeId } from '@tldraw/editor';
import PromptInput from './PromptInput';
import { PdfUploadButton } from './PdfUploadButton';
import { PdfShapeUtil } from '../shapeUtils/PdfShapeUtil';
import { VideoCallShapeUtil } from '../shapeUtils/VideoCallShapeUtil';
import { C1ResponseShapeUtil } from '../shapeUtils/C1ResponseShapeUtil';
import axios from 'axios';
import 'tldraw/tldraw.css';

const FOCUS_EVENT_NAME = 'focus-prompt-input';
const DEFAULT_ROOM_ID = 'default';

function CustomUI() {
  return (
    <>
      <PromptInput focusEventName={FOCUS_EVENT_NAME} />
    </>
  );
}

const components = {
  Toolbar: () => {
    return (
      <div style={{ position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)' }}>
        <DefaultToolbar />
      </div>
    );
  },
  InFrontOfTheCanvas: CustomUI,
};

// Custom shape utilities
const customShapeUtils = [PdfShapeUtil, VideoCallShapeUtil, C1ResponseShapeUtil];

export default function Canvas() {
  const editorRef = useRef(null);

  // Use tldraw's built-in demo sync with custom shapes
  const store = useSyncDemo({
    roomId: DEFAULT_ROOM_ID,
    shapeUtils: customShapeUtils,
  });

  // Handle video call join - create as draggable canvas shape
  const handleJoinVideoCall = async () => {
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
      const response = await axios.post(`${backendUrl}/api/video/room`, {
        room_id: DEFAULT_ROOM_ID
      });

      // Create a video call shape on the canvas
      if (editorRef.current) {
        const editor = editorRef.current;
        const shapeId = createShapeId();

        // Get viewport center
        const viewport = editor.getViewportPageBounds();
        const centerX = viewport.x + viewport.w / 2;
        const centerY = viewport.y + viewport.h / 2;

        editor.createShape({
          id: shapeId,
          type: 'video-call',
          x: centerX - 400, // Center the shape (half of default width)
          y: centerY - 300, // Center the shape (half of default height)
          props: {
            roomUrl: response.data.url,
            w: 800,
            h: 600,
          },
        });

        // Select the newly created shape
        editor.setSelectedShapes([shapeId]);
      }
    } catch (error) {
      console.error('Failed to get video room:', error);
      alert('Failed to join video call. Please try again.');
    }
  };


  // Register Cmd+K shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        window.dispatchEvent(new Event(FOCUS_EVENT_NAME));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle editor mount
  const handleMount = (editor) => {
    editorRef.current = editor;
    
    // Add listener to prevent resizing of groups with noResize meta flag
    editor.sideEffects.registerBeforeChangeHandler('shape', (prev, next) => {
      // Check if this is a group with noResize flag
      if (next.type === 'group' && next.meta?.noResize) {
        // If size changed, revert to previous size
        // Groups don't have w/h props directly, so we check if any child transformations happened
        // For groups, we just prevent the resize by returning the previous state
        // But allow position changes
        if (prev && (prev.x !== next.x || prev.y !== next.y)) {
          // Allow movement
          return next;
        }
        // For any other changes, keep the previous state to prevent resize
        if (prev && prev.rotation === next.rotation) {
          return { ...next, x: prev.x || next.x, y: prev.y || next.y };
        }
      }
      return next;
    });
  };

  const handleUploadSuccess = (documentData) => {
    console.log('PDF uploaded successfully:', documentData);

    // Create a PDF shape on the canvas
    if (editorRef.current) {
      const editor = editorRef.current;
      const shapeId = createShapeId();

      // Get viewport center using viewportPageBounds
      const viewport = editor.getViewportPageBounds();
      const centerX = viewport.x + viewport.w / 2;
      const centerY = viewport.y + viewport.h / 2;

      editor.createShape({
        id: shapeId,
        type: 'pdf-viewer',
        x: centerX - 300, // Center the shape (half of default width)
        y: centerY - 400, // Center the shape (half of default height)
        props: {
          documentUrl: documentData.public_url,
          documentId: documentData.document_id,
          filename: documentData.filename,
          w: 600,
          h: 800,
        },
      });

      // Select the newly created shape
      editor.setSelectedShapes([shapeId]);
    }
  };

  // Helper function to auto-frame handwriting strokes and capture image
  const autoFrameHandwriting = async (editor) => {
    if (!editor) return null;

    // Get selected shape IDs
    const selectedIds = editor.getSelectedShapeIds();
    if (selectedIds.length === 0) return null;

    // Filter to handwriting shapes (draw strokes that aren't closed)
    const handwritingIds = [];
    for (const id of selectedIds) {
      const shape = editor.getShape(id);
      if (!shape) continue;
      
      // Check if it's a draw shape that's not closed
      if (shape.type === 'draw' && !shape.props.isClosed) {
        handwritingIds.push(id);
      }
    }

    if (handwritingIds.length === 0) return null;

    // Get bounds of selected handwriting shapes
    const bounds = editor.getShapePageBounds(handwritingIds[0]);
    if (!bounds) return null;

    // Calculate bounding box for all selected shapes
    let minX = bounds.x;
    let minY = bounds.y;
    let maxX = bounds.x + bounds.w;
    let maxY = bounds.y + bounds.h;

    for (let i = 1; i < handwritingIds.length; i++) {
      const shapeBounds = editor.getShapePageBounds(handwritingIds[i]);
      if (!shapeBounds) continue;
      
      minX = Math.min(minX, shapeBounds.x);
      minY = Math.min(minY, shapeBounds.y);
      maxX = Math.max(maxX, shapeBounds.x + shapeBounds.w);
      maxY = Math.max(maxY, shapeBounds.y + shapeBounds.h);
    }

    // Add padding
    const padding = 20;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const frameWidth = maxX - minX;
    const frameHeight = maxY - minY;
    const boundsPayload = {
      x: minX,
      y: minY,
      w: frameWidth,
      h: frameHeight,
    };

    let frameId = null;
    let captureIds = [];
    let groupId = null;

    // Wrap all operations in editor.run for proper history/sync
    editor.run(() => {
      // Create frame shape
      frameId = createShapeId();
      editor.createShape({
        id: frameId,
        type: 'frame',
        x: minX,
        y: minY,
        props: {
          w: frameWidth,
          h: frameHeight,
          name: 'Handwriting Frame',
        },
      });

      // Send frame to back so it appears behind the strokes
      editor.sendToBack([frameId]);

      // Reparent handwriting strokes into the frame
      editor.reparentShapes(handwritingIds, frameId);

      captureIds = [frameId, ...handwritingIds];

      // Group the frame and all strokes (tldraw auto-selects the group)
      groupId = editor.groupShapes(captureIds);

      // Lock the group shape to prevent resizing (only allow moving)
      if (groupId) {
        editor.updateShape({
          id: groupId,
          type: 'group',
          meta: {
            noResize: true,
          },
        });
      }

      // Note: No need to manually select - tldraw automatically selects the group after groupShapes()
    });

    if (!frameId) {
      return null;
    }

    return {
      frameId,
      groupId,
      captureIds,
      handwritingIds,
      bounds: boundsPayload,
    };
  };

  // Helper function to capture and upload frame image
  const captureAndUploadFrame = async (editor, capturePayload, roomId = DEFAULT_ROOM_ID) => {
    if (!editor || !capturePayload) return;

    const { frameId, captureIds } = capturePayload;
    const idsToExport = captureIds?.length ? captureIds : frameId ? [frameId] : [];

    if (!idsToExport.length) return;

    try {
      console.log('Starting frame capture for ids:', idsToExport.join(', '));
      
      // Give tldraw a moment to render the frame
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Capture frame as blob using tldraw's export helpers
      const imageResult = await editor.toImage(idsToExport, {
        format: 'png',
        background: true,
        pixelRatio: 2,
        padding: 0,
      });

      const blob = imageResult?.blob;

      if (!blob) {
        console.error('Failed to capture frame image - blob is null');
        return;
      }

      console.log('Frame captured, blob size:', blob.size);

      // Upload to backend
      const formData = new FormData();

      if (typeof File !== 'undefined') {
        const file = new File([blob], `${frameId || 'handwriting-note'}.png`, {
          type: 'image/png',
        });
        formData.append('file', file);
      } else {
        formData.append('file', blob, `${frameId || 'handwriting-note'}.png`);
      }

      if (frameId) {
        formData.append('frameId', frameId);
      }
      formData.append('timestamp', new Date().toISOString());
      if (capturePayload?.bounds) {
        formData.append('bounds', JSON.stringify(capturePayload.bounds));
      }
      if (capturePayload?.handwritingIds?.length) {
        formData.append('handwritingShapeIds', JSON.stringify(capturePayload.handwritingIds));
      }
      if (capturePayload?.groupId) {
        formData.append('groupId', capturePayload.groupId);
      }
      if (roomId) {
        formData.append('roomId', roomId);
      }

      const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
      if (!backendUrl) {
        console.warn('REACT_APP_BACKEND_URL is not set; skipping handwriting upload.');
        return;
      }
      const uploadUrl = `${backendUrl}/api/handwriting-upload`;
      console.log('Uploading handwriting snapshot to:', uploadUrl);
      
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorText = '';
        try {
          const errorClone = response.clone();
          errorText = await errorClone.text();
        } catch (cloneError) {
          console.warn('Failed to read handwriting upload error body', cloneError);
        }
        throw new Error(
          `Upload failed (${response.status}): ${response.statusText}${errorText ? ` - ${errorText}` : ''}`
        );
      }

      let data = null;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.warn('Handwriting upload response is not JSON', jsonError);
      }
      console.log('Frame uploaded successfully:', data);

    } catch (error) {
      console.error('Error capturing or uploading frame:', error);
      // Don't block UI - just log the error
    }
  };

  // Define custom overrides for keyboard shortcuts and component behavior
  const overrides = useMemo(() => ({
    actions(editor, actions) {
      return {
        ...actions,
        'auto-frame-handwriting': {
          id: 'auto-frame-handwriting',
          label: 'Frame Handwriting',
          kbd: 's',
          async onSelect() {
            // Create frame and group
            const frameData = await autoFrameHandwriting(editor);

            // If frame was created, capture and upload image
            if (frameData) {
              await captureAndUploadFrame(editor, frameData, DEFAULT_ROOM_ID);
            }
          },
        },
      };
    },
  }), []);

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
      </div>

      {/* Video call button overlay */}
      <div style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        zIndex: 1000
      }}>
        <button
          onClick={handleJoinVideoCall}
          style={{
            padding: '10px 16px',
            background: '#3B82F6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.target.style.background = '#2563EB';
            e.target.style.transform = 'translateY(-1px)';
            e.target.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = '#3B82F6';
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.3)';
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 7l-7 5 7 5V7z" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          Join Video Call
        </button>
      </div>

      {/* tldraw canvas */}
      <Tldraw
        store={store}
        components={components}
        onMount={handleMount}
        overrides={overrides}
        shapeUtils={customShapeUtils}
      />

    </div>
  );
}
