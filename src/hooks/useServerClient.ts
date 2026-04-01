import { useCallback, useEffect, useRef, useState } from "react";
import { DreamServerClient } from "../dream/server/client";
import { probeServer } from "../dream/server/probe";

const RECONNECT_INTERVAL_MS = 5000;

/**
 * Manages a WebSocket connection to the dream-server.
 * Auto-probes for the server, connects when available, and reconnects on disconnect.
 */
export function useServerClient() {
  const clientRef = useRef<DreamServerClient | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const attemptConnect = useCallback(async () => {
    if (cancelledRef.current) return;

    // First check if server is reachable via HTTP
    const available = await probeServer();
    if (!available || cancelledRef.current) {
      setConnected(false);
      // Schedule retry
      reconnectTimer.current = setTimeout(attemptConnect, RECONNECT_INTERVAL_MS);
      return;
    }

    // Server is reachable — open WebSocket
    const client = new DreamServerClient();
    try {
      await client.connect();
      if (cancelledRef.current) {
        client.disconnect();
        return;
      }
      console.log("[server-client] WebSocket connected");
      clientRef.current = client;
      setConnected(true);

      // Detect disconnect and auto-reconnect
      client.onDisconnect(() => {
        if (cancelledRef.current) return;
        console.log("[server-client] WebSocket disconnected, will retry...");
        clientRef.current = null;
        setConnected(false);
        reconnectTimer.current = setTimeout(attemptConnect, RECONNECT_INTERVAL_MS);
      });
    } catch {
      if (!cancelledRef.current) {
        setConnected(false);
        reconnectTimer.current = setTimeout(attemptConnect, RECONNECT_INTERVAL_MS);
      }
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    attemptConnect();

    return () => {
      cancelledRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      clientRef.current?.disconnect();
      clientRef.current = null;
      setConnected(false);
    };
  }, [attemptConnect]);

  return {
    client: clientRef.current,
    connected,
  };
}
