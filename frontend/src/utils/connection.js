import { createShapeId } from '@tldraw/editor';
import { Vec } from '@tldraw/editor';

/**
 * Creates an arrow connection between two shapes
 * @param {Editor} editor - The tldraw editor instance
 * @param {string} startShapeId - ID of the source shape
 * @param {string} endShapeId - ID of the target shape
 * @param {Object} options - Additional options
 * @param {string} options.parentId - Optional parent shape ID
 * @param {Object} options.start - Start terminal options
 * @param {Object} options.end - End terminal options
 */
export function createArrowBetweenShapes(
  editor,
  startShapeId,
  endShapeId,
  options = {}
) {
  const { start = {}, end = {}, parentId } = options;
  
  const {
    normalizedAnchor: startNormalizedAnchor = { x: 0.5, y: 0.5 },
    isExact: startIsExact = false,
    isPrecise: startIsPrecise = false,
  } = start;
  
  const {
    normalizedAnchor: endNormalizedAnchor = { x: 0.5, y: 0.5 },
    isExact: endIsExact = false,
    isPrecise: endIsPrecise = false,
  } = end;

  const startTerminalNormalizedPosition = Vec.From(startNormalizedAnchor);
  const endTerminalNormalizedPosition = Vec.From(endNormalizedAnchor);

  const parent = parentId ? editor.getShape(parentId) : undefined;
  if (parentId && !parent) {
    throw Error(`Parent shape with id ${parentId} not found`);
  }

  const startShapePageBounds = editor.getShapePageBounds(startShapeId);
  const endShapePageBounds = editor.getShapePageBounds(endShapeId);
  const startShapePageRotation = editor
    .getShapePageTransform(startShapeId)
    .rotation();
  const endShapePageRotation = editor
    .getShapePageTransform(endShapeId)
    .rotation();

  if (!startShapePageBounds || !endShapePageBounds) return;

  const startTerminalPagePosition = Vec.Add(
    startShapePageBounds.point,
    Vec.MulV(
      startShapePageBounds.size,
      Vec.Rot(startTerminalNormalizedPosition, startShapePageRotation)
    )
  );

  const endTerminalPagePosition = Vec.Add(
    endShapePageBounds.point,
    Vec.MulV(
      endShapePageBounds.size,
      Vec.Rot(endTerminalNormalizedPosition, endShapePageRotation)
    )
  );

  const arrowPointInParentSpace = Vec.Min(
    startTerminalPagePosition,
    endTerminalPagePosition
  );

  if (parent) {
    arrowPointInParentSpace.setTo(
      editor
        .getShapePageTransform(parent.id)
        .applyToPoint(arrowPointInParentSpace)
    );
  }

  const arrowId = createShapeId();
  
  editor.run(() => {
    editor.markHistoryStoppingPoint('creating_arrow');
    
    editor.createShape({
      id: arrowId,
      type: 'arrow',
      x: arrowPointInParentSpace.x,
      y: arrowPointInParentSpace.y,
      props: {
        start: {
          x: startTerminalPagePosition.x - arrowPointInParentSpace.x,
          y: startTerminalPagePosition.y - arrowPointInParentSpace.y,
        },
        end: {
          x: endTerminalPagePosition.x - arrowPointInParentSpace.x,
          y: endTerminalPagePosition.y - arrowPointInParentSpace.y,
        },
        color: 'grey',
      },
    });

    editor.createBindings([
      {
        fromId: arrowId,
        toId: startShapeId,
        type: 'arrow',
        props: {
          terminal: 'start',
          normalizedAnchor: startNormalizedAnchor,
          isExact: startIsExact,
          isPrecise: startIsPrecise,
        },
      },
      {
        fromId: arrowId,
        toId: endShapeId,
        type: 'arrow',
        props: {
          terminal: 'end',
          normalizedAnchor: endNormalizedAnchor,
          isExact: endIsExact,
          isPrecise: endIsPrecise,
        },
      },
    ]);
  });
}

