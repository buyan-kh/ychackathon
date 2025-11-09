import type { Editor, TLShapeId } from 'tldraw';

export function getOptimalShapePosition(
  editor: Editor,
  options: { width: number; height: number; padding?: number }
) {
  const { width, height, padding = 50 } = options;
  
  // Get viewport bounds
  const viewportPageBounds = editor.getViewportPageBounds();
  
  // Position in center of viewport
  const x = viewportPageBounds.x + (viewportPageBounds.w - width) / 2;
  const y = viewportPageBounds.y + (viewportPageBounds.h - height) / 2;
  
  return { x, y };
}

export function centerCameraOnShape(
  editor: Editor,
  shapeId: TLShapeId,
  options?: { duration?: number }
) {
  const { duration = 200 } = options || {};
  
  const shape = editor.getShape(shapeId);
  if (!shape) return;
  
  editor.zoomToSelection([shapeId], {
    duration,
    inset: 100,
  });
}