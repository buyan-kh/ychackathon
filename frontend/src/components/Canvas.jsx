import React, { useEffect } from 'react';
import { Tldraw } from 'tldraw';
import { useSyncDemo } from '@tldraw/sync';
import { TextResponseShapeUtil } from '../shapeUtils/TextResponseShapeUtil.tsx';
import { PromptInput } from './PromptInput.tsx';
import 'tldraw/tldraw.css';

const FOCUS_EVENT_NAME = 'focus-prompt-input';

export default function Canvas() {
  // Use tldraw's demo sync with custom shapes
  const store = useSyncDemo({
    roomId: 'default',
    shapeUtils: [TextResponseShapeUtil],
  });

  // Register keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
        shapeUtils={[TextResponseShapeUtil]}
      />
      <PromptInput focusEventName={FOCUS_EVENT_NAME} />
    </div>
  );
}