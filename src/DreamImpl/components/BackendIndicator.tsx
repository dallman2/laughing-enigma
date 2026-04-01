import type { BackendStatus } from "../../hooks/useBackend";

interface Props {
  status: BackendStatus;
  serverConnected?: boolean;
}

const BackendIndicator = ({ status, serverConnected }: Props) => {
  if (status.state === "initializing") {
    return <span className="backend-badge">Initializing...</span>;
  }

  const computeLabel = status.compute === "webgpu" ? "WebGPU" : "WebGL";

  // Use live WebSocket state if provided, fall back to initial probe
  const isServerConnected = serverConnected ?? status.serverConnected;

  return (
    <span
      className={`backend-badge ${isServerConnected ? "server" : ""}`}
      title={
        isServerConnected
          ? "Connected to dream-server on localhost:8420 (GPU)"
          : `Running in browser with ${computeLabel}`
      }
    >
      {isServerConnected ? "Server (GPU)" : computeLabel}
    </span>
  );
};

export default BackendIndicator;
