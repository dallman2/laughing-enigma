const SERVER_URL = "http://localhost:8420";
const PROBE_TIMEOUT_MS = 2000;

/**
 * Probe for the dream-server on localhost:8420.
 * Returns true if the server is reachable and responds to /health.
 */
export async function probeServer(): Promise<boolean> {
  try {
    const resp = await fetch(`${SERVER_URL}/health`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export function getServerUrl(): string {
  return SERVER_URL;
}
