export function getOptimalShapePosition(editor, options) {
  const { width, height, padding = 50 } = options;
  
  // Get viewport bounds
  const viewportPageBounds = editor.getViewportPageBounds();
  
  // Position in center of viewport
  const x = viewportPageBounds.x + (viewportPageBounds.w - width) / 2;
  const y = viewportPageBounds.y + (viewportPageBounds.h - height) / 2;
  
  return { x, y };
}

export function centerCameraOnShape(editor, shapeId, options) {
  const { duration = 200 } = options || {};
  
  const shape = editor.getShape(shapeId);
  if (!shape) return;
  
  editor.zoomToSelection([shapeId], {
    duration,
    inset: 100,
  });
}