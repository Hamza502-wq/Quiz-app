'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { refreshTokens, tokenStore } from './api';
import { config } from './config';

const SocketContext = createContext<{ socket: Socket | null; connected: boolean }>({ socket: null, connected: false });

/** One authenticated Socket.IO connection per signed-in dashboard session. */
export function SocketProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const s = io(config.apiUrl, {
      // Function form re-reads the (possibly refreshed) token on every reconnect.
      auth: (cb) => cb({ token: tokenStore.access }),
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 10_000,
    });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', async (err) => {
      setConnected(false);
      if (err.message === 'unauthorized' && (await refreshTokens())) s.connect();
    });
    setSocket(s);
    return () => {
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
    };
  }, [enabled]);

  return <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}

/** Subscribes to a server event for the lifetime of the component. */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void): void {
  const { socket } = useSocket();
  const saved = useRef(handler);
  useEffect(() => {
    saved.current = handler;
  }, [handler]);
  useEffect(() => {
    if (!socket) return;
    const listener = (payload: T) => saved.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}
