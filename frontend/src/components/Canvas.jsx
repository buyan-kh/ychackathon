import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  Tldraw,
  DefaultToolbar,
  TldrawUiMenuItem,
  useEditor,
  TLComponents,
} from "tldraw";
import { useSyncDemo } from "@tldraw/sync";
import { createShapeId } from "@tldraw/editor";
import PromptInput from "./PromptInput";
import { PdfUploadButton } from "./PdfUploadButton";
import C1PlusButton from "./C1PlusButton";
import { PdfShapeUtil } from "../shapeUtils/PdfShapeUtil";
import { VideoCallShapeUtil } from "../shapeUtils/VideoCallShapeUtil";
import { C1ResponseShapeUtil } from "../shapeUtils/C1ResponseShapeUtil";
import { EmbedShapeUtil } from "../shapeUtils/EmbedShapeUtil";
import { MeetingSummaryShapeUtil } from "../shapeUtils/MeetingSummaryShapeUtil";
import axios from "axios";
import "tldraw/tldraw.css";

const FOCUS_EVENT_NAME = "focus-prompt-input";
const DEFAULT_ROOM_ID = "default";
const TYPED_NOTE_PADDING = 24;
const TYPED_NOTE_MIN_WIDTH = 240;
const TYPED_NOTE_MIN_HEIGHT = 160;
const TYPED_NOTE_MAX_WIDTH = 900;
const TYPED_NOTE_MAX_CHARS_FOR_WIDTH = 600;
const TYPED_NOTE_MIN_CONTENT_WIDTH =
  TYPED_NOTE_MIN_WIDTH - TYPED_NOTE_PADDING * 2;

function CustomUI() {
  return (
    <>
      <PromptInput focusEventName={FOCUS_EVENT_NAME} />
      <C1PlusButton />
    </>
  );
}

const components: TLComponents = {
  Toolbar: () => {
    return (
      <div
        style={{
          position: "fixed",
          top: "40%",
          left: 8,
          transform: "translateY(-50%)",
        }}
      >
        <DefaultToolbar orientation="vertical" />
      </div>
    );
  },
  InFrontOfTheCanvas: CustomUI,
};

// Custom shape utilities
const customShapeUtils = [
  PdfShapeUtil,
  VideoCallShapeUtil,
  C1ResponseShapeUtil,
  EmbedShapeUtil,
  MeetingSummaryShapeUtil,
];

const collectTextShapeIds = (seedIds, editor) => {
  const visited = new Set();
  const textIds = new Set();
  const queue = [...seedIds];

  while (queue.length) {
    const currentId = queue.pop();
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);

    const shape = editor.getShape(currentId);
    if (!shape) continue;

    if (shape.type === "text") {
      textIds.add(shape.id);
      continue;
    }

    const childIds = editor.getSortedChildIds?.(shape.id) ?? [];
    queue.push(...childIds);
  }

  return Array.from(textIds);
};

const clampNumber = (value, min, max) => Math.max(min, Math.min(max, value));

const isTypedNoteFrame = (shape) =>
  shape?.type === "frame" && shape.meta?.typedNoteId === shape.id;

const getTypedFrameIdFromParent = (editor, parentId) => {
  if (!parentId) return null;
  const parentShape = editor.getShape(parentId);
  return isTypedNoteFrame(parentShape) ? parentShape.id : null;
};

const getTypedFrameIdForSnapshot = (editor, snapshot) => {
  if (!snapshot) return null;
  if (snapshot.parentId) {
    const parentFrameId = getTypedFrameIdFromParent(editor, snapshot.parentId);
    if (parentFrameId) {
      return parentFrameId;
    }
  }

  if (snapshot.meta?.typedFrameId && editor.getSortedChildIdsForParent) {
    const childIds =
      editor.getSortedChildIdsForParent(snapshot.meta.typedFrameId) || [];
    if (Array.isArray(childIds) && childIds.includes(snapshot.id)) {
      return snapshot.meta.typedFrameId;
    }
  }

  return null;
};

const computeTypedNoteWidthLimit = (charCount) => {
  if (typeof charCount !== "number" || Number.isNaN(charCount)) {
    return TYPED_NOTE_MIN_WIDTH;
  }
  const limitedChars = clampNumber(
    charCount,
    0,
    TYPED_NOTE_MAX_CHARS_FOR_WIDTH
  );
  if (limitedChars === 0) {
    return TYPED_NOTE_MIN_WIDTH;
  }
  const ratio = limitedChars / TYPED_NOTE_MAX_CHARS_FOR_WIDTH;
  return (
    TYPED_NOTE_MIN_WIDTH +
    ratio * (TYPED_NOTE_MAX_WIDTH - TYPED_NOTE_MIN_WIDTH)
  );
};

export default function Canvas() {
  const editorRef = useRef(null);
  const typedNoteSyncTimers = useRef({});

  // Use tldraw's built-in demo sync with custom shapes
  const store = useSyncDemo({
    roomId: DEFAULT_ROOM_ID,
    shapeUtils: customShapeUtils,
  });

  useEffect(() => {
    return () => {
      Object.values(typedNoteSyncTimers.current).forEach((timer) => {
        if (timer) {
          clearTimeout(timer);
        }
      });
    };
  }, []);

  // Handle video call join - create as draggable canvas shape
  const handleJoinVideoCall = async () => {
    try {
      const backendUrl =
        process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
      const response = await axios.post(`${backendUrl}/api/video/room`, {
        room_id: DEFAULT_ROOM_ID,
      });

      // Create a video call shape on the canvas
      if (editorRef.current) {
        const editor = editorRef.current;
        const shapeId = createShapeId();

        // Get viewport center
        const viewport = editor.getViewportPageBounds();
        const centerX = viewport.x + viewport.w / 2;
        const centerY = viewport.y + viewport.h / 2;

        editor.createShape({
          id: shapeId,
          type: "video-call",
          x: centerX - 400, // Center the shape (half of default width)
          y: centerY - 300, // Center the shape (half of default height)
          props: {
            roomUrl: response.data.url,
            token: response.data.token, // Token with transcription permissions
            w: 800,
            h: 600,
          },
        });

        // Select the newly created shape
        editor.setSelectedShapes([shapeId]);
      }
    } catch (error) {
      console.error("Failed to get video room:", error);
      const errorMessage =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        error.message ||
        "Unknown error occurred";
      alert(`Failed to join video call: ${errorMessage}`);
    }
  };

  // Register Cmd+K shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        window.dispatchEvent(new Event(FOCUS_EVENT_NAME));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Handle editor mount
  const handleMount = (editor) => {
    editorRef.current = editor;

    // Add listener to prevent resizing of groups with noResize meta flag
    editor.sideEffects.registerBeforeChangeHandler("shape", (prev, next) => {
      if (!next) {
        return next;
      }

      if (next.type === "text") {
        const prevTypedFrameId = getTypedFrameIdForSnapshot(editor, prev);

        if (prevTypedFrameId) {
          if (next.parentId !== prevTypedFrameId) {
            return {
              ...next,
              parentId: prevTypedFrameId,
              meta: {
                ...next.meta,
                typedFrameId: prevTypedFrameId,
              },
            };
          }

          if (next.meta?.typedFrameId !== prevTypedFrameId) {
            return {
              ...next,
              meta: {
                ...next.meta,
                typedFrameId: prevTypedFrameId,
              },
            };
          }
        } else if (next.parentId) {
          const typedParentId = getTypedFrameIdFromParent(
            editor,
            next.parentId
          );

          if (typedParentId && next.meta?.typedFrameId !== typedParentId) {
            return {
              ...next,
              meta: {
                ...next.meta,
                typedFrameId: typedParentId,
              },
            };
          }
        }
      }

      // Check if this is a group with noResize flag
      if (next.type === "group" && next.meta?.noResize) {
        // If size changed, revert to previous size
        // Groups don't have w/h props directly, so we check if any child transformations happened
        // For groups, we just prevent the resize by returning the previous state
        // But allow position changes
        if (prev && (prev.x !== next.x || prev.y !== next.y)) {
          // Allow movement
          return next;
        }
        // For any other changes, keep the previous state to prevent resize
        if (prev && prev.rotation === next.rotation) {
          return { ...next, x: prev.x || next.x, y: prev.y || next.y };
        }
      }
      return next;
    });

    // Remove provenance arrows when their target response shape is deleted
    editor.sideEffects.registerAfterDeleteHandler("shape", (shape) => {
      if (shape.type !== "c1-response") {
        return;
      }

      const arrowsToRemove = editor
        .getCurrentPageShapes()
        .filter(
          (candidate) =>
            candidate.type === "arrow" &&
            candidate.meta?.provenance?.targetId === shape.id
        );

      if (arrowsToRemove.length) {
        editor.deleteShapes(arrowsToRemove.map((arrow) => arrow.id));
      }
    });

    editor.sideEffects.registerAfterChangeHandler("shape", (prev, next) => {
      if (!next || next.type !== "text") {
        return;
      }
      if (prev?.props?.text === next.props?.text) {
        return;
      }
      const frameId = findTypedFrameAncestor(editor, next.id);
      if (frameId) {
        scheduleTypedNoteSync(frameId, editor);
      }
    });
  };

  const handleUploadSuccess = (documentData) => {
    console.log("PDF uploaded successfully:", documentData);

    // Create a PDF shape on the canvas
    if (editorRef.current) {
      const editor = editorRef.current;
      const shapeId = createShapeId();

      // Get viewport center using viewportPageBounds
      const viewport = editor.getViewportPageBounds();
      const centerX = viewport.x + viewport.w / 2;
      const centerY = viewport.y + viewport.h / 2;

      editor.createShape({
        id: shapeId,
        type: "pdf-viewer",
        x: centerX - 300, // Center the shape (half of default width)
        y: centerY - 400, // Center the shape (half of default height)
        props: {
          documentUrl: documentData.public_url,
          documentId: documentData.document_id,
          filename: documentData.filename,
          w: 600,
          h: 800,
        },
      });

      // Select the newly created shape
      editor.setSelectedShapes([shapeId]);

      const backendUrl = process.env.REACT_APP_BACKEND_URL || "";
      if (backendUrl && documentData?.document_id) {
        fetch(`${backendUrl}/api/pdf/canvas-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shapeId,
            documentId: documentData.document_id,
            roomId: DEFAULT_ROOM_ID,
          }),
        }).catch((error) => {
          console.error("Failed to create pdf canvas link", error);
        });
      }
    }
  };

  const waitForNextFrame = () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );

  const collectHandwritingStrokeIds = (seedIds, editor) => {
    const visited = new Set();
    const strokes = new Set();
    const queue = [...seedIds];

    while (queue.length) {
      const currentId = queue.pop();
      if (!currentId || visited.has(currentId)) continue;
      visited.add(currentId);

      const shape = editor.getShape(currentId);
      if (!shape) continue;

      if (shape.type === "draw" && !shape.props.isClosed) {
        strokes.add(shape.id);
        continue;
      }

      const childIds = editor.getSortedChildIdsForParent
        ? [...editor.getSortedChildIdsForParent(shape.id)]
        : [];
      queue.push(...childIds);
    }

    return Array.from(strokes);
  };

  // Helper function to extract plain text from tldraw's richText structure (ProseMirror format)
  const extractTextFromRichText = (richText) => {
    if (!richText || typeof richText !== "object") {
      return "";
    }

    // If it's a text node, return the text directly
    if (richText.type === "text" && richText.text) {
      return richText.text;
    }

    // If it has content array, recursively extract text from all children
    if (Array.isArray(richText.content)) {
      return richText.content
        .map((node) => extractTextFromRichText(node))
        .join("");
    }

    return "";
  };

  const gatherTextShapesUnderFrame = (editor, frameId) => {
    const results = [];
    const stack = editor.getSortedChildIdsForParent
      ? [...editor.getSortedChildIdsForParent(frameId)]
      : [];

    while (stack.length) {
      const currentId = stack.pop();
      const shape = editor.getShape(currentId);
      if (!shape) continue;

      if (shape.type === "text") {
        const bounds = editor.getShapePageBounds(shape.id);

        // Extract text from tldraw text shapes
        // tldraw stores text in richText structure (ProseMirror format)
        let textContent = "";

        // Method 1: Extract from richText structure (most common in newer tldraw)
        if (shape.props?.richText) {
          textContent = extractTextFromRichText(shape.props.richText);
        }

        // Method 2: Direct props.text (fallback for older format)
        if (!textContent && shape.props?.text) {
          textContent =
            typeof shape.props.text === "string"
              ? shape.props.text
              : String(shape.props.text);
        }

        // Method 3: Try using editor API if available
        if (!textContent && editor.getShapeUtil) {
          try {
            const util = editor.getShapeUtil(shape.type);
            if (util && typeof util.getTextContent === "function") {
              textContent = util.getTextContent(shape) || "";
            }
          } catch (e) {
            // Ignore errors
          }
        }

        results.push({
          id: shape.id,
          text: textContent,
          props: {
            font: shape.props?.font,
            size: shape.props?.size,
            color: shape.props?.color,
            align: shape.props?.align,
            // Include all props for debugging
            ...shape.props,
          },
          bounds,
        });
        continue;
      }

      const childIds = editor.getSortedChildIdsForParent
        ? [...editor.getSortedChildIdsForParent(shape.id)]
        : [];
      stack.push(...childIds);
    }

    results.sort((a, b) => {
      const aBounds = a.bounds;
      const bBounds = b.bounds;
      const ay = aBounds ? aBounds.y : 0;
      const by = bBounds ? bBounds.y : 0;
      if (ay === by) {
        const ax = aBounds ? aBounds.x : 0;
        const bx = bBounds ? bBounds.x : 0;
        return ax - bx;
      }
      return ay - by;
    });

    return results.map((entry, index) => ({
      ...entry,
      order: index,
    }));
  };

  const findTypedFrameAncestor = (editor, shapeId) => {
    let current = editor.getShape(shapeId);
    while (current) {
      if (
        current.type === "frame" &&
        current.meta?.typedNoteId === current.id
      ) {
        return current.id;
      }
      const parent = editor.getShapeParent(current);
      if (!parent) break;
      current = parent;
    }
    return null;
  };

  const syncTypedNote = async (frameId, editor) => {
    if (!editor || !frameId) return;
    const frame = editor.getShape(frameId);
    if (!frame) return;

    const textShapes = gatherTextShapesUnderFrame(editor, frameId);
    if (!textShapes.length) return;

    const totalChars = textShapes.reduce(
      (sum, entry) => sum + (entry.text?.length ?? 0),
      0
    );
    const widthLimit = computeTypedNoteWidthLimit(totalChars);
    const targetContentWidth = Math.max(
      TYPED_NOTE_MIN_CONTENT_WIDTH,
      widthLimit - TYPED_NOTE_PADDING * 2
    );

    editor.run(() => {
      const frameBounds = editor.getShapePageBounds(frameId);
      if (!frameBounds) return;

      let newWidth = 0;
      let newHeight = 0;

      textShapes.forEach((entry) => {
        const shape = editor.getShape(entry.id);
        if (!shape || shape.type !== "text") return;

        const needsWidthUpdate =
          shape.props?.autoSize !== false ||
          Math.abs((shape.props?.w ?? 0) - targetContentWidth) > 1;
        const needsMetaUpdate = shape.meta?.typedFrameId !== frameId;

        if (needsWidthUpdate || needsMetaUpdate) {
          const updatePayload = { id: shape.id, type: "text" };
          let shouldUpdate = false;

          if (needsWidthUpdate) {
            updatePayload.props = {
              ...shape.props,
              autoSize: false,
              w: targetContentWidth,
            };
            shouldUpdate = true;
          }

          if (needsMetaUpdate) {
            updatePayload.meta = {
              ...shape.meta,
              typedFrameId: frameId,
            };
            shouldUpdate = true;
          }

          if (shouldUpdate) {
            editor.updateShape(updatePayload);
          }
        }

        const bounds = editor.getShapePageBounds(entry.id);
        if (!bounds) return;
        const relativeRight = bounds.x + bounds.w - frameBounds.x;
        const relativeBottom = bounds.y + bounds.h - frameBounds.y;
        newWidth = Math.max(newWidth, relativeRight + TYPED_NOTE_PADDING);
        newHeight = Math.max(newHeight, relativeBottom + TYPED_NOTE_PADDING);
      });

      const minWidth = TYPED_NOTE_MIN_WIDTH;
      const minHeight = TYPED_NOTE_MIN_HEIGHT;
      const unclampedWidth = Math.max(newWidth, minWidth);
      const finalWidth = Math.max(
        minWidth,
        Math.min(unclampedWidth, widthLimit)
      );
      const finalHeight = Math.max(newHeight, minHeight);

      if (
        Math.abs(finalWidth - (frame.props?.w ?? 0)) > 1 ||
        Math.abs(finalHeight - (frame.props?.h ?? 0)) > 1
      ) {
        editor.updateShape({
          id: frame.id,
          type: frame.type,
          props: {
            ...frame.props,
            w: finalWidth,
            h: finalHeight,
          },
        });
      }
    });

    const updatedFrame = editor.getShape(frameId);
    if (!updatedFrame) return;

    const backendUrl = process.env.REACT_APP_BACKEND_URL || "";
    if (!backendUrl) {
      console.warn(
        "REACT_APP_BACKEND_URL is not set; skipping typed note sync."
      );
      return;
    }

    const payloadShapes = textShapes.map((entry) => {
      const liveShape = editor.getShape(entry.id);
      const mergedProps = {
        ...(liveShape?.props ?? entry.props ?? {}),
        text: entry.text,
      };

      console.log("Text shape entry:", {
        id: entry.id,
        text: entry.text,
        props: mergedProps,
        original: entry,
      });

      return {
        shapeId: entry.id,
        text: entry.text,
        order: entry.order,
        // Include the extracted text inside props as a fallback for the backend
        props: mergedProps,
      };
    });

    console.log("Sending typed note sync:", {
      frameId,
      textShapesCount: payloadShapes.length,
      payloadShapes,
    });

    const bounds = {
      x: updatedFrame.x,
      y: updatedFrame.y,
      w: updatedFrame.props?.w ?? 0,
      h: updatedFrame.props?.h ?? 0,
    };

    try {
      const response = await fetch(`${backendUrl}/api/typed-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frameId,
          roomId: DEFAULT_ROOM_ID,
          bounds,
          textShapes: payloadShapes,
        }),
      });
      const result = await response.json();
      console.log("Typed note sync response:", result);
    } catch (error) {
      console.error("Failed to sync typed note", error);
    }
  };

  const scheduleTypedNoteSync = (frameId, editor) => {
    if (!frameId || !editor) return;
    const timers = typedNoteSyncTimers.current;
    if (timers[frameId]) {
      clearTimeout(timers[frameId]);
    }
    timers[frameId] = setTimeout(() => {
      syncTypedNote(frameId, editor);
    }, 600);
  };

  // Helper function to auto-frame handwriting strokes and capture image
  const autoFrameHandwriting = async (editor, seedIds) => {
    if (!editor) return null;

    // Get selected shape IDs
    const selectedIds = seedIds ?? editor.getSelectedShapeIds();
    if (selectedIds.length === 0) return null;

    const handwritingIds = collectHandwritingStrokeIds(selectedIds, editor);

    if (handwritingIds.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    handwritingIds.forEach((id) => {
      const shapeBounds = editor.getShapePageBounds(id);
      if (!shapeBounds) return;
      minX = Math.min(minX, shapeBounds.x);
      minY = Math.min(minY, shapeBounds.y);
      maxX = Math.max(maxX, shapeBounds.x + shapeBounds.w);
      maxY = Math.max(maxY, shapeBounds.y + shapeBounds.h);
    });

    if (
      !isFinite(minX) ||
      !isFinite(minY) ||
      !isFinite(maxX) ||
      !isFinite(maxY)
    ) {
      console.warn("Unable to calculate handwriting bounds for selection");
      return null;
    }

    // Add padding
    const padding = 24;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const frameWidth = maxX - minX;
    const frameHeight = maxY - minY;
    const boundsPayload = {
      x: minX,
      y: minY,
      w: frameWidth,
      h: frameHeight,
    };

    let frameId = null;
    let captureIds = [];

    // Wrap all operations in editor.run for proper history/sync
    editor.run(() => {
      // Create frame shape
      frameId = createShapeId();
      editor.createShape({
        id: frameId,
        type: "frame",
        x: minX,
        y: minY,
        props: {
          w: frameWidth,
          h: frameHeight,
          name: "Handwriting Note",
        },
        meta: {
          handwritingNoteId: frameId,
          handwritingStrokeIds: handwritingIds,
        },
      });

      // Send frame to back so it appears behind the strokes
      editor.sendToBack([frameId]);

      // Reparent handwriting strokes into the frame
      editor.reparentShapes(handwritingIds, frameId);

      captureIds = [frameId, ...handwritingIds];
      editor.setSelectedShapes([frameId]);
    });

    if (!frameId) {
      return null;
    }

    return {
      frameId,
      captureIds,
      handwritingIds,
      bounds: boundsPayload,
    };
  };

  // Helper function to capture and upload frame image
  const captureAndUploadFrame = async (
    editor,
    capturePayload,
    roomId = DEFAULT_ROOM_ID
  ) => {
    if (!editor || !capturePayload) return;

    const { frameId, captureIds } = capturePayload;
    const idsToExport = captureIds?.length
      ? captureIds
      : frameId
      ? [frameId]
      : [];

    if (!idsToExport.length) return;

    try {
      console.log("Starting frame capture for ids:", idsToExport.join(", "));

      // Give tldraw a moment to render the frame
      await waitForNextFrame();

      // Capture frame as blob using tldraw's export helpers
      const imageResult = await editor.toImage(idsToExport, {
        format: "png",
        background: true,
        pixelRatio: 2,
        padding: 0,
      });

      const blob = imageResult?.blob;

      if (!blob) {
        console.error("Failed to capture frame image - blob is null");
        return;
      }

      console.log("Frame captured, blob size:", blob.size);

      // Upload to backend
      const formData = new FormData();

      if (typeof File !== "undefined") {
        const file = new File([blob], `${frameId || "handwriting-note"}.png`, {
          type: "image/png",
        });
        formData.append("file", file);
      } else {
        formData.append("file", blob, `${frameId || "handwriting-note"}.png`);
      }

      if (frameId) {
        formData.append("frameId", frameId);
      }
      formData.append("timestamp", new Date().toISOString());
      if (capturePayload?.bounds) {
        formData.append("bounds", JSON.stringify(capturePayload.bounds));
      }
      if (capturePayload?.handwritingIds?.length) {
        formData.append(
          "handwritingShapeIds",
          JSON.stringify(capturePayload.handwritingIds)
        );
      }
      if (roomId) {
        formData.append("roomId", roomId);
      }

      const backendUrl = process.env.REACT_APP_BACKEND_URL || "";
      if (!backendUrl) {
        console.warn(
          "REACT_APP_BACKEND_URL is not set; skipping handwriting upload."
        );
        return;
      }
      const uploadUrl = `${backendUrl}/api/handwriting-upload`;
      console.log("Uploading handwriting snapshot to:", uploadUrl);

      const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let errorText = "";
        try {
          const errorClone = response.clone();
          errorText = await errorClone.text();
        } catch (cloneError) {
          console.warn(
            "Failed to read handwriting upload error body",
            cloneError
          );
        }
        throw new Error(
          `Upload failed (${response.status}): ${response.statusText}${
            errorText ? ` - ${errorText}` : ""
          }`
        );
      }

      let data = null;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.warn("Handwriting upload response is not JSON", jsonError);
      }
      console.log("Frame uploaded successfully:", data);
    } catch (error) {
      console.error("Error capturing or uploading frame:", error);
      // Don't block UI - just log the error
    }
  };

  // Define custom overrides for keyboard shortcuts and component behavior
  const overrides = useMemo(
    () => ({
      actions(editor, actions) {
        return {
          ...actions,
          "auto-frame-handwriting": {
            id: "auto-frame-handwriting",
            label: "Frame Handwriting",
            kbd: "s",
            async onSelect() {
              if (!editor) return;
              const selectedIds = editor.getSelectedShapeIds();
              if (!selectedIds.length) return;

              const textIds = collectTextShapeIds(selectedIds, editor);
              const handwritingIds = collectHandwritingStrokeIds(
                selectedIds,
                editor
              );

              if (textIds.length && handwritingIds.length === 0) {
                const existingTypedFrame = selectedIds.find((id) => {
                  const shape = editor.getShape(id);
                  return (
                    shape?.type === "frame" &&
                    shape.meta?.typedNoteId === shape.id
                  );
                });
                if (existingTypedFrame) {
                  await syncTypedNote(existingTypedFrame, editor);
                  return;
                }

                const typedFrame = await autoFrameTypedText(editor, textIds);
                if (typedFrame) {
                  await syncTypedNote(typedFrame.frameId, editor);
                }
                return;
              }

              if (handwritingIds.length) {
                const frameData = await autoFrameHandwriting(
                  editor,
                  selectedIds
                );
                if (frameData) {
                  await captureAndUploadFrame(
                    editor,
                    frameData,
                    DEFAULT_ROOM_ID
                  );
                }
                return;
              }

              console.warn(
                "Select handwriting strokes or text boxes before pressing S."
              );
            },
          },
        };
      },
    }),
    []
  );

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      {/* Button group - bottom left */}
      <div
        style={{
          position: "absolute",
          bottom: "80px",
          left: "16px",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {/* Upload PDF button - icon only */}
        <PdfUploadButton onUploadSuccess={handleUploadSuccess} iconOnly />

        {/* Video call button - icon only */}
        <button
          onClick={handleJoinVideoCall}
          style={{
            padding: "12px",
            background: "#3B82F6",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(59, 130, 246, 0.3)",
            transition: "all 0.2s",
            width: "44px",
            height: "44px",
          }}
          onMouseEnter={(e) => {
            e.target.style.background = "#2563EB";
            e.target.style.transform = "translateY(-1px)";
            e.target.style.boxShadow = "0 4px 12px rgba(59, 130, 246, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.target.style.background = "#3B82F6";
            e.target.style.transform = "translateY(0)";
            e.target.style.boxShadow = "0 2px 8px rgba(59, 130, 246, 0.3)";
          }}
          title="Join Video Call"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M23 7l-7 5 7 5V7z" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        </button>
      </div>

      {/* tldraw canvas */}
      <Tldraw
        store={store}
        components={components}
        onMount={handleMount}
        overrides={overrides}
      />
    </div>
  );
}

const autoFrameTypedText = async (editor, seedTextIds) => {
  if (!editor) return null;

  const baseIds = seedTextIds ?? editor.getSelectedShapeIds();
  if (!baseIds.length) return null;

  const textIds = collectTextShapeIds(baseIds, editor);
  if (!textIds.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  textIds.forEach((id) => {
    const bounds = editor.getShapePageBounds(id);
    if (!bounds) return;
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.w);
    maxY = Math.max(maxY, bounds.y + bounds.h);
  });

  if (
    !isFinite(minX) ||
    !isFinite(minY) ||
    !isFinite(maxX) ||
    !isFinite(maxY)
  ) {
    console.warn("Unable to calculate typed note bounds for selection");
    return null;
  }

  const padding = TYPED_NOTE_PADDING;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  const frameWidth = maxX - minX;
  const frameHeight = maxY - minY;
  const boundsPayload = {
    x: minX,
    y: minY,
    w: frameWidth,
    h: frameHeight,
  };

  let frameId = null;

  editor.run(() => {
    frameId = createShapeId();
    editor.createShape({
      id: frameId,
      type: "frame",
      x: minX,
      y: minY,
      props: {
        w: frameWidth,
        h: frameHeight,
        name: "Typed Note",
      },
      meta: {
        typedNoteId: frameId,
      },
    });

    editor.reparentShapes(textIds, frameId);

    textIds.forEach((textId) => {
      const textShape = editor.getShape(textId);
      if (!textShape || textShape.type !== "text") return;
      editor.updateShape({
        id: textShape.id,
        type: "text",
        meta: {
          ...textShape.meta,
          typedFrameId: frameId,
        },
      });
    });

    editor.setSelectedShapes([frameId]);
  });

  if (!frameId) {
    return null;
  }

  return {
    frameId,
    textIds,
    bounds: boundsPayload,
  };
};
