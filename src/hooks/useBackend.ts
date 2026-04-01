import { useEffect, useState } from "react";
import {
  initComputeBackend,
  getComputeBackend,
} from "../dream/engine/backend-init";
import { probeServer } from "../dream/server/probe";

export type BackendStatus =
  | { state: "initializing" }
  | { state: "ready"; compute: "webgpu" | "webgl"; serverConnected: boolean };

export function useBackend() {
  const [status, setStatus] = useState<BackendStatus>({
    state: "initializing",
  });

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const [compute, serverConnected] = await Promise.all([
        initComputeBackend(),
        probeServer(),
      ]);

      if (!cancelled) {
        setStatus({ state: "ready", compute, serverConnected });
      }
    }

    // If already initialized (e.g., tab switch), skip async init
    const existing = getComputeBackend();
    if (existing) {
      probeServer().then((serverConnected) => {
        if (!cancelled) {
          setStatus({ state: "ready", compute: existing, serverConnected });
        }
      });
    } else {
      init();
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
