import React, { useState, useRef, useEffect } from 'react';
import { createShapeId } from 'tldraw';

const backendUrl = process.env.REACT_APP_BACKEND_URL;

const isMac = () => {
  return typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
};

export default function AIChatOverlay({ editor }) {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef(null);
  const showMacKeybinds = isMac();

  // Register Cmd+K shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => {
          if (inputRef.current) inputRef.current.focus();
        }, 100);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const createAIResponseNote = async (promptText) => {
    if (!promptText.trim() || isLoading) return;
    
    setIsLoading(true);
    const textId = createShapeId();
    
    // Get viewport center
    const viewport = editor.getViewportPageBounds();
    const x = viewport.x + viewport.w / 2 - 300;
    const y = viewport.y + viewport.h / 2 - 100;
    
    // Create a text shape for AI response
    editor.createShape({
      id: textId,
      type: 'text',
      x,
      y,
      props: {
        text: `Q: ${promptText}\n\n🤖 Generating AI response...`,
        scale: 1.2,
        autoSize: true,
      },
    });
    
    // Zoom to the text
    editor.zoomToSelection([textId], { duration: 200, inset: 100 });
    
    try {
      // Stream AI response
      const response = await fetch(`${backendUrl}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText }),
      });

      if (!response.ok) throw new Error('API error');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let aiResponse = '';
      let lastUpdate = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                aiResponse += parsed.content;
                
                // Throttle updates to every 100ms
                const now = Date.now();
                if (now - lastUpdate > 100) {
                  editor.updateShape({
                    id: noteId,
                    type: 'geo',
                    props: {
                      text: `Q: ${promptText}\n\nA: ${aiResponse}`,
                    },
                  });
                  lastUpdate = now;
                }
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
      
      // Final update
      editor.updateShape({
        id: noteId,
        type: 'geo',
        props: {
          text: `Q: ${promptText}\n\nA: ${aiResponse}`,
        },
      });
      
    } catch (error) {
      console.error('AI request failed:', error);
      editor.updateShape({
        id: noteId,
        type: 'geo',
        props: {
          text: `Q: ${promptText}\n\nError: Failed to get AI response`,
          color: 'light-red',
        },
      });
    } finally {
      setIsLoading(false);
      setPrompt('');
      setIsOpen(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onClick={() => !isLoading && setIsOpen(false)}
    >
      <form
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '16px 24px',
          borderRadius: '16px',
          border: '1px solid #E5E7EB',
          fontSize: '16px',
          gap: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
          minHeight: '60px',
          width: '600px',
          background: '#FFFFFF',
          color: '#111827',
        }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          createAIResponseNote(prompt);
        }}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Ask AI anything..."
          disabled={isLoading}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'inherit',
            fontSize: 'inherit',
          }}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          autoFocus
        />
        <button
          type="submit"
          disabled={!prompt.trim() || isLoading}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            border: 'none',
            background: prompt.trim() && !isLoading ? '#3B82F6' : '#CBD5E1',
            color: '#FFFFFF',
            cursor: prompt.trim() && !isLoading ? 'pointer' : 'not-allowed',
          }}
        >
          {isLoading ? '...' : '↑'}
        </button>
      </form>
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          fontSize: '12px',
          color: '#FFFFFF',
          opacity: 0.7,
        }}
      >
        Press {showMacKeybinds ? '⌘' : 'Ctrl'} + K to open • ESC to close
      </div>
    </div>
  );
}
