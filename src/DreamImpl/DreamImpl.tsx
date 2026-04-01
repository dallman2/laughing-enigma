import { useState } from "react";
import { useBackend } from "../hooks/useBackend";
import { useServerClient } from "../hooks/useServerClient";
import ModeSelector, { type DreamMode } from "./components/ModeSelector";
import DreamPanel from "./components/DreamPanel";
import StyleOptimPanel from "./components/StyleOptimPanel";
import StyleFastPanel from "./components/StyleFastPanel";
import "./DreamImpl.css";

const DreamImpl = () => {
  const [mode, setMode] = useState<DreamMode>("dream");
  const backend = useBackend();
  const { client: serverClient, connected: serverConnected } =
    useServerClient();

  return (
    <div className="dream-impl">
      <ModeSelector mode={mode} onChange={setMode} />
      {mode === "dream" && (
        <DreamPanel
          backend={backend}
          serverClient={serverClient}
          serverConnected={serverConnected}
        />
      )}
      {mode === "style-optim" && (
        <StyleOptimPanel
          backend={backend}
          serverClient={serverClient}
          serverConnected={serverConnected}
        />
      )}
      {mode === "style-fast" && (
        <StyleFastPanel
          backend={backend}
          serverClient={serverClient}
          serverConnected={serverConnected}
        />
      )}
    </div>
  );
};

export default DreamImpl;
