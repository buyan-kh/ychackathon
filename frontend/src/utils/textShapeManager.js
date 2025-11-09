import type { Editor, TLShapeId } from 'tldraw';
import { createShapeId } from 'tldraw';
import { getOptimalShapePosition, centerCameraOnShape } from './shapePositioning';
import { makeApiCall } from '../helpers/api';

export interface TextShapeCreationOptions {
  searchQuery: string;
  width?: number;
  height?: number;
  centerCamera?: boolean;
  animationDuration?: number;
}

export async function createTextResponseShape(
  editor: Editor,
  options: TextShapeCreationOptions
): Promise<TLShapeId> {
  const {
    searchQuery,
    width = 600,
    height = 300,
    centerCamera = true,
    animationDuration = 200,
  } = options;

  const shapeId = createShapeId();
  const position = getOptimalShapePosition(editor, {
    width,
    height,
    padding: 50,
  });

  // Create the shape
  editor.createShape({
    id: shapeId,
    type: 'text-response',
    x: position.x,
    y: position.y,
    props: {
      w: width,
      h: height,
      prompt: searchQuery,
      response: '',
      isStreaming: false,
    },
  });

  // Center camera
  if (centerCamera) {
    centerCameraOnShape(editor, shapeId, { duration: animationDuration });
  }

  // Make API call to populate the shape
  await makeApiCall({
    searchQuery,
    onResponseStreamStart: () => {
      editor.updateShape({
        id: shapeId,
        type: 'text-response',
        props: { isStreaming: true },
      });
    },
    onResponseUpdate: (response) => {
      editor.updateShape({
        id: shapeId,
        type: 'text-response',
        props: {
          response,
          isStreaming: true,
        },
      });
    },
    onResponseStreamEnd: () => {
      const currentShape = editor.getShape(shapeId);
      if (!currentShape) return;

      editor.updateShape({
        id: shapeId,
        type: 'text-response',
        props: {
          ...currentShape.props,
          isStreaming: false,
        },
      });
    },
  });

  return shapeId;
}