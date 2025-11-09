import React, { useState, useRef, useEffect } from 'react';
import { createShapeId, toRichText } from 'tldraw';

const backendUrl = process.env.REACT_APP_BACKEND_URL;

const isMac = () => {
  return typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
};

export default function PromptInput({ editor, focusEventName }) {
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

    const geoId = createShapeId();
    
    // Get viewport center
    const viewport = editor.getViewportPageBounds();
    const x = viewport.x + (viewport.w / 2) - 300;
    const y = viewport.y + (viewport.h / 2) - 150;
    
    // Create GEO shape (rectangle) ON THE CANVAS - these support text!
    editor.createShape({
      id: geoId,
      type: 'geo',
      x,
      y,
      props: {
        geo: 'rectangle',
        w: 600,
        h: 300,
        color: 'light-blue',
        fill: 'semi',
      },
    });
    
    // Zoom to the shape
    editor.zoomToSelection([geoId], { duration: 200, inset: 100 });
    
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
      
      // Start editing the shape to add text
      editor.setEditingShape(geoId);

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
                
                // Update shape text by setting editing value
                const textContent = `Q: ${promptText}\n\nAI: ${aiResponse}`;
                editor.updateShape({
                  id: geoId,
                  type: 'geo',
                  props: {
                    text: textContent,
                  },
                });
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
      
      // Stop editing
      editor.setEditingShape(null);
      
    } catch (error) {
      console.error('AI request failed:', error);
      editor.updateShape({
        id: geoId,
        type: 'geo',
        props: {
          color: 'light-red',
          text: `Q: ${promptText}\n\nAI: Error - ${error.message}`,
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
        zIndex: 1000,
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
