import React, { useRef, useMemo } from 'react';
import { Tldraw } from 'tldraw';
import { useSyncDemo } from '@tldraw/sync';
import { createShapeId } from '@tldraw/editor';
import 'tldraw/tldraw.css';

export default function Canvas() {
  // Use tldraw's built-in demo sync
  const store = useSyncDemo({
    roomId: 'default',
  });

  // Store editor instance
  const editorRef = useRef(null);

  // Handle editor mount
  const handleMount = (editor) => {
    editorRef.current = editor;
  };

  // Helper function to auto-frame handwriting strokes
  const autoFrameHandwriting = (editor) => {
    if (!editor) return;

    // Get selected shape IDs
    const selectedIds = editor.getSelectedShapeIds();
    if (selectedIds.length === 0) return;

    // Filter to handwriting shapes (draw strokes that aren't closed)
    const handwritingIds = [];
    const handwritingShapes = [];
    for (const id of selectedIds) {
      const shape = editor.getShape(id);
      if (!shape) continue;
      
      // Check if it's a draw shape that's not closed
      if (shape.type === 'draw' && !shape.props.isClosed) {
        handwritingIds.push(id);
        handwritingShapes.push(shape);
      }
    }

    if (handwritingIds.length === 0) return;

    // Get bounds of selected handwriting shapes
    const bounds = editor.getShapePageBounds(handwritingIds[0]);
    if (!bounds) return;

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

    // Wrap all operations in editor.run for proper history/sync
    editor.run(() => {
      // Get the lowest index from handwriting shapes to place frame behind
      const lowestIndex = handwritingShapes.reduce((lowest, shape) => {
        return shape.index < lowest ? shape.index : lowest;
      }, handwritingShapes[0].index);

      // Create frame shape with index behind all strokes
      const frameId = createShapeId();
      editor.createShape({
        id: frameId,
        type: 'frame',
        x: minX,
        y: minY,
        index: `a${lowestIndex}`, // Place frame behind by prepending to index
        props: {
          w: frameWidth,
          h: frameHeight,
          name: 'Handwriting Frame',
        },
      });

      // Reparent handwriting strokes into the frame
      editor.reparentShapes(handwritingIds, frameId);

      // Group the frame and all strokes
      editor.groupShapes([frameId, ...handwritingIds]);

      // Select the frame (which now contains all the grouped strokes)
      editor.select(frameId);
    });
  };

  // Define custom overrides for keyboard shortcuts
  const overrides = useMemo(() => ({
    actions(editor, actions) {
      return {
        ...actions,
        'auto-frame-handwriting': {
          id: 'auto-frame-handwriting',
          label: 'Frame Handwriting',
          kbd: 's',
          onSelect() {
            autoFrameHandwriting(editor);
          },
        },
      };
    },
  }), []);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw 
        store={store} 
        onMount={handleMount}
        overrides={overrides}
      />
    </div>
  );
}
