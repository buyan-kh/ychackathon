import { BaseBoxShapeUtil, HTMLContainer, useEditor, createShapeId } from 'tldraw';
import React, { memo, useEffect, useRef, useState } from 'react';
import DailyIframe from '@daily-co/daily-js';
import { createArrowBetweenShapes } from '../utils/connection';

const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

// Memoized video call component
const VideoCallComponent = memo(({ shape }) => {
  const editor = useEditor();
  const containerRef = useRef(null);
  const [callFrame, setCallFrame] = useState(null);
  const [error, setError] = useState(null);
  const transcriptChunksRef = useRef([]);
  const summaryGeneratedRef = useRef(false); // Prevent duplicate summary generation
  const eventListenersRegisteredRef = useRef(false); // Prevent duplicate event listeners

  const roomUrl = shape.props.roomUrl;

  // Function to create and stream summary using C1 pattern
  const createStreamingSummary = async (transcript) => {
    console.log('📝 Creating streaming summary on canvas...');

    if (!editor) {
      console.error('❌ No editor instance available');
      return;
    }

    try {
      // Get the video call shape's position
      const videoShape = editor.getShape(shape.id);
      if (!videoShape) {
        console.error('❌ Could not find video call shape');
        return;
      }

      // Position summary to the right of video call
      const summaryX = videoShape.x + videoShape.props.w + 50;
      const summaryY = videoShape.y;

      console.log('📍 Creating summary shape at position:', { x: summaryX, y: summaryY });

      // Create the meeting-summary shape
      const summaryShapeId = createShapeId();
      editor.createShape({
        id: summaryShapeId,
        type: 'meeting-summary',
        x: summaryX,
        y: summaryY,
        props: {
          w: 600,
          h: 300,
          summaryContent: '',
          isStreaming: false,
          metadata: null
        }
      });

      console.log('📡 Starting streaming summary generation...');

      // Stream the summary from backend
      const response = await fetch(`${backendUrl}/api/video/generate-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          room_id: 'default'
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const decoder = new TextDecoder();
      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error('Response body not found');
      }

      let accumulatedContent = '';
      let metadata = null;
      let hasStartedStreaming = false;

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              console.log('✅ Summary streaming complete!');
              editor.updateShape({
                id: summaryShapeId,
                type: 'meeting-summary',
                props: {
                  summaryContent: accumulatedContent,
                  isStreaming: false,
                  metadata
                }
              });

              // Create arrow connection between video call and summary
              createArrowBetweenShapes(editor, shape.id, summaryShapeId);
              break;
            }

            try {
              const parsed = JSON.parse(data);

              // Handle metadata
              if (parsed.metadata) {
                metadata = parsed.metadata;
                console.log('📊 Received metadata:', metadata);
              }

              // Handle content streaming
              if (parsed.content) {
                if (!hasStartedStreaming) {
                  hasStartedStreaming = true;
                  editor.updateShape({
                    id: summaryShapeId,
                    type: 'meeting-summary',
                    props: { isStreaming: true }
                  });
                }

                accumulatedContent += parsed.content;
                editor.updateShape({
                  id: summaryShapeId,
                  type: 'meeting-summary',
                  props: {
                    summaryContent: accumulatedContent,
                    isStreaming: true,
                    metadata
                  }
                });
              }

              if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch (e) {
              // Skip invalid JSON - might be partial chunk
              continue;
            }
          }
        }
      }

      console.log('✅ Summary shape created and populated successfully!');
    } catch (error) {
      console.error('❌ Error creating summary:', error);
      console.error('Error details:', error.message, error.stack);
    }
  };

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

      // Join with token for transcription permissions
      // Extract token from roomUrl if it's passed as a prop, otherwise join with just URL
      const joinOptions = shape.props.token
        ? { url: roomUrl, token: shape.props.token }
        : { url: roomUrl };

      frame.join(joinOptions).then(async () => {
        console.log('✅ Joined video call successfully');

        // Wait a moment for the call to fully initialize
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('🎤 Starting transcription...');

        // Listen for BOTH transcription event types to see which one works
        frame.on('transcription-message', (event) => {
          console.log('📝 transcription-message event (NEW API):', event);
          console.log('Full event object:', JSON.stringify(event, null, 2));

          // Try to extract text from common locations
          const text = event.text || event.data?.text || event.rawText;
          if (text) {
            transcriptChunksRef.current.push(text);
            console.log('✅ Captured text:', text);
          }
        });

        frame.on('app-message', (event) => {
          if (event.fromId === 'transcription') {
            console.log('📝 app-message transcription event (OLD API):', event);
            console.log('Full event object:', JSON.stringify(event, null, 2));

            if (event.data?.is_final && event.data?.text) {
              transcriptChunksRef.current.push(event.data.text);
              console.log('✅ Captured text (is_final):', event.data.text);
            }
          }
        });

        try {
          await frame.startTranscription();
          console.log('✅ Transcription started successfully!');
          console.log('📝 Listening for transcription events...');
        } catch (err) {
          console.error('❌ Failed to start transcription:', err);
          console.error('Error details:', err.message, err.stack);
        }
      }).catch((err) => {
        console.error('❌ Failed to join call:', err);
      });

      setCallFrame(frame);

      // Handle leave event - generate streaming summary from transcript
      // Only register this once to prevent duplicate summaries
      if (!eventListenersRegisteredRef.current) {
        frame.on('left-meeting', async () => {
          console.log('👋 User left meeting');

          // Prevent duplicate summary generation
          if (summaryGeneratedRef.current) {
            console.log('⚠️  Summary already generated, skipping duplicate');
            return;
          }
          summaryGeneratedRef.current = true;

          try {
            // Note: Transcription automatically stops when leaving, no need to call stopTranscription()
            console.log('📝 Processing transcript...');

            // Get full transcript
            const fullTranscript = transcriptChunksRef.current.join(' ').trim();
            console.log('📝 Full transcript captured:', fullTranscript);
            console.log('📊 Transcript length:', fullTranscript.length, 'characters');
            console.log('📊 Number of chunks:', transcriptChunksRef.current.length);

            if (fullTranscript.length > 0) {
              // Create streaming summary using C1 pattern
              await createStreamingSummary(fullTranscript);
            } else {
              console.warn('⚠️  No transcript captured - cannot generate summary');
              console.warn('Make sure you spoke during the call for transcription to work');
            }
          } catch (error) {
            console.error('❌ Error generating summary:', error);
            console.error('Error details:', error.message);
          }
        });

        eventListenersRegisteredRef.current = true;
      }

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
      borderLeft: '6px solid #8B5CF6',
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
      token: '',
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
