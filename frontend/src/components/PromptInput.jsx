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
  const [selectedSourcesCount, setSelectedSourcesCount] = useState(0);
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
        if (currentShape.type === 'frame') {
          if (currentShape.meta?.handwritingNoteId) {
            resolved.add(currentShape.id);
            return;
          }
          if (currentShape.meta?.typedNoteId) {
            resolved.add(currentShape.id);
            return;
          }
        }
        const parent = editor.getShapeParent(currentShape);
        if (!parent) break;
        currentShape = parent;
      }

      resolved.add(shape.id);
    });

    return Array.from(resolved);
  }, [editor]);

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

  // Track selection changes to update source count
  useEffect(() => {
    const updateSourceCount = () => {
      const resolved = resolveSelectionForContext();
      console.log('Selected sources count:', resolved.length, resolved);
      setSelectedSourcesCount(resolved.length);
    };

    // Update immediately
    updateSourceCount();

    // Listen to selection changes - use interval as fallback
    const interval = setInterval(() => {
      updateSourceCount();
    }, 500);

    return () => {
      clearInterval(interval);
    };
  }, [editor, resolveSelectionForContext]);

  const createEmbedShape = async (promptText, embedData) => {
    const embedShapeId = createShapeId();
    const embedWidth = 600;
    const embedHeight = 450;
    const padding = 50;

    // Get position for the embed shape
    const viewport = editor.getViewportPageBounds();
    const position = {
      x: viewport.x + viewport.w / 2 - embedWidth / 2,
      y: viewport.y + viewport.h / 2 - embedHeight / 2,
    };

    // Create the embed shape
    editor.run(() => {
      editor.createShape({
        id: embedShapeId,
        type: 'custom-embed',
        x: position.x,
        y: position.y,
        props: {
          w: embedWidth,
          h: embedHeight,
          embedUrl: embedData.embedUrl,
          service: embedData.service,
          query: embedData.query,
        },
      });
    });

    // Center camera on the new embed
    requestAnimationFrame(() => {
      setTimeout(() => {
        centerCameraOnShape(editor, embedShapeId, { duration: 300 });
      }, 100);
    });
  };

  const handleIWantPrompt = async (promptText) => {
    const lowerPrompt = promptText.toLowerCase().trim();
    
    // Check if it's an "I want" prompt
    if (!lowerPrompt.startsWith('i want')) {
      return false; // Not an "I want" prompt, use normal flow
    }

    // Parse intent
    const isLearning = lowerPrompt.includes('to learn') || lowerPrompt.includes('to know');
    
    try {
      if (isLearning) {
        // YouTube embed for learning
        const query = promptText.replace(/^i want to (learn|know)/i, '').trim();
        
        if (!query) {
          console.warn('No query extracted from learning prompt');
          return false;
        }

        const apiUrl = backendUrl || 'http://localhost:8001';
        const response = await fetch(`${apiUrl}/api/create-embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptText,
            embed_type: 'youtube',
            query: query,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to create YouTube embed: ${response.statusText}`);
        }

        const embedData = await response.json();
        await createEmbedShape(promptText, embedData);
        return true;
        
      } else {
        // Google Maps embed for food/location
        const query = promptText.replace(/^i want/i, '').trim();
        
        if (!query) {
          console.warn('No query extracted from food prompt');
          return false;
        }

        // Request geolocation
        const getLocation = () => {
          return new Promise((resolve) => {
            if (!navigator.geolocation) {
              console.warn('Geolocation not supported, using default location');
              resolve({ lat: 37.7749, lng: -122.4194 }); // San Francisco default
              return;
            }

            navigator.geolocation.getCurrentPosition(
              (position) => {
                resolve({
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                });
              },
              (error) => {
                console.warn('Geolocation permission denied, using default location');
                resolve({ lat: 37.7749, lng: -122.4194 }); // San Francisco default
              }
            );
          });
        };

        const location = await getLocation();
        
        const apiUrl = backendUrl || 'http://localhost:8001';
        const response = await fetch(`${apiUrl}/api/create-embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptText,
            embed_type: 'google_maps',
            query: query,
            lat: location.lat,
            lng: location.lng,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to create Google Maps embed: ${response.statusText}`);
        }

        const embedData = await response.json();
        await createEmbedShape(promptText, embedData);
        return true;
      }
    } catch (error) {
      console.error('Error creating embed:', error);
      // Fall back to normal AI flow
      return false;
    }
  };

  const createAITextShape = async (promptText) => {
    if (!promptText.trim()) return;

    const selectedShapeIds = resolveSelectionForContext();
    const c1ShapeId = createShapeId();
    const newShapeWidth = 600;
    const newShapeHeight = 300;
    const padding = 50;

    const checkOverlap = (x, y) => {
      const existingShapes = editor.getCurrentPageShapes();
      return existingShapes.some((shape) => {
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

    let position;
    if (selectedShapeIds.length > 0) {
      const firstSelectedId = selectedShapeIds[0];
      const shapePageBounds = editor.getShapePageBounds(firstSelectedId);

      if (shapePageBounds) {
        const positions = [
          {
            x: shapePageBounds.maxX + padding,
            y: shapePageBounds.center.y - newShapeHeight / 2,
          },
          {
            x: shapePageBounds.center.x - newShapeWidth / 2,
            y: shapePageBounds.maxY + padding,
          },
          {
            x: shapePageBounds.x - newShapeWidth - padding,
            y: shapePageBounds.center.y - newShapeHeight / 2,
          },
          {
            x: shapePageBounds.center.x - newShapeWidth / 2,
            y: shapePageBounds.y - newShapeHeight - padding,
          },
        ];

        let validPosition = positions.find((pos) => !checkOverlap(pos.x, pos.y));

        if (!validPosition) {
          const extendedPositions = [
            {
              x: shapePageBounds.maxX + padding * 2,
              y: shapePageBounds.center.y - newShapeHeight / 2,
            },
            {
              x: shapePageBounds.center.x - newShapeWidth / 2,
              y: shapePageBounds.maxY + padding * 2,
            },
            {
              x: shapePageBounds.maxX + padding * 3,
              y: shapePageBounds.center.y - newShapeHeight / 2,
            },
            {
              x: shapePageBounds.center.x - newShapeWidth / 2,
              y: shapePageBounds.maxY + padding * 3,
            },
          ];
          validPosition = extendedPositions.find((pos) => !checkOverlap(pos.x, pos.y));
        }

        if (validPosition) {
          position = validPosition;
        } else {
          position = getOptimalShapePosition(editor, {
            width: newShapeWidth,
            height: newShapeHeight,
            padding,
          });
        }
      }
    }

    if (!position) {
      position = getOptimalShapePosition(editor, {
        width: newShapeWidth,
        height: newShapeHeight,
        padding,
      });
    }

    const responseSize = {
      w: newShapeWidth,
      h: newShapeHeight,
    };

    editor.run(() => {
      editor.createShape({
        id: c1ShapeId,
        type: 'c1-response',
        x: position.x,
        y: position.y,
        props: {
          w: newShapeWidth,
          h: newShapeHeight,
          prompt: promptText,
          c1Response: '',
          isStreaming: true,
        },
      });

      if (selectedShapeIds.length) {
        connectSourcesToResponse(selectedShapeIds, c1ShapeId);
      }
    });

    requestAnimationFrame(() => {
      setTimeout(() => {
        centerCameraOnShape(editor, c1ShapeId, { duration: 300 });
      }, 100);
    });

    try {
      const apiUrl = backendUrl || 'http://localhost:8001';
      console.log('Fetching from:', `${apiUrl}/api/ask`);
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
              console.warn('JSON parse error:', e.message);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

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
          c1Response: `<content thesys="true">{"component": {"component": "Card", "props": {"children": [{"component": "Header", "props": {"title": "Error"}}, {"component": "TextContent", "props": {"textMarkdown": "Failed to generate response: ${error.message}"}}]}}}</content>`,
          isStreaming: false,
        },
      });
    }
  };


  return (
    <>
      {/* Source count indicator - eyebrow style */}
      <div
        style={{
          position: 'fixed',
          left: '50%',
          bottom: selectedSourcesCount > 0 ? '76px' : '68px',
          transform: 'translateX(-50%)',
          width: isFocused ? '50%' : '400px',
          padding: '6px 20px',
          borderRadius: '12px 12px 0 0',
          background: 'rgba(249, 250, 251, 0.98)',
          borderTop: '1px solid #E5E7EB',
          borderLeft: '1px solid #E5E7EB',
          borderRight: '1px solid #E5E7EB',
          color: '#6B7280',
          fontSize: '11px',
          fontWeight: '600',
          zIndex: 9999,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          opacity: selectedSourcesCount > 0 ? 1 : 0,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          backdropFilter: 'blur(8px)',
          letterSpacing: '0.025em',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        {selectedSourcesCount} SOURCE{selectedSourcesCount !== 1 ? 'S' : ''}
      </div>

      <form
        style={{
          display: 'flex',
          alignItems: 'center',
          position: 'fixed',
          left: '50%',
          bottom: '16px',
          transform: 'translateX(-50%)',
          padding: '12px 20px',
          borderRadius: selectedSourcesCount > 0 ? '0 0 16px 16px' : '16px',
          border: '1px solid #E5E7EB',
          borderTop: selectedSourcesCount > 0 ? 'none' : '1px solid #E5E7EB',
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
      onSubmit={async (e) => {
        e.preventDefault();
        if (prompt.trim()) {
          // First check if it's an "I want" prompt
          const handledAsEmbed = await handleIWantPrompt(prompt);
          
          // If not handled as embed, use normal AI flow
          if (!handledAsEmbed) {
            createAITextShape(prompt);
          }
          
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
    </>
  );
}
