// Helper function to check if a rectangle overlaps with another rectangle
function rectanglesOverlap(rect1, rect2, padding = 0) {
  return !(
    rect1.x + rect1.w + padding <= rect2.x ||
    rect1.x - padding >= rect2.x + rect2.w ||
    rect1.y + rect1.h + padding <= rect2.y ||
    rect1.y - padding >= rect2.y + rect2.h
  );
}

export function getOptimalShapePosition(editor, options) {
  const { width, height, padding = 50 } = options;
  
  // Get viewport bounds
  const viewportPageBounds = editor.getViewportPageBounds();
  const viewportBounds = {
    x: viewportPageBounds.x,
    y: viewportPageBounds.y,
    w: viewportPageBounds.w,
    h: viewportPageBounds.h,
    center: {
      x: viewportPageBounds.x + viewportPageBounds.w / 2,
      y: viewportPageBounds.y + viewportPageBounds.h / 2,
    },
  };
  
  // Get all existing shapes on the current page
  const existingShapes = editor.getCurrentPageShapes();
  
  // Calculate bounds for all existing shapes
  const existingBounds = existingShapes
    .map((shape) => {
      const bounds = editor.getShapePageBounds(shape.id);
      if (!bounds) return null;
      return {
        x: bounds.x,
        y: bounds.y,
        w: bounds.w,
        h: bounds.h,
        right: bounds.x + bounds.w,
        bottom: bounds.y + bounds.h,
      };
    })
    .filter(Boolean);
  
  // Helper to check if a position has collisions
  const hasCollision = (x, y, w, h) => {
    const newRect = { x, y, w, h };
    return existingBounds.some((bounds) => 
      rectanglesOverlap(newRect, bounds, padding)
    );
  };
  
  // If no existing shapes, place at viewport center
  if (existingBounds.length === 0) {
    return {
      x: viewportBounds.center.x - width / 2,
      y: viewportBounds.center.y - height / 2,
    };
  }
  
  // Try placing to the right of the rightmost shape
  const rightmostShape = existingBounds.reduce((max, bounds) =>
    bounds.right > max.right ? bounds : max
  );
  const rightPosition = {
    x: rightmostShape.right + padding,
    y: rightmostShape.y,
  };
  
  // Check for collisions (no viewport restriction - allow placing outside viewport)
  if (!hasCollision(rightPosition.x, rightPosition.y, width, height)) {
    return rightPosition;
  }
  
  // Try placing below the bottommost shape
  const bottommostShape = existingBounds.reduce((max, bounds) =>
    bounds.bottom > max.bottom ? bounds : max
  );
  const belowPosition = {
    x: bottommostShape.x,
    y: bottommostShape.bottom + padding,
  };
  
  // Check for collisions
  if (!hasCollision(belowPosition.x, belowPosition.y, width, height)) {
    return belowPosition;
  }
  
  // Try placing to the left of the leftmost shape
  const leftmostShape = existingBounds.reduce((min, bounds) =>
    bounds.x < min.x ? bounds : min
  );
  const leftPosition = {
    x: leftmostShape.x - width - padding,
    y: leftmostShape.y,
  };
  
  if (!hasCollision(leftPosition.x, leftPosition.y, width, height)) {
    return leftPosition;
  }
  
  // Try placing above the topmost shape
  const topmostShape = existingBounds.reduce((min, bounds) =>
    bounds.y < min.y ? bounds : min
  );
  const abovePosition = {
    x: topmostShape.x,
    y: topmostShape.y - height - padding,
  };
  
  if (!hasCollision(abovePosition.x, abovePosition.y, width, height)) {
    return abovePosition;
  }
  
  // Expand search area beyond viewport
  const searchPadding = Math.max(width, height) * 2;
  const searchBounds = {
    minX: Math.min(...existingBounds.map(b => b.x)) - searchPadding,
    maxX: Math.max(...existingBounds.map(b => b.right)) + searchPadding,
    minY: Math.min(...existingBounds.map(b => b.y)) - searchPadding,
    maxY: Math.max(...existingBounds.map(b => b.bottom)) + searchPadding,
  };
  
  // Grid-based search: try positions in a grid pattern
  const gridSpacing = Math.max(width, height) + padding;
  const gridStartX = searchBounds.minX;
  const gridStartY = searchBounds.minY;
  const gridCols = Math.ceil((searchBounds.maxX - searchBounds.minX) / gridSpacing);
  const gridRows = Math.ceil((searchBounds.maxY - searchBounds.minY) / gridSpacing);
  
  // Try grid positions, prioritizing viewport area
  const viewportGridStartCol = Math.max(0, Math.floor((viewportBounds.x - gridStartX) / gridSpacing));
  const viewportGridEndCol = Math.min(gridCols, Math.ceil((viewportBounds.x + viewportBounds.w - gridStartX) / gridSpacing));
  const viewportGridStartRow = Math.max(0, Math.floor((viewportBounds.y - gridStartY) / gridSpacing));
  const viewportGridEndRow = Math.min(gridRows, Math.ceil((viewportBounds.y + viewportBounds.h - gridStartY) / gridSpacing));
  
  // First, search in viewport area
  for (let row = viewportGridStartRow; row < viewportGridEndRow; row++) {
    for (let col = viewportGridStartCol; col < viewportGridEndCol; col++) {
      const gridX = gridStartX + col * gridSpacing;
      const gridY = gridStartY + row * gridSpacing;
      
      if (!hasCollision(gridX, gridY, width, height)) {
        return { x: gridX, y: gridY };
      }
    }
  }
  
  // Then search outside viewport
  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      // Skip viewport area already searched
      if (row >= viewportGridStartRow && row < viewportGridEndRow &&
          col >= viewportGridStartCol && col < viewportGridEndCol) {
        continue;
      }
      
      const gridX = gridStartX + col * gridSpacing;
      const gridY = gridStartY + row * gridSpacing;
      
      if (!hasCollision(gridX, gridY, width, height)) {
        return { x: gridX, y: gridY };
      }
    }
  }
  
  // Last resort: find a position near viewport center that doesn't collide
  // Try positions in a spiral pattern around viewport center
  const spiralSteps = [
    { dx: 0, dy: 0 },
    { dx: width + padding, dy: 0 },
    { dx: 0, dy: height + padding },
    { dx: -(width + padding), dy: 0 },
    { dx: 0, dy: -(height + padding) },
    { dx: width + padding, dy: height + padding },
    { dx: -(width + padding), dy: height + padding },
    { dx: -(width + padding), dy: -(height + padding) },
    { dx: width + padding, dy: -(height + padding) },
  ];
  
  for (const step of spiralSteps) {
    const x = viewportBounds.center.x - width / 2 + step.dx;
    const y = viewportBounds.center.y - height / 2 + step.dy;
    
    if (!hasCollision(x, y, width, height)) {
      return { x, y };
    }
  }
  
  // Final fallback: viewport center (even if it overlaps)
  return {
    x: viewportBounds.center.x - width / 2,
    y: viewportBounds.center.y - height / 2,
  };
}

export function centerCameraOnShape(editor, shapeId, options) {
  const { duration = 200 } = options || {};
  
  const shape = editor.getShape(shapeId);
  if (!shape) {
    // Retry after a short delay if shape doesn't exist yet
    setTimeout(() => {
      const retryShape = editor.getShape(shapeId);
      if (retryShape) {
        editor.setSelectedShapes([shapeId]);
        editor.zoomToSelection([shapeId], {
          duration,
          inset: 100,
        });
      }
    }, 100);
    return;
  }
  
  // Select the shape first, then zoom to it
  editor.setSelectedShapes([shapeId]);
  editor.zoomToSelection([shapeId], {
    duration,
    inset: 100,
  });
}