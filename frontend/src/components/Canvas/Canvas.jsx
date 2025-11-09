import React, { useEffect, useRef, useState } from 'react';
import { Tldraw, createTLStore, defaultShapeUtils, getSnapshot, loadSnapshot } from 'tldraw';
import 'tldraw/tldraw.css';
import { toast } from 'sonner';
import ConnectionStatus from './ConnectionStatus';
import './Canvas.css';

const backendUrl = process.env.REACT_APP_BACKEND_URL;

export default function Canvas({ roomId }) {
  const [store, setStore] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [editor, setEditor] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const snapshotSaveTimeout = useRef(null);

  // Initialize store
  useEffect(() => {
    const newStore = createTLStore({
      shapeUtils: [...defaultShapeUtils],
    });
    setStore(newStore);
  }, []);

  // Load initial snapshot
  useEffect(() => {
    if (!store || !editor) return;

    const loadInitialSnapshot = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/sync/rooms/${roomId}/snapshot`);
        if (response.ok) {
          const data = await response.json();
          if (data.snapshot && data.snapshot.store) {
            // Load the snapshot into the store using tldraw v4 API
            try {
              loadSnapshot(editor.store, data.snapshot);
            } catch (error) {
              console.log('No existing snapshot, starting fresh');
            }
          }
        }
      } catch (error) {
        console.error('Error loading snapshot:', error);
        toast.error('Failed to load canvas data');
      }
    };

    loadInitialSnapshot();
  }, [store, editor, roomId]);

  // Setup WebSocket connection
  useEffect(() => {
    if (!store) return;

    const connectWebSocket = () => {
      try {
        const wsUrl = `${backendUrl.replace('http', 'ws')}/api/ws/rooms/${roomId}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket connected');
          setConnectionStatus('connected');
          reconnectAttempts.current = 0;
          toast.success('Connected to collaboration server');
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);

            if (message.type === 'update' && message.changes) {
              // Apply remote changes to local store
              store.mergeRemoteChanges(() => {
                Object.entries(message.changes).forEach(([id, record]) => {
                  if (record === null) {
                    store.remove([id]);
                  } else {
                    store.put([record]);
                  }
                });
              });
            } else if (message.type === 'user_joined') {
              toast.info('A user joined the canvas');
            } else if (message.type === 'user_left') {
              toast.info('A user left the canvas');
            } else if (message.type === 'connected') {
              console.log('Connected to room:', message.room_id);
            }
          } catch (error) {
            console.error('Error processing message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setConnectionStatus('error');
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          setConnectionStatus('disconnected');

          // Attempt to reconnect
          if (reconnectAttempts.current < maxReconnectAttempts) {
            reconnectAttempts.current++;
            setConnectionStatus('reconnecting');
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000);
            reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
            toast.warning('Connection lost. Reconnecting...');
          } else {
            toast.error('Failed to connect. Please refresh the page.');
          }
        };
      } catch (error) {
        console.error('Error creating WebSocket:', error);
        setConnectionStatus('error');
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [store, roomId]);

  // Listen to store changes and broadcast
  useEffect(() => {
    if (!store || !wsRef.current || !editor) return;

    const handleStoreChange = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const allRecords = store.allRecords();
        const changes = {};
        
        allRecords.forEach(record => {
          changes[record.id] = record;
        });

        wsRef.current.send(JSON.stringify({
          type: 'update',
          changes: changes,
          timestamp: new Date().toISOString()
        }));

        // Debounced snapshot save
        if (snapshotSaveTimeout.current) {
          clearTimeout(snapshotSaveTimeout.current);
        }
        snapshotSaveTimeout.current = setTimeout(async () => {
          try {
            // Use tldraw v4 API to get snapshot
            const snapshot = getSnapshot(editor.store);
            await fetch(`${backendUrl}/api/sync/rooms/${roomId}/apply`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ snapshot }),
            });
          } catch (error) {
            console.error('Error saving snapshot:', error);
          }
        }, 2000);
      }
    };

    const unsubscribe = store.listen(handleStoreChange, {
      source: 'user',
      scope: 'document',
    });

    return () => {
      unsubscribe();
      if (snapshotSaveTimeout.current) {
        clearTimeout(snapshotSaveTimeout.current);
      }
    };
  }, [store, editor, roomId]);

  // Handle editor mount
  const handleMount = (mountedEditor) => {
    setEditor(mountedEditor);
  };

  if (!store) {
    return (
      <div data-testid="canvas-loading" className="canvas-loading">
        <div className="loading-spinner"></div>
        <p>Loading canvas...</p>
      </div>
    );
  }

  return (
    <div data-testid="canvas-container" className="canvas-container">
      <ConnectionStatus status={connectionStatus} />
      <Tldraw 
        store={store}
        autoFocus
        onMount={handleMount}
      />
    </div>
  );
}
