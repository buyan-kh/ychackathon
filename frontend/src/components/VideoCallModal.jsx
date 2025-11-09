import React, { useEffect, useCallback, useRef, useState } from 'react';
import DailyIframe from '@daily-co/daily-js';
import { X } from 'lucide-react';

export const VideoCallModal = ({ roomUrl, onClose }) => {
  const [callFrame, setCallFrame] = useState(null);
  const [isJoining, setIsJoining] = useState(true);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!roomUrl || !containerRef.current) return;

    let frame = null;

    // Try to get existing frame first (in case of React Strict Mode double mount)
    try {
      frame = DailyIframe.getCallInstance();
      if (frame) {
        console.log('Reusing existing Daily frame');
        setCallFrame(frame);
        setIsJoining(false);
        return;
      }
    } catch (e) {
      // No existing frame, will create new one
      console.log('No existing frame found, creating new one');
    }

    // Create Daily call frame
    try {
      frame = DailyIframe.createFrame(containerRef.current, {
        showLeaveButton: true,
        iframeStyle: {
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: '8px'
        }
      });

      setCallFrame(frame);

      // Join the call
      frame.join({ url: roomUrl })
        .then(() => {
          console.log('Joined Daily.co call:', roomUrl);
          setIsJoining(false);
        })
        .catch((error) => {
          console.error('Failed to join call:', error);
          setIsJoining(false);
        });

      // Handle leave event
      const handleLeftMeeting = () => {
        console.log('Left the meeting');
        onClose();
      };

      frame.on('left-meeting', handleLeftMeeting);
    } catch (error) {
      console.error('Error creating Daily frame:', error);
      setIsJoining(false);
    }

    // Cleanup
    return () => {
      console.log('Cleaning up Daily frame');
      // Only destroy if we're actually closing the modal
      // The frame will be reused if React remounts
    };
  }, [roomUrl, onClose]);

  const handleLeave = useCallback(() => {
    if (callFrame) {
      callFrame.leave().then(() => {
        callFrame.destroy();
      });
    }
    onClose();
  }, [callFrame, onClose]);

  if (!roomUrl) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '1200px',
        height: '90vh',
        backgroundColor: '#1a1a1a',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
      }}>
        {/* Header */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '50px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px'
        }}>
          <span style={{
            color: 'white',
            fontSize: '14px',
            fontWeight: '600'
          }}>
            Video Call
          </span>
          <button
            onClick={handleLeave}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '6px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
            onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
          >
            <X size={18} color="white" />
          </button>
        </div>

        {/* Loading state */}
        {isJoining && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'white',
            fontSize: '16px',
            zIndex: 5
          }}>
            Joining call...
          </div>
        )}

        {/* Call frame container */}
        <div
          ref={containerRef}
          id="daily-call-container"
          style={{
            width: '100%',
            height: '100%',
            position: 'relative'
          }}
        />
      </div>
    </div>
  );
};
