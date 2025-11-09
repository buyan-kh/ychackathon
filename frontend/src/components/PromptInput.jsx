import React, { useState, useRef, useEffect, useCallback } from "react";
import { createShapeId, useEditor } from "tldraw";
import {
  getOptimalShapePosition,
  centerCameraOnShape,
} from "../utils/shapePositioning";

const backendUrl = process.env.REACT_APP_BACKEND_URL;

const isMac = () => {
  return (
    typeof window !== "undefined" &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  );
};

// Icon components for each document type
const DocumentTypeIcon = ({ type, color }) => {
  const icons = {
    pdf: (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    ),
    video: (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
      >
        <path d="M23 7l-7 5 7 5V7z" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    ),
    "c1-response": (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="11" r="1" fill={color} />
        <circle cx="8" cy="11" r="1" fill={color} />
        <circle cx="16" cy="11" r="1" fill={color} />
      </svg>
    ),
    "meeting-summary": (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <line x1="10" y1="9" x2="8" y2="9" />
      </svg>
    ),
    embed: (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
      >
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    "handwriting-note": (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
      >
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
      </svg>
    ),
    "typed-note": (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
      >
        <line x1="17" y1="10" x2="3" y2="10" />
        <line x1="21" y1="6" x2="3" y2="6" />
        <line x1="21" y1="14" x2="3" y2="14" />
        <line x1="17" y1="18" x2="3" y2="18" />
      </svg>
    ),
  };

  return icons[type] || icons["pdf"];
};

// Color mapping for each type
const getTypeColor = (type) => {
  const colors = {
    pdf: "#3B82F6",
    video: "#8B5CF6",
    "c1-response": "#10B981",
    "meeting-summary": "#14B8A6",
    embed: "#F59E0B",
    "handwriting-note": "#FBBF24",
    "typed-note": "#FBBF24",
  };
  return colors[type] || "#6B7280";
};

export default function PromptInput({ focusEventName }) {
  const editor = useEditor();
  const [isFocused, setIsFocused] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [selectedSourcesCount, setSelectedSourcesCount] = useState(0);
  const [selectedSources, setSelectedSources] = useState([]);
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
        bounds.w === 0
          ? 0.5
          : clamp01(
              (anchorPoint.x - bounds.x) / (bounds.w === 0 ? 1 : bounds.w)
            );
      const ny =
        bounds.h === 0
          ? 0.5
          : clamp01(
              (anchorPoint.y - bounds.y) / (bounds.h === 0 ? 1 : bounds.h)
            );

      editor.createBinding({
        type: "arrow",
        fromId: arrowId,
        toId: shapeId,
        props: {
          terminal,
          normalizedAnchor: { x: nx, y: ny },
          isExact: false,
          isPrecise: true,
          snap: "none",
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
          type: "arrow",
          x: sourceCenter.x,
          y: sourceCenter.y,
          props: {
            start: { x: 0, y: 0 },
            end: { x: deltaX, y: deltaY },
            arrowheadStart: "none",
            arrowheadEnd: "arrow",
          },
          meta: {
            provenance: {
              sourceId,
              targetId,
            },
          },
        });

        createArrowBinding(
          arrowId,
          sourceId,
          "start",
          sourceCenter,
          sourceBounds
        );
        createArrowBinding(
          arrowId,
          targetId,
          "end",
          targetCenter,
          targetBounds
        );
      });
    },
    [createArrowBinding, editor, getBoundsCenter]
  );

  const resolveSelectionForContext = useCallback(() => {
    const selectedIds = editor.getSelectedShapeIds();
    if (!selectedIds.length) return [];

    const resolved = new Map(); // Map of id -> type info

    selectedIds.forEach((id) => {
      const shape = editor.getShape(id);
      if (!shape) return;

      let currentShape = shape;
      // Walk up to find a handwriting frame if applicable
      while (currentShape) {
        if (currentShape.type === "frame") {
          if (currentShape.meta?.handwritingNoteId) {
            resolved.set(currentShape.id, { type: "handwriting-note" });
            return;
          }
          if (currentShape.meta?.typedNoteId) {
            resolved.set(currentShape.id, { type: "typed-note" });
            return;
          }
        }
        const parent = editor.getShapeParent(currentShape);
        if (!parent) break;
        currentShape = parent;
      }

      // Determine shape type
      let shapeType = "unknown";
      if (shape.type === "pdf-viewer") shapeType = "pdf";
      else if (shape.type === "video-call") shapeType = "video";
      else if (shape.type === "c1-response") shapeType = "c1-response";
      else if (shape.type === "meeting-summary") shapeType = "meeting-summary";
      else if (shape.type === "custom-embed") shapeType = "embed";

      resolved.set(shape.id, { type: shapeType });
    });

    return Array.from(resolved.entries()).map(([id, info]) => ({
      id,
      ...info,
    }));
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

  // Track selection changes to update source count and types
  useEffect(() => {
    const updateSourceCount = () => {
      const resolved = resolveSelectionForContext();
      console.log("Selected sources count:", resolved.length, resolved);
      setSelectedSourcesCount(resolved.length);

      // Group by type to avoid duplicates
      const typeMap = new Map();
      resolved.forEach((source) => {
        if (!typeMap.has(source.type)) {
          typeMap.set(source.type, { ...source, count: 1 });
        } else {
          typeMap.get(source.type).count++;
        }
      });

      setSelectedSources(Array.from(typeMap.values()));
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

  const generateAIResponseForShape = async (
    shapeId,
    promptText,
    selectedShapeIds = []
  ) => {
    try {
      const apiUrl = backendUrl || "http://localhost:8001";
      console.log("Fetching from:", `${apiUrl}/api/ask`);
      const response = await fetch(`${apiUrl}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          shape_ids: selectedShapeIds.length ? selectedShapeIds : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiResponse = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.trim() || !line.startsWith("data: ")) continue;

            const data = line.slice(6).trim();
            if (data === "[DONE]" || !data) continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                aiResponse += parsed.content;

                editor.updateShape({
                  id: shapeId,
                  type: "c1-response",
                  props: {
                    c1Response: aiResponse,
                    isStreaming: true,
                  },
                });
              }
            } catch (e) {
              console.warn("JSON parse error:", e.message);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      editor.updateShape({
        id: shapeId,
        type: "c1-response",
        props: {
          isStreaming: false,
        },
      });
    } catch (error) {
      console.error("AI request failed:", error);
      console.error("Backend URL:", backendUrl);
      editor.updateShape({
        id: shapeId,
        type: "c1-response",
        props: {
          c1Response: `<content thesys="true">{"component": {"component": "Card", "props": {"children": [{"component": "Header", "props": {"title": "Error"}}, {"component": "TextContent", "props": {"textMarkdown": "Failed to generate response: ${error.message}"}}]}}}</content>`,
          isStreaming: false,
        },
      });
    }
  };

  const createEmbedShape = async (promptText, embedData) => {
    const embedShapeId = createShapeId();
    const embedWidth = 600;
    const embedHeight = 450;
    const padding = 50;

    // Get position for the embed shape
    const viewport = editor.getViewportPageBounds();

    // For YouTube, create both prompt card and embed side by side
    if (embedData.service === "youtube") {
      const textShapeWidth = 400;
      const textShapeHeight = 300;
      const totalWidth = textShapeWidth + padding + embedWidth;

      const centerX = viewport.x + viewport.w / 2;
      const centerY = viewport.y + viewport.h / 2;

      const textShapeX = centerX - totalWidth / 2;
      const embedX = textShapeX + textShapeWidth + padding;
      const y = centerY - Math.max(textShapeHeight, embedHeight) / 2;

      // Create text response shape with the prompt (will generate AI response)
      const textShapeId = createShapeId();
      editor.run(() => {
        editor.createShape({
          id: textShapeId,
          type: "c1-response",
          x: textShapeX,
          y: y,
          props: {
            w: textShapeWidth,
            h: textShapeHeight,
            prompt: promptText,
            c1Response: "",
            isStreaming: true,
          },
        });

        // Create the embed shape
        editor.createShape({
          id: embedShapeId,
          type: "custom-embed",
          x: embedX,
          y: y,
          props: {
            w: embedWidth,
            h: embedHeight,
            embedUrl: embedData.embedUrl,
            service: embedData.service,
            query: embedData.query,
          },
        });
      });

      // Generate AI response for the prompt (with context from selected shapes)
      const selectedShapeIds = resolveSelectionForContext();
      await generateAIResponseForShape(
        textShapeId,
        promptText,
        selectedShapeIds
      );

      // Center camera on both shapes
      requestAnimationFrame(() => {
        setTimeout(() => {
          const bounds = editor.getShapePageBounds(textShapeId);
          if (bounds) {
            editor.setCamera(
              {
                x: bounds.center.x - viewport.w / 2,
                y: bounds.center.y - viewport.h / 2,
                z: editor.getCamera().z,
              },
              { duration: 300 }
            );
          }
        }, 100);
      });
    } else {
      // For other embeds (Google Maps), just create the embed
      const position = {
        x: viewport.x + viewport.w / 2 - embedWidth / 2,
        y: viewport.y + viewport.h / 2 - embedHeight / 2,
      };

      editor.run(() => {
        editor.createShape({
          id: embedShapeId,
          type: "custom-embed",
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
    }
  };

  const handleIWantPrompt = async (promptText) => {
    const lowerPrompt = promptText.toLowerCase().trim();

    // Check if it's an "I want" prompt
    if (!lowerPrompt.startsWith("i want")) {
      return false; // Not an "I want" prompt, use normal flow
    }

    // Parse intent
    const isLearning =
      lowerPrompt.includes("to learn") || lowerPrompt.includes("to know");

    try {
      if (isLearning) {
        // YouTube embed for learning
        const query = promptText.replace(/^i want to (learn|know)/i, "").trim();

        if (!query) {
          console.warn("No query extracted from learning prompt");
          return false;
        }

        const apiUrl = backendUrl || "http://localhost:8001";
        const response = await fetch(`${apiUrl}/api/create-embed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: promptText,
            embed_type: "youtube",
            query: query,
          }),
        });

        if (!response.ok) {
          // If YouTube search fails (404), fallback to normal AI flow
          if (response.status === 404) {
            console.warn("No YouTube video found, falling back to AI response");
            return false;
          }
          throw new Error(
            `Failed to create YouTube embed: ${response.statusText}`
          );
        }

        const embedData = await response.json();

        // Create normal AI response shape first (using original flow)
        const c1ShapeId = await createAITextShape(promptText);

        // Then add YouTube embed next to the AI response shape
        if (c1ShapeId) {
          // Wait a bit for the shape to be positioned
          await new Promise((resolve) => setTimeout(resolve, 300));

          const embedShapeId = createShapeId();
          const embedWidth = 600;
          const embedHeight = 450;
          const padding = 50;

          // Get position of the AI response shape to place embed next to it
          const aiShapeBounds = editor.getShapePageBounds(c1ShapeId);
          console.log("AI shape bounds:", aiShapeBounds);

          if (aiShapeBounds) {
            const embedX = aiShapeBounds.maxX + padding;
            const embedY = aiShapeBounds.center.y - embedHeight / 2;

            console.log("Creating YouTube embed at:", {
              embedX,
              embedY,
              embedUrl: embedData.embedUrl,
            });

            editor.run(() => {
              editor.createShape({
                id: embedShapeId,
                type: "custom-embed",
                x: embedX,
                y: embedY,
                props: {
                  w: embedWidth,
                  h: embedHeight,
                  embedUrl: embedData.embedUrl,
                  service: embedData.service,
                  query: embedData.query,
                },
              });
            });

            // Create arrow connecting prompt card to YouTube embed
            // Wait a bit for the embed shape to be fully created
            await new Promise((resolve) => setTimeout(resolve, 100));

            const sourceBounds = editor.getShapePageBounds(c1ShapeId);
            const targetBounds = editor.getShapePageBounds(embedShapeId);

            if (sourceBounds && targetBounds) {
              const sourceCenter = getBoundsCenter(sourceBounds);
              const targetCenter = getBoundsCenter(targetBounds);
              const deltaX = targetCenter.x - sourceCenter.x;
              const deltaY = targetCenter.y - sourceCenter.y;

              // Avoid zero-length arrows
              if (Math.abs(deltaX) >= 0.1 || Math.abs(deltaY) >= 0.1) {
                const arrowId = createShapeId();
                editor.run(() => {
                  editor.createShape({
                    id: arrowId,
                    type: "arrow",
                    x: sourceCenter.x,
                    y: sourceCenter.y,
                    props: {
                      start: { x: 0, y: 0 },
                      end: { x: deltaX, y: deltaY },
                      arrowheadStart: "none",
                      arrowheadEnd: "arrow",
                    },
                    meta: {
                      provenance: {
                        sourceId: c1ShapeId,
                        targetId: embedShapeId,
                      },
                    },
                  });

                  createArrowBinding(
                    arrowId,
                    c1ShapeId,
                    "start",
                    sourceCenter,
                    sourceBounds
                  );
                  createArrowBinding(
                    arrowId,
                    embedShapeId,
                    "end",
                    targetCenter,
                    targetBounds
                  );
                });
              }
            }

            console.log("Created YouTube embed shape:", embedShapeId);
          } else {
            console.warn(
              "Could not get bounds for AI response shape:",
              c1ShapeId
            );
          }
        } else {
          console.warn(
            "Failed to create AI text shape, cannot add YouTube embed"
          );
        }

        return true;
      } else {
        // Google Maps embed for food/location
        const query = promptText.replace(/^i want/i, "").trim();

        if (!query) {
          console.warn("No query extracted from food prompt");
          return false;
        }

        // Request geolocation
        const getLocation = () => {
          return new Promise((resolve) => {
            if (!navigator.geolocation) {
              console.warn("Geolocation not supported, using default location");
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
                console.warn(
                  "Geolocation permission denied, using default location"
                );
                resolve({ lat: 37.7749, lng: -122.4194 }); // San Francisco default
              }
            );
          });
        };

        const location = await getLocation();

        const apiUrl = backendUrl || "http://localhost:8001";
        const response = await fetch(`${apiUrl}/api/create-embed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: promptText,
            embed_type: "google_maps",
            query: query,
            lat: location.lat,
            lng: location.lng,
          }),
        });

        if (!response.ok) {
          throw new Error(
            `Failed to create Google Maps embed: ${response.statusText}`
          );
        }

        const embedData = await response.json();
        await createEmbedShape(promptText, embedData);
        return true;
      }
    } catch (error) {
      console.error("Error creating embed:", error);
      // Fall back to normal AI flow
      return false;
    }
  };

  const createAITextShape = async (promptText) => {
    if (!promptText.trim()) return null;

    const selectedShapeData = resolveSelectionForContext();
    const selectedShapeIds = selectedShapeData.map((s) => s.id);
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

        let validPosition = positions.find(
          (pos) => !checkOverlap(pos.x, pos.y)
        );

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
          validPosition = extendedPositions.find(
            (pos) => !checkOverlap(pos.x, pos.y)
          );
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
        type: "c1-response",
        x: position.x,
        y: position.y,
        props: {
          w: newShapeWidth,
          h: newShapeHeight,
          prompt: promptText,
          c1Response: "",
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
      const apiUrl = backendUrl || "http://localhost:8001";
      console.log("Fetching from:", `${apiUrl}/api/ask`);
      const response = await fetch(`${apiUrl}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          shape_ids: selectedShapeIds.length ? selectedShapeIds : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiResponse = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.trim() || !line.startsWith("data: ")) continue;

            const data = line.slice(6).trim();
            if (data === "[DONE]" || !data) continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                aiResponse += parsed.content;

                editor.updateShape({
                  id: c1ShapeId,
                  type: "c1-response",
                  props: {
                    c1Response: aiResponse,
                    isStreaming: true,
                  },
                });
              }
            } catch (e) {
              console.warn("JSON parse error:", e.message);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      editor.updateShape({
        id: c1ShapeId,
        type: "c1-response",
        props: {
          isStreaming: false,
        },
      });
    } catch (error) {
      console.error("AI request failed:", error);
      console.error("Backend URL:", backendUrl);
      editor.updateShape({
        id: c1ShapeId,
        type: "c1-response",
        props: {
          c1Response: `<content thesys="true">{"component": {"component": "Card", "props": {"children": [{"component": "Header", "props": {"title": "Error"}}, {"component": "TextContent", "props": {"textMarkdown": "Failed to generate response: ${error.message}"}}]}}}</content>`,
          isStreaming: false,
        },
      });
    }

    return c1ShapeId;
  };

  return (
    <>
      {/* Source count indicator - eyebrow style with stacked icons */}
      <div
        style={{
          position: "fixed",
          left: "50%",
          bottom: selectedSourcesCount > 0 ? "76px" : "68px",
          transform: "translateX(-50%)",
          width: isFocused ? "50%" : "400px",
          padding: "8px 20px",
          borderRadius: "12px 12px 0 0",
          background:
            "linear-gradient(135deg, rgba(239, 246, 255, 0.98) 0%, rgba(219, 234, 254, 0.98) 100%)",
          borderTop: "1px solid #BFDBFE",
          borderLeft: "1px solid #BFDBFE",
          borderRight: "1px solid #BFDBFE",
          color: "#1E40AF",
          fontSize: "11px",
          fontWeight: "600",
          zIndex: 9999,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          opacity: selectedSourcesCount > 0 ? 1 : 0,
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          backdropFilter: "blur(8px)",
          letterSpacing: "0.025em",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {selectedSourcesCount} SOURCE{selectedSourcesCount !== 1 ? "S" : ""}
        </span>

        {/* Stacked icons like collaborator avatars */}
        <div
          className="icon-stack"
          style={{
            display: "flex",
            alignItems: "center",
            marginLeft: "auto",
            pointerEvents: "auto",
          }}
        >
          {selectedSources.slice(0, 6).map((source, index) => (
            <div
              key={source.type}
              className="icon-avatar"
              data-index={index}
              style={{
                position: "relative",
                marginLeft: index === 0 ? "0" : "-6px",
                width: "22px",
                height: "22px",
                borderRadius: "50%",
                backgroundColor: "white",
                border: `2px solid ${getTypeColor(source.type)}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                zIndex: selectedSources.length - index,
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                animation: `fadeSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) ${
                  index * 0.05
                }s both`,
                cursor: "pointer",
              }}
            >
              <DocumentTypeIcon
                type={source.type}
                color={getTypeColor(source.type)}
              />
              {source.count > 1 && (
                <div
                  style={{
                    position: "absolute",
                    top: "-4px",
                    right: "-4px",
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    backgroundColor: getTypeColor(source.type),
                    color: "white",
                    fontSize: "8px",
                    fontWeight: "700",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1.5px solid white",
                  }}
                >
                  {source.count}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Add keyframe animation and hover effects */}
      <style>
        {`
          @keyframes fadeSlideIn {
            from {
              opacity: 0;
              transform: translateX(-10px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }

          /* Expand icons on hover */
          .icon-stack:hover .icon-avatar {
            margin-left: 4px !important;
            transform: scale(1.1);
            box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15) !important;
          }

          .icon-stack:hover .icon-avatar:first-child {
            margin-left: 0 !important;
          }

          .icon-stack .icon-avatar:hover {
            transform: scale(1.25) translateY(-2px) !important;
            z-index: 1000 !important;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2) !important;
          }
        `}
      </style>

      <form
        style={{
          display: "flex",
          alignItems: "center",
          position: "fixed",
          left: "50%",
          bottom: "16px",
          transform: "translateX(-50%)",
          padding: "12px 20px",
          borderRadius: selectedSourcesCount > 0 ? "0 0 16px 16px" : "16px",
          border: "1px solid #E5E7EB",
          borderTop: selectedSourcesCount > 0 ? "none" : "1px solid #E5E7EB",
          fontSize: "16px",
          transition: "all 0.3s ease-in-out",
          gap: "8px",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
          minHeight: "60px",
          width: isFocused ? "50%" : "400px",
          background: "#FFFFFF",
          color: "#111827",
          zIndex: 10000,
          pointerEvents: "all",
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

            setPrompt("");
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
            border: "none",
            outline: "none",
            background: "transparent",
            color: "inherit",
            fontSize: "inherit",
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
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              border: "none",
              background: prompt.trim() ? "#3B82F6" : "#CBD5E1",
              color: "#FFFFFF",
              cursor: prompt.trim() ? "pointer" : "not-allowed",
            }}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
          >
            ↑
          </button>
        ) : (
          <span style={{ fontSize: "12px", opacity: 0.3 }}>
            {showMacKeybinds ? "⌘ + K" : "Ctrl + K"}
          </span>
        )}
      </form>
    </>
  );
}
