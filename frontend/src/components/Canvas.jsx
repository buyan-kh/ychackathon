import React, { useEffect } from 'react';
import { Tldraw, DefaultToolbar } from 'tldraw';
import { useSyncDemo } from '@tldraw/sync';
import PromptInput from './PromptInput';
import 'tldraw/tldraw.css';

const FOCUS_EVENT_NAME = 'focus-prompt-input';

const components = {
  Toolbar: () => {
    return (
      <div style={{ position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)' }}>
        <DefaultToolbar />
      </div>
    );
  },
};

export default function Canvas() {
  const store = useSyncDemo({
    roomId: 'default',
  });

  // Register Cmd+K shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        window.dispatchEvent(new Event(FOCUS_EVENT_NAME));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw 
        store={store}
        components={components}
      />
      <PromptInput focusEventName={FOCUS_EVENT_NAME} />
    </div>
  );
}
