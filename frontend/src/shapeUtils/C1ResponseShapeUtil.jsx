import { BaseBoxShapeUtil, HTMLContainer } from 'tldraw';
import React, { memo, useLayoutEffect, useRef } from 'react';
import { C1Component } from '@thesysai/genui-sdk';
import { ThemeProvider } from '@crayonai/react-ui';

// Memoized component to prevent unnecessary re-renders
const C1ResponseComponent = memo(({ shape, editor }) => {
  const contentRef = useRef(null);
  const hasContent = shape.props.c1Response && shape.props.c1Response.length > 0;
  const isStreaming = shape.props.isStreaming || false;
  
  // Get theme from editor
  const isDarkMode = editor.user.getIsDarkMode();
  const themeMode = isDarkMode === true ? 'dark' : 'light';

  // Auto-resize based on content height
  useLayoutEffect(() => {
    if (!contentRef.current || !hasContent) return;

    let rafId = null;
    let timeoutId = null;
    let isUpdating = false;

    const updateShapeHeight = () => {
      if (!contentRef.current || isUpdating) return;
      
      // Use requestAnimationFrame to batch updates and prevent ResizeObserver loops
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      
      rafId = requestAnimationFrame(() => {
        if (!contentRef.current) return;
        
        const newHeight = Math.max(200, contentRef.current.scrollHeight + 40);
        
        // Only update if height changed significantly
        if (Math.abs(newHeight - shape.props.h) > 10) {
          isUpdating = true;
          
          // Use setTimeout to defer the update and break the ResizeObserver loop
          timeoutId = setTimeout(() => {
            try {
              editor.updateShape({
                id: shape.id,
                type: shape.type,
                props: {
                  ...shape.props,
                  h: newHeight,
                },
              });
            } catch (error) {
              // Silently ignore ResizeObserver errors
              if (!error?.message?.includes('ResizeObserver')) {
                console.error('Error updating shape height:', error);
              }
            } finally {
              isUpdating = false;
            }
          }, 0);
        }
      });
    };

    const resizeObserver = new ResizeObserver((entries) => {
      // Wrap in try-catch to prevent ResizeObserver errors from bubbling
      try {
        updateShapeHeight();
      } catch (error) {
        // Silently ignore ResizeObserver loop errors
        if (!error?.message?.includes('ResizeObserver')) {
          console.error('ResizeObserver error:', error);
        }
      }
    });
    
    resizeObserver.observe(contentRef.current);
    
    // Initial update with delay to avoid immediate ResizeObserver trigger
    timeoutId = setTimeout(() => {
      updateShapeHeight();
    }, 100);
    
    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resizeObserver.disconnect();
    };
  }, [editor, shape.id, shape.type, shape.props.h, hasContent]);

  if (!hasContent) {
    return (
      <HTMLContainer>
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px dashed',
            borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
            borderRadius: '12px',
            padding: '24px',
            background: isDarkMode ? 'rgba(31, 41, 55, 0.5)' : 'rgba(249, 250, 251, 1)',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              border: '2px solid transparent',
              borderTopColor: '#3B82F6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <p style={{ fontSize: '14px', color: '#6B7280' }}>Generating UI...</p>
        </div>
      </HTMLContainer>
    );
  }

  return (
    <HTMLContainer
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        overflow: 'visible',
        pointerEvents: 'all',
      }}
    >
      <div ref={contentRef} style={{ width: '100%' }}>
        {shape.props.prompt && (
          <div
            style={{
              padding: '8px 12px',
              marginBottom: '12px',
              borderRadius: '6px',
              border: '1px solid',
              fontSize: '14px',
              fontWeight: '500',
              backgroundColor: isDarkMode ? '#1F2937' : '#EFF6FF',
              borderColor: isDarkMode ? '#374151' : '#BFDBFE',
              color: isDarkMode ? '#E5E7EB' : '#1E40AF',
            }}
          >
            <span style={{ fontWeight: '600' }}>Q: </span>
            {shape.props.prompt}
          </div>
        )}
        
        <ThemeProvider mode={themeMode}>
          <div style={{
            background: isDarkMode ? '#111827' : '#FFFFFF',
            borderRadius: '8px',
            overflow: 'hidden',
          }}>
            <C1Component 
              c1Response={shape.props.c1Response} 
              isStreaming={isStreaming}
            />
          </div>
        </ThemeProvider>
      </div>
    </HTMLContainer>
  );
});

C1ResponseComponent.displayName = 'C1ResponseComponent';

export class C1ResponseShapeUtil extends BaseBoxShapeUtil {
  static type = 'c1-response';

  getDefaultProps() {
    return {
      w: 600,
      h: 300,
      c1Response: '',
      isStreaming: false,
      prompt: '',
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
    return <C1ResponseComponent shape={shape} editor={this.editor} />;
  };

  indicator(shape) {
    return <rect width={shape.props.w} height={shape.props.h} />;
  }
}

// Add keyframe animations
if (typeof document !== 'undefined') {
  const existingStyle = document.getElementById('c1-response-animations');
  if (!existingStyle) {
    const style = document.createElement('style');
    style.id = 'c1-response-animations';
    style.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `;
    document.head.appendChild(style);
  }
}

