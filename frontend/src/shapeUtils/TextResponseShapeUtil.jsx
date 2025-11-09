import { BaseBoxShapeUtil, HTMLContainer, type TLResizeInfo } from 'tldraw';
import type { TextResponseShape } from '../shapes/TextResponseShape';

export class TextResponseShapeUtil extends BaseBoxShapeUtil<TextResponseShape> {
  static override type = 'text-response' as const;

  getDefaultProps(): TextResponseShape['props'] {
    return {
      w: 600,
      h: 300,
    };
  }

  override onResize = (
    shape: TextResponseShape,
    info: TLResizeInfo<TextResponseShape>
  ) => {
    const { scaleX, scaleY } = info;
    return {
      props: {
        ...shape.props,
        w: Math.max(400, shape.props.w * scaleX),
        h: Math.max(200, shape.props.h * scaleY),
      },
    };
  };

  component = (shape: TextResponseShape) => {
    const isDarkMode = this.editor.user.getIsDarkMode();
    const hasContent = shape.props.response && shape.props.response.length > 0;

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
            ></div>
            <p style={{ fontSize: '14px', color: '#6B7280' }}>Generating response...</p>
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
          padding: '16px',
          overflow: 'auto',
          pointerEvents: 'all',
        }}
      >
        {shape.props.prompt && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid',
              fontSize: '14px',
              fontWeight: '500',
              backgroundColor: isDarkMode ? '#1F2937' : '#EFF6FF',
              borderColor: isDarkMode ? '#374151' : '#BFDBFE',
              color: isDarkMode ? '#E5E7EB' : '#1E40AF',
            }}
          >
            <span style={{ fontWeight: '600' }}>Prompt: </span>
            {shape.props.prompt}
          </div>
        )}
        <div
          style={{
            flex: 1,
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid',
            backgroundColor: isDarkMode ? '#111827' : '#FFFFFF',
            borderColor: isDarkMode ? '#374151' : '#E5E7EB',
            color: isDarkMode ? '#F3F4F6' : '#111827',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '14px',
            lineHeight: '1.6',
          }}
        >
          {shape.props.response}
          {shape.props.isStreaming && (
            <span
              style={
                {
                  display: 'inline-block',
                  width: '8px',
                  height: '16px',
                  marginLeft: '4px',
                  backgroundColor: '#3B82F6',
                  animation: 'pulse 1s infinite',
                }
              }
            >
              |
            </span>
          )}
        </div>
      </HTMLContainer>
    );
  };

  indicator(shape: TextResponseShape) {
    return <rect width={shape.props.w} height={shape.props.h} />;
  }
}

// Add keyframe animations
const style = document.createElement('style');
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