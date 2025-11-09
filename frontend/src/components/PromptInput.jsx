import React, { useState, useRef, useEffect } from 'react';
import { createShapeId, useEditor } from 'tldraw';

const backendUrl = process.env.REACT_APP_BACKEND_URL;

const isMac = () => {
  return typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
};

export default function PromptInput({ focusEventName }) {
  const editor = useEditor();
  const [isFocused, setIsFocused] = useState(false);
  const [prompt, setPrompt] = useState('');
  const showMacKeybinds = isMac();
  const inputRef = useRef(null);
  const isCanvasEmpty = editor.getCurrentPageShapes().length === 0;

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

  const createAITextShape = async (promptText) => {
    if (!promptText.trim()) return;

    const c1ShapeId = createShapeId();
    
    // Get viewport center
    const viewport = editor.getViewportPageBounds();
    const x = viewport.x + (viewport.w / 2) - 300;
    const y = viewport.y + (viewport.h / 2) - 150;
    
    // Create C1 Response shape ON THE CANVAS
    editor.createShape({
      id: c1ShapeId,
      type: 'c1-response',
      x,
      y,
      props: {
        w: 600,
        h: 300,
        prompt: promptText,
        c1Response: '',
        isStreaming: true,
      },
    });
    
    // Zoom to the shape
    editor.zoomToSelection([c1ShapeId], { duration: 200, inset: 100 });
    
    try {
      const apiUrl = backendUrl || 'http://localhost:8001';
      console.log('Fetching from:', `${apiUrl}/api/ask`);
      
      // Stream AI response
      const response = await fetch(`${apiUrl}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText }),
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
                
                // Update C1 Response shape with streaming content
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
              // Skip invalid JSON chunks
              console.warn('JSON parse error:', e.message);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      
      // Mark streaming as complete
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
          c1Response: `<content thesys="true">{"component": {"component": "Card", "props": {"children": [{"component": "Header", "props": {"title": "Error"}}, {"component": "TextContent", "props": {"textMarkdown": "Failed to generate response: ${error.message}"}}]}}}}</content>`,
          isStreaming: false,
        },
      });
    }
  };

  return (
    <form
      style={{
        display: 'flex',
        alignItems: 'center',
        position: 'fixed',
        left: '50%',
        bottom: '16px',
        transform: 'translateX(-50%)',
        padding: '12px 20px',
        borderRadius: '16px',
        border: '1px solid #E5E7EB',
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
      onSubmit={(e) => {
        e.preventDefault();
        if (prompt.trim()) {
          createAITextShape(prompt);
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
  );
}
