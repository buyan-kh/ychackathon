import { BaseBoxShapeUtil, HTMLContainer } from 'tldraw';
import React, { memo, useEffect, useRef, useState } from 'react';
import DailyIframe from '@daily-co/daily-js';

// Memoized video call component
const VideoCallComponent = memo(({ shape }) => {
  const containerRef = useRef(null);
  const [callFrame, setCallFrame] = useState(null);
  const [error, setError] = useState(null);

  const roomUrl = shape.props.roomUrl;

  useEffect(() => {
    if (!roomUrl || !containerRef.current) return;

    console.log('VideoCallComponent mounting with URL:', roomUrl);

    // Check for existing frame (React Strict Mode workaround)
    let frame = null;
    try {
      frame = DailyIframe.getCallInstance();
      if (frame) {
        console.log('Reusing existing Daily frame');
        setCallFrame(frame);
        return;
      }
    } catch (e) {
      console.log('No existing Daily frame, creating new one');
    }

    // Create new frame
    try {
      frame = DailyIframe.createFrame(containerRef.current, {
        showLeaveButton: true,
        showFullscreenButton: true,
        iframeStyle: {
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: '8px',
        }
      });

      frame.join({ url: roomUrl });
      setCallFrame(frame);

      // Handle leave event
      frame.on('left-meeting', () => {
        console.log('User left meeting');
      });

      frame.on('error', (error) => {
        console.error('Daily error:', error);
        setError(error.errorMsg || 'Video call error');
      });

    } catch (err) {
      console.error('Failed to create Daily frame:', err);
      setError(err.message || 'Failed to initialize video call');
    }

    // Cleanup only happens when shape is actually removed, not on every re-render
    return () => {
      console.log('VideoCallComponent unmounting');
    };
  }, [roomUrl]);

  if (error) {
    return (
      <HTMLContainer>
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FEF2F2',
          borderRadius: '8px',
          border: '1px solid #FCA5A5',
          padding: '20px'
        }}>
          <div style={{
            textAlign: 'center',
            color: '#DC2626'
          }}>
            <p style={{ fontWeight: '600', marginBottom: '8px' }}>Error loading video call</p>
            <p style={{ fontSize: '14px' }}>{error}</p>
          </div>
        </div>
      </HTMLContainer>
    );
  }

  return (
    <HTMLContainer style={{
      display: 'flex',
      flexDirection: 'column',
      background: '#1F2937',
      borderRadius: '8px',
      border: '1px solid #374151',
      overflow: 'hidden',
      pointerEvents: 'all'
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #374151',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#111827',
        flexShrink: 0
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2">
            <path d="M23 7l-7 5 7 5V7z" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          <span style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#F3F4F6'
          }}>
            Video Call
          </span>
        </div>
      </div>

      {/* Video call container */}
      <div
        ref={containerRef}
        id="daily-call-container"
        style={{
          flex: 1,
          minHeight: '400px',
          background: '#000',
          position: 'relative'
        }}
      />
    </HTMLContainer>
  );
});

VideoCallComponent.displayName = 'VideoCallComponent';

export class VideoCallShapeUtil extends BaseBoxShapeUtil {
  static type = 'video-call';

  getDefaultProps() {
    return {
      w: 800,
      h: 600,
      roomUrl: '',
    };
  }

  onResize = (shape, info) => {
    const { scaleX, scaleY } = info;
    return {
      props: {
        ...shape.props,
        w: Math.max(400, shape.props.w * scaleX),
        h: Math.max(300, shape.props.h * scaleY),
      },
    };
  };

  component = (shape) => {
    return <VideoCallComponent shape={shape} />;
  };

  indicator(shape) {
    return <rect width={shape.props.w} height={shape.props.h} />;
  }
}
