import React, { useState, useEffect, useCallback } from 'react';
import { useEditor } from 'tldraw';
import { createShapeId } from '@tldraw/editor';
import { createArrowBetweenShapes } from '../utils/connection';
import { extractC1ShapeContext } from '../utils/c1Context';
import { makeApiCall } from '../helpers/api';
import { getOptimalShapePosition, centerCameraOnShape } from '../utils/shapePositioning';

// Input field component that appears when plus button is clicked
function InputField({ x, y, onSubmit, onCancel }) {
  const [prompt, setPrompt] = useState('');
  const inputRef = React.useRef(null);

  useEffect(() => {
    // Focus input when it appears
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (prompt.trim()) {
      onSubmit(prompt.trim());
      setPrompt('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        zIndex: 10001,
        pointerEvents: 'all',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
          padding: '12px 20px',
          borderRadius: '16px',
          border: '1px solid #E5E7EB',
          fontSize: '16px',
          transition: 'all 0.3s ease-in-out',
          gap: '8px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          minHeight: '60px',
          width: '400px',
          background: '#FFFFFF',
          color: '#111827',
        }}
      >
        <input
          ref={inputRef}
          name="prompt-input"
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything..."
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'inherit',
            fontSize: 'inherit',
          }}
        />
        <button
          type="submit"
          disabled={!prompt.trim()}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            border: 'none',
            background: prompt.trim() ? '#3B82F6' : '#CBD5E1',
            color: '#FFFFFF',
            cursor: prompt.trim() ? 'pointer' : 'not-allowed',
          }}
          onMouseDown={(e) => {
            e.preventDefault();
          }}
        >
          ↑
        </button>
      </form>
    </div>
  );
}

export default function C1PlusButton() {
  const editor = useEditor();
  const [selectedC1Shape, setSelectedC1Shape] = useState(null);
  const [showInputField, setShowInputField] = useState(false);
  const [inputPosition, setInputPosition] = useState({ x: 0, y: 0 });
  const [buttonPosition, setButtonPosition] = useState({ x: 0, y: 0 });

  // Track selected C1 response shapes
  useEffect(() => {
    const updateSelection = () => {
      const selectedShapes = editor.getSelectedShapes();
      const c1Shape = selectedShapes.find(
        (shape) => shape.type === 'c1-response'
      );

      if (c1Shape) {
        setSelectedC1Shape(c1Shape);
      } else {
        setSelectedC1Shape(null);
        setShowInputField(false);
      }
    };

    // Initial check
    updateSelection();

    // Poll selection changes at a reasonable interval
    const intervalId = setInterval(updateSelection, 100);

    return () => {
      clearInterval(intervalId);
    };
  }, [editor]);

  // Update button position whenever shape moves or viewport changes
  useEffect(() => {
    if (!selectedC1Shape) {
      return;
    }

    let animationFrameId = null;

    const updateButtonPosition = () => {
      const shapePageBounds = editor.getShapePageBounds(selectedC1Shape.id);
      if (shapePageBounds) {
        // Convert shape bounds to screen coordinates
        const buttonScreenPoint = editor.pageToScreen({
          x: shapePageBounds.maxX,
          y: shapePageBounds.center.y,
        });

        setButtonPosition({
          x: buttonScreenPoint.x + 5,
          y: buttonScreenPoint.y - 12,
        });

        // Also update input field position if it's showing
        if (showInputField) {
          const inputScreenPoint = editor.pageToScreen({
            x: shapePageBounds.maxX + 20,
            y: shapePageBounds.center.y - 20,
          });
          setInputPosition({ x: inputScreenPoint.x, y: inputScreenPoint.y });
        }
      }

      // Continue updating on every frame for smooth movement
      animationFrameId = requestAnimationFrame(updateButtonPosition);
    };

    // Start the update loop
    animationFrameId = requestAnimationFrame(updateButtonPosition);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [editor, selectedC1Shape, showInputField]);

  const handlePlusButtonClick = useCallback(() => {
    if (!selectedC1Shape) return;

    // Calculate position for input field (to the right of the shape)
    const shapePageBounds = editor.getShapePageBounds(selectedC1Shape.id);
    if (!shapePageBounds) return;

    // Convert page coordinates to screen coordinates
    const screenPoint = editor.pageToScreen({
      x: shapePageBounds.maxX + 20, // 20px to the right of the shape
      y: shapePageBounds.center.y - 20, // Centered vertically, adjusted for input height
    });

    setInputPosition({ x: screenPoint.x, y: screenPoint.y });
    setShowInputField(true);
  }, [editor, selectedC1Shape]);

  const handleInputCancel = useCallback(() => {
    setShowInputField(false);
  }, []);

  const handleInputSubmit = useCallback(
    async (prompt) => {
      if (!selectedC1Shape) return;
      setShowInputField(false);

      try {
        const newShapeWidth = 600;
        const newShapeHeight = 300;
        const padding = 50;

        // Helper function to check if a position would overlap with existing shapes
        const checkOverlap = (x, y) => {
          const existingShapes = editor.getCurrentPageShapes();
          return existingShapes.some((shape) => {
            if (shape.id === selectedC1Shape.id) return false;
            const bounds = editor.getShapePageBounds(shape.id);
            if (!bounds) return false;

            return !(
              x + newShapeWidth + padding <= bounds.x ||
              x - padding >= bounds.x + bounds.w ||
              y + newShapeHeight + padding <= bounds.y ||
              y - padding >= bounds.y + bounds.h
            );
          });
        };

        // Try to position relative to the selected shape first
        const shapePageBounds = editor.getShapePageBounds(selectedC1Shape.id);
        let newX, newY;

        if (shapePageBounds) {
          // Define positions relative to the selected shape in priority order
          const positions = [
            {
              // Right
              x: shapePageBounds.maxX + padding,
              y: shapePageBounds.center.y - newShapeHeight / 2,
            },
            {
              // Below
              x: shapePageBounds.center.x - newShapeWidth / 2,
              y: shapePageBounds.maxY + padding,
            },
            {
              // Left
              x: shapePageBounds.x - newShapeWidth - padding,
              y: shapePageBounds.center.y - newShapeHeight / 2,
            },
            {
              // Above
              x: shapePageBounds.center.x - newShapeWidth / 2,
              y: shapePageBounds.y - newShapeHeight - padding,
            },
          ];

          // Find first position that doesn't overlap
          const validPosition = positions.find((pos) => !checkOverlap(pos.x, pos.y));

          if (validPosition) {
            // Use the first valid position relative to selected shape
            newX = validPosition.x;
            newY = validPosition.y;
          } else {
            // All relative positions overlap, fall back to global optimal positioning
            const optimalPosition = getOptimalShapePosition(editor, {
              width: newShapeWidth,
              height: newShapeHeight,
              padding,
            });
            newX = optimalPosition.x;
            newY = optimalPosition.y;
          }
        } else {
          // Fallback to optimal positioning if shape bounds can't be determined
          const optimalPosition = getOptimalShapePosition(editor, {
            width: newShapeWidth,
            height: newShapeHeight,
            padding,
          });
          newX = optimalPosition.x;
          newY = optimalPosition.y;
        }

        // Create the shape using the low-level API for precise positioning
        const shapeId = createShapeId();
        const additionalContext = extractC1ShapeContext(editor);

        // Create the shape at the calculated position
        editor.createShape({
          id: shapeId,
          type: 'c1-response',
          x: newX,
          y: newY,
          props: {
            w: newShapeWidth,
            h: newShapeHeight,
            prompt,
          },
        });

        // Automatically center camera on the new shape after a brief delay
        // to ensure the shape is fully rendered
        requestAnimationFrame(() => {
          setTimeout(() => {
            centerCameraOnShape(editor, shapeId, { duration: 300 });
          }, 100);
        });

        const originShapeId = selectedC1Shape.id;

        // Make API call to populate the shape with content
        await makeApiCall({
          searchQuery: prompt,
          additionalContext,
          onResponseStreamStart: () => {
            createArrowBetweenShapes(editor, originShapeId, shapeId);
            editor.updateShape({
              id: shapeId,
              type: 'c1-response',
              props: { isStreaming: true },
            });
          },
          onResponseUpdate: (response) => {
            editor.updateShape({
              id: shapeId,
              type: 'c1-response',
              props: { c1Response: response, isStreaming: true },
            });
          },
          onResponseStreamEnd: () => {
            const currentShape = editor.getShape(shapeId);
            if (!currentShape) return;
            editor.updateShape({
              id: shapeId,
              type: 'c1-response',
              props: { ...currentShape.props, isStreaming: false },
            });
          },
        });
      } catch (error) {
        console.error('Failed to create C1 component:', error);
      }
    },
    [editor, selectedC1Shape]
  );

  // Don't render if no shape is selected
  if (!selectedC1Shape) {
    return null;
  }

  return (
    <>
      {showInputField ? (
        <InputField
          x={inputPosition.x}
          y={inputPosition.y}
          onSubmit={handleInputSubmit}
          onCancel={handleInputCancel}
        />
      ) : (
        // Plus button
        <div
          style={{
            position: 'absolute',
            left: buttonPosition.x,
            top: buttonPosition.y,
            zIndex: 999,
            pointerEvents: 'all',
          }}
        >
          <button
            onClick={handlePlusButtonClick}
            className="w-6 h-6 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            title="Add connected component"
            style={{
              width: '24px',
              height: '24px',
              background: '#3B82F6',
              color: 'white',
              borderRadius: '50%',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.background = '#2563EB';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = '#3B82F6';
            }}
          >
            <span
              style={{
                fontSize: '14px',
                fontWeight: 'bold',
                lineHeight: '1',
              }}
            >
              +
            </span>
          </button>
        </div>
      )}
    </>
  );
}

