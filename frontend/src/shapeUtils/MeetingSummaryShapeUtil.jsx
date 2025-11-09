import { BaseBoxShapeUtil, HTMLContainer } from "tldraw";
import React, { memo, useLayoutEffect, useRef } from "react";
import { C1Component } from "@thesysai/genui-sdk";
import { ThemeProvider } from "@crayonai/react-ui";

// Memoized component to prevent unnecessary re-renders
const MeetingSummaryComponent = memo(({ shape, editor }) => {
  const contentRef = useRef(null);
  const hasSummary =
    shape.props.summaryContent && shape.props.summaryContent.length > 0;
  const isStreaming = shape.props.isStreaming || false;

  // Get theme from editor
  const isDarkMode = editor.user.getIsDarkMode();
  const themeMode = isDarkMode === true ? "dark" : "light";

  // Auto-resize as content grows, only expanding height to avoid jitter
  useLayoutEffect(() => {
    if (!contentRef.current || !hasSummary) return;

    let rafId = null;
    let lastUpdate = 0;

    const scheduleHeightUpdate = (force = false) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!contentRef.current) return;

        const measuredHeight = Math.max(
          300,
          contentRef.current.scrollHeight + 48
        );

        const heightDelta = measuredHeight - shape.props.h;
        const now = Date.now();

        if (!force) {
          if (heightDelta < 12) return; // Only expand when noticeably larger
          if (now - lastUpdate < 120) return; // Throttle updates
        }

        lastUpdate = now;
        editor.updateShape({
          id: shape.id,
          type: shape.type,
          props: {
            ...shape.props,
            h: measuredHeight,
          },
        });
      });
    };

    const resizeObserver = new ResizeObserver(() => scheduleHeightUpdate());
    resizeObserver.observe(contentRef.current);
    scheduleHeightUpdate(true);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [editor, hasSummary, shape.id, shape.props, shape.type]);

  if (!hasSummary) {
    return (
      <HTMLContainer>
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            alignItems: "center",
            justifyContent: "center",
            border: "2px dashed",
            borderColor: isDarkMode ? "#4B5563" : "#D1D5DB",
            borderRadius: "12px",
            padding: "24px",
            background: isDarkMode
              ? "rgba(31, 41, 55, 0.5)"
              : "rgba(249, 250, 251, 1)",
          }}
        >
          <div
            style={{
              width: "32px",
              height: "32px",
              border: "2px solid transparent",
              borderTopColor: "#3B82F6",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <p style={{ fontSize: "14px", color: "#6B7280" }}>
            Generating meeting summary...
          </p>
        </div>
      </HTMLContainer>
    );
  }

  return (
    <HTMLContainer
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        overflow: "visible",
        pointerEvents: "all",
        minHeight: shape.props.h,
      }}
    >
      <div ref={contentRef} style={{ width: "100%" }}>
        {/* Meeting metadata header */}
        <div
          style={{
            padding: "12px 16px",
            marginBottom: "12px",
            borderRadius: "8px",
            border: "1px solid",
            fontSize: "14px",
            backgroundColor: isDarkMode ? "#1F2937" : "#F0F9FF",
            borderColor: isDarkMode ? "#374151" : "#BAE6FD",
            color: isDarkMode ? "#E5E7EB" : "#0C4A6E",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span style={{ fontSize: "18px" }}>📝</span>
            <span style={{ fontWeight: "600", fontSize: "16px" }}>
              Meeting Summary
            </span>
          </div>
          {shape.props.metadata && (
            <div style={{ fontSize: "12px", opacity: 0.8, display: "flex", flexDirection: "column", gap: "4px" }}>
              {shape.props.metadata.timestamp && (
                <div>📅 {new Date(shape.props.metadata.timestamp).toLocaleString()}</div>
              )}
              {shape.props.metadata.duration && (
                <div>⏱️ Duration: {shape.props.metadata.duration}</div>
              )}
              {shape.props.metadata.transcriptLength && (
                <div>💬 Words: {shape.props.metadata.transcriptLength}</div>
              )}
            </div>
          )}
        </div>

        {/* C1 rendered summary */}
        <ThemeProvider mode={themeMode}>
          <div
            style={{
              background: isDarkMode ? "#111827" : "#FFFFFF",
              borderRadius: "8px",
              overflow: "hidden",
              border: "1px solid",
              borderColor: isDarkMode ? "#374151" : "#E5E7EB",
            }}
          >
            <C1Component
              c1Response={shape.props.summaryContent}
              isStreaming={isStreaming}
            />
          </div>
        </ThemeProvider>
      </div>
    </HTMLContainer>
  );
});

MeetingSummaryComponent.displayName = "MeetingSummaryComponent";

export class MeetingSummaryShapeUtil extends BaseBoxShapeUtil {
  static type = "meeting-summary";

  getDefaultProps() {
    return {
      w: 600,
      h: 300,
      summaryContent: "",
      isStreaming: false,
      metadata: null,
    };
  }

  onResize = (shape, info) => {
    const { scaleX } = info;
    return {
      props: {
        ...shape.props,
        w: Math.max(400, shape.props.w * scaleX),
        // Keep height auto-managed by content
      },
    };
  };

  component = (shape) => {
    return <MeetingSummaryComponent shape={shape} editor={this.editor} />;
  };

  indicator(shape) {
    return <rect width={shape.props.w} height={shape.props.h} />;
  }
}

// Add keyframe animations
if (typeof document !== "undefined") {
  const existingStyle = document.getElementById("meeting-summary-animations");
  if (!existingStyle) {
    const style = document.createElement("style");
    style.id = "meeting-summary-animations";
    style.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
}
