import React from 'react';
import { Tldraw } from 'tldraw';
import { useSyncDemo } from '@tldraw/sync';
import 'tldraw/tldraw.css';

export default function Canvas() {
  // Use tldraw's built-in demo sync
  const store = useSyncDemo({
    roomId: 'default',
  });

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw store={store} />
    </div>
  );
}
