// frontend/src/hooks/useWebSocket.js
// ─────────────────────────────────────────────────────────────────────────────
// Reusable WebSocket hook with auto-reconnect.
// Connects directly to Daphne on port 8000 (bypasses React dev proxy).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react';

const RECONNECT_DELAY = 3000;

export default function useWebSocket(path) {
  const [lastMessage, setLastMessage] = useState(null);
  const [readyState, setReadyState]   = useState('CONNECTING');
  const wsRef        = useRef(null);
  const reconnectRef = useRef(null);
  const mountedRef   = useRef(true);

  const connect = useCallback(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    // Connect directly to Daphne on 8000, not through React proxy on 3000
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//localhost:8000/${path}?token=${token}`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setReadyState('OPEN');
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    ws.onclose = (event) => {
      if (!mountedRef.current) return;
      setReadyState('CLOSED');
      // Auto-reconnect unless closed intentionally (code 4001 = auth failure)
      if (event.code !== 4001) {
        reconnectRef.current = setTimeout(() => {
          if (mountedRef.current) {
            setReadyState('CONNECTING');
            connect();
          }
        }, RECONNECT_DELAY);
      }
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      setReadyState('ERROR');
    };
  }, [path]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on unmount
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { lastMessage, readyState, sendMessage };
}