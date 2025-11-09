import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createShapeId, useEditor } from 'tldraw';
import { getOptimalShapePosition, centerCameraOnShape } from '../utils/shapePositioning';

const backendUrl = process.env.REACT_APP_BACKEND_URL;

const isMac = () => {
  return typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
};

export default function PromptInput({ focusEventName }) {
  const editor = useEditor();
  const [isFocused, setIsFocused] = useState(false);
  const [prompt, setPrompt] = useState('');
  const showMacKeybinds = isMac();
  const inputRef = useRef(null);

  const clamp01 = (value) => Math.max(0, Math.min(1, value));

  const getBoundsCenter = useCallback((bounds) => {
    if (!bounds) return null;
    return {
      x: bounds.x + bounds.w / 2,
      y: bounds.y + bounds.h / 2,
    };
  }, []);

  const createArrowBinding = useCallback(
    (arrowId, shapeId, terminal, anchorPoint, bounds) => {
      if (!bounds || !anchorPoint) return;
      const nx =
        bounds.w === 0 ? 0.5 : clamp01((anchorPoint.x - bounds.x) / (bounds.w === 0 ? 1 : bounds.w));
      const ny =
        bounds.h === 0 ? 0.5 : clamp01((anchorPoint.y - bounds.y) / (bounds.h === 0 ? 1 : bounds.h));

      editor.createBinding({
        type: 'arrow',
        fromId: arrowId,
        toId: shapeId,
        props: {
          terminal,
          normalizedAnchor: { x: nx, y: ny },
          isExact: false,
          isPrecise: true,
          snap: 'none',
        },
      });
    },
    [editor]
  );

  const connectSourcesToResponse = useCallback(
    (sourceIds, targetId) => {
      if (!sourceIds?.length) return;
      const targetBounds = editor.getShapePageBounds(targetId);
      const targetCenter = getBoundsCenter(targetBounds);
      if (!targetBounds || !targetCenter) return;

      sourceIds.forEach((sourceId) => {
        if (sourceId === targetId) return;
        const sourceBounds = editor.getShapePageBounds(sourceId);
        const sourceCenter = getBoundsCenter(sourceBounds);
        if (!sourceBounds || !sourceCenter) return;

        const deltaX = targetCenter.x - sourceCenter.x;
        const deltaY = targetCenter.y - sourceCenter.y;

        // Avoid zero-length arrows
        if (Math.abs(deltaX) < 0.1 && Math.abs(deltaY) < 0.1) return;

        const arrowId = createShapeId();
        editor.createShape({
          id: arrowId,
          type: 'arrow',
          x: sourceCenter.x,
          y: sourceCenter.y,
          props: {
            start: { x: 0, y: 0 },
            end: { x: deltaX, y: deltaY },
            arrowheadStart: 'none',
            arrowheadEnd: 'arrow',
          },
          meta: {
            provenance: {
              sourceId,
              targetId,
            },
          },
        });

        createArrowBinding(arrowId, sourceId, 'start', sourceCenter, sourceBounds);
        createArrowBinding(arrowId, targetId, 'end', targetCenter, targetBounds);
      });
    },
    [createArrowBinding, editor, getBoundsCenter]
  );

  useEffect(() => {
    const handleFocusEvent = () => {
      if (inputRef.current) {
        inputRef.current.focus();
        setIsFocused(true);
      }
    };

    window.addEventListener(focusEventName, handleFocusEvent);
    return () => {
      window.removeEventListener(focusEventName, handleFocusEvent);
    };
  }, [focusEventName]);

  const resolveSelectionForContext = useCallback(() => {
    const selectedIds = editor.getSelectedShapeIds();
    if (!selectedIds.length) return [];

    const resolved = new Set();

    selectedIds.forEach((id) => {
      const shape = editor.getShape(id);
      if (!shape) return;

      let currentShape = shape;
      // Walk up to find a handwriting frame if applicable
      while (currentShape) {
        if (
          currentShape.type === 'frame' &&
          currentShape.meta?.handwritingNoteId
        ) {
          resolved.add(currentShape.id);
          return;
        }
        const parent = editor.getShapeParent(currentShape);
        if (!parent) break;
        currentShape = parent;
      }

      resolved.add(shape.id);
    });

    return Array.from(resolved);
  }, [editor]);

  const createAITextShape = async (promptText) => {
    if (!promptText.trim()) return;

    const selectedShapeIds = resolveSelectionForContext();
    const c1ShapeId = createShapeId();
    
    // Calculate optimal position for the new shape
    const position = getOptimalShapePosition(editor, {
      width: 600,
      height: 300,
      padding: 50,
    });
    
    // Create C1 Response shape ON THE CANVAS
    editor.run(() => {
      editor.createShape({
        id: c1ShapeId,
        type: 'c1-response',
        x: position.x,
        y: position.y,
        props: {
          w: 600,
          h: 300,
          prompt: promptText,
          c1Response: '',
          isStreaming: true,
        },
      });

      if (selectedShapeIds.length) {
        connectSourcesToResponse(selectedShapeIds, c1ShapeId);
      }
    });
    
    // Automatically center camera on the new shape after a brief delay
    // to ensure the shape is fully rendered
    requestAnimationFrame(() => {
      setTimeout(() => {
        centerCameraOnShape(editor, c1ShapeId, { duration: 300 });
      }, 100);
    });
    
    try {
      const apiUrl = backendUrl || 'http://localhost:8000';
      console.log('Fetching from:', `${apiUrl}/api/ask`);
      
      // Stream AI response
      const response = await fetch(`${apiUrl}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          shape_ids: selectedShapeIds.length ? selectedShapeIds : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiResponse = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (!line.trim() || !line.startsWith('data: ')) continue;
            
            const data = line.slice(6).trim();
            if (data === '[DONE]' || !data) continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                aiResponse += parsed.content;
                
                // Update C1 Response shape with streaming content
                editor.updateShape({
                  id: c1ShapeId,
                  type: 'c1-response',
                  props: {
                    c1Response: aiResponse,
                    isStreaming: true,
                  },
                });
              }
            } catch (e) {
              // Skip invalid JSON chunks
              console.warn('JSON parse error:', e.message);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      
      // Mark streaming as complete
      editor.updateShape({
        id: c1ShapeId,
        type: 'c1-response',
        props: {
          isStreaming: false,
        },
      });
      
    } catch (error) {
      console.error('AI request failed:', error);
      console.error('Backend URL:', backendUrl);
      editor.updateShape({
        id: c1ShapeId,
        type: 'c1-response',
        props: {
          c1Response: `<content thesys="true">{"component": {"component": "Card", "props": {"children": [{"component": "Header", "props": {"title": "Error"}}, {"component": "TextContent", "props": {"textMarkdown": "Failed to generate response: ${error.message}"}}]}}}}</content>`,
          isStreaming: false,
        },
      });
    }
  };

  return (
    <form
      style={{
        display: 'flex',
        alignItems: 'center',
        position: 'fixed',
        left: '50%',
        bottom: '16px',
        transform: 'translateX(-50%)',
        padding: '12px 20px',
        borderRadius: '16px',
        border: '1px solid #E5E7EB',
        fontSize: '16px',
        transition: 'all 0.3s ease-in-out',
        gap: '8px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        minHeight: '60px',
        width: isFocused ? '50%' : '400px',
        background: '#FFFFFF',
        color: '#111827',
        zIndex: 10000,
        pointerEvents: 'all',
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (inputRef.current && !isFocused) {
          inputRef.current.focus();
        }
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (prompt.trim()) {
          createAITextShape(prompt);
          setPrompt('');
          setIsFocused(false);
          if (inputRef.current) inputRef.current.blur();
        }
      }}
    >
      <input
        name="prompt-input"
        ref={inputRef}
        type="text"
        placeholder="Ask anything..."
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'inherit',
          fontSize: 'inherit',
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      {isFocused ? (
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
      ) : (
        <span style={{ fontSize: '12px', opacity: 0.3 }}>
          {showMacKeybinds ? '⌘ + K' : 'Ctrl + K'}
        </span>
      )}
    </form>
  );
}
