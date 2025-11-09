import React, { useState, useRef, useEffect } from 'react';
import { C1Component, ThemeProvider } from '@thesysai/genui-sdk';

const backendUrl = process.env.REACT_APP_BACKEND_URL;

const isMac = () => {
  return typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
};

export default function AIChatSidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef(null);
  const showMacKeybinds = isMac();
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => {
          if (inputRef.current) inputRef.current.focus();
        }, 100);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendPrompt = async (promptText) => {
    if (!promptText.trim() || isLoading) return;
    
    const userMsg = { role: 'user', content: promptText };
    setMessages(prev => [...prev, userMsg]);
    setPrompt('');
    setIsLoading(true);
    
    const aiMsgIndex = messages.length + 1;
    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }]);
    
    try {
      const response = await fetch(`${backendUrl}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
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
                setMessages(prev => {
                  const newMessages = [...prev];
                  newMessages[aiMsgIndex] = {
                    role: 'assistant',
                    content: aiResponse,
                    isStreaming: true,
                  };
                  return newMessages;
                });
              }
            } catch (parseError) {
              // Skip malformed JSON chunks
              console.warn('JSON parse error:', parseError.message);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[aiMsgIndex] = {
          role: 'assistant',
          content: aiResponse,
          isStreaming: false,
        };
        return newMessages;
      });
      
    } catch (error) {
      console.error('AI request failed:', error);
      console.error('Error stack:', error.stack);
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[aiMsgIndex] = {
          role: 'assistant',
          content: `Error: ${error.message || 'Request failed'}`,
          isStreaming: false,
          isError: true,
        };
        return newMessages;
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          border: 'none',
          background: '#3B82F6',
          color: '#FFFFFF',
          fontSize: '24px',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 9999,
        }}
        title={`Ask AI (${showMacKeybinds ? '⌘' : 'Ctrl'}+K)`}
      >
        💬
      </button>
    );
  }

  return (
    <ThemeProvider mode="light">
      <div
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: '400px',
          background: '#FFFFFF',
          borderLeft: '1px solid #E5E7EB',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 9999,
          boxShadow: '-4px 0 12px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px',
            borderBottom: '1px solid #E5E7EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>AI Chat</h2>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6B7280',
            }}
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#9CA3AF', marginTop: '40px' }}>
              <p>Ask me anything!</p>
              <p style={{ fontSize: '12px', marginTop: '8px' }}>Powered by Thesys C1 & Claude Sonnet 4</p>
            </div>
          )}
          
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                padding: '12px',
                borderRadius: '8px',
                background: msg.role === 'user' ? '#EFF6FF' : msg.isError ? '#FEE2E2' : '#F9FAFB',
                border: `1px solid ${msg.role === 'user' ? '#BFDBFE' : msg.isError ? '#FCA5A5' : '#E5E7EB'}`,
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '4px', color: '#6B7280' }}>
                {msg.role === 'user' ? 'You' : 'AI'}
              </div>
              
              {msg.role === 'user' ? (
                <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {msg.content}
                </div>
              ) : (
                <div style={{ fontSize: '14px' }}>
                  <C1Component 
                    c1Response={msg.content} 
                    isStreaming={msg.isStreaming}
                  />
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form
          style={{
            padding: '16px',
            borderTop: '1px solid #E5E7EB',
            display: 'flex',
            gap: '8px',
          }}
          onSubmit={(e) => {
            e.preventDefault();
            sendPrompt(prompt);
          }}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask anything..."
            disabled={isLoading}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            style={{
              flex: 1,
              padding: '12px',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!prompt.trim() || isLoading}
            style={{
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
        
        <div style={{ padding: '8px 16px', fontSize: '10px', color: '#9CA3AF', textAlign: 'center' }}>
          Press {showMacKeybinds ? '⌘' : 'Ctrl'}+K to toggle • ESC to close
        </div>
      </div>
    </ThemeProvider>
  );
}
