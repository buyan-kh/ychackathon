import React, { useState, useRef, useEffect } from 'react';
import { useEditor } from 'tldraw';
import { createTextResponseShape } from '../utils/textShapeManager';

const isMac = () => {
  return typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
};

export const PromptInput = ({ focusEventName }) => {
  const editor = useEditor();
  const [isFocused, setIsFocused] = useState(false);
  const [prompt, setPrompt] = useState('');
  const showMacKeybinds = isMac();
  const inputRef = useRef(null);

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

  const onInputSubmit = async (promptText) => {
    setPrompt('');
    setIsFocused(false);
    if (inputRef.current) inputRef.current.blur();
    
    try {
      await createTextResponseShape(editor, {
        searchQuery: promptText,
        width: 600,
        height: 300,
        centerCamera: true,
        animationDuration: 200,
      });
    } catch (error) {
      console.error('Failed to create text response shape:', error);
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
        transition: 'width 0.3s ease-in-out',
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
          onInputSubmit(prompt);
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
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            border: 'none',
            background: '#3B82F6',
            color: '#FFFFFF',
            cursor: 'pointer',
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
};
