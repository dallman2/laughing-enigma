import { useCallback, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import { useModelLoader } from "../../hooks/useModelLoader";
import { useDream } from "../../hooks/useDream";
import type { BackendStatus } from "../../hooks/useBackend";
import type { DreamServerClient } from "../../dream/server/client";
import type { BundledModel } from "../../dream/models/registry";
import { getModelsByPurpose } from "../../dream/models/registry";
import BackendIndicator from "./BackendIndicator";
import ModelSelector from "./ModelSelector";
import LayerPicker from "./LayerPicker";
import ParameterPanel from "./ParameterPanel";
import ResolutionSelector from "./ResolutionSelector";
import ImageCanvas from "./ImageCanvas";
import ImageUploader from "./ImageUploader";

interface Props {
  backend: BackendStatus;
  serverClient: DreamServerClient | null;
  serverConnected: boolean;
}

const DreamPanel = ({ backend, serverClient, serverConnected }: Props) => {
  const { loadState, load } = useModelLoader();
  const dream = useDream();

  const [selectedModel, setSelectedModel] = useState<BundledModel | null>(null);
  const [inputImage, setInputImage] = useState<HTMLImageElement | null>(null);
  const [resolution, setResolution] = useState(224);

  // Compute output dimensions preserving aspect ratio, snapped to multiples of 32
  const outputSize: [number, number] = (() => {
    if (!inputImage) return [resolution, resolution];
    const aspect = inputImage.naturalWidth / inputImage.naturalHeight;
    let w: number, h: number;
    if (aspect >= 1) {
      w = resolution;
      h = Math.round(resolution / aspect);
    } else {
      h = resolution;
      w = Math.round(resolution * aspect);
    }
    // Snap to multiples of 32 (required by conv layers)
    w = Math.max(32, Math.round(w / 32) * 32);
    h = Math.max(32, Math.round(h / 32) * 32);
    return [h, w];
  })();

  const dreamModels = getModelsByPurpose("dream");

  const handleModelSelect = useCallback(
    async (model: BundledModel) => {
      setSelectedModel(model);
      const loaded = await load(model.url);
      if (loaded) {
        dream.setModel(loaded, model.dreamLayers);
        dream.setSelectedLayers(model.dreamLayers);
      }
    },
    [load, dream],
  );

  const handleImageLoaded = useCallback((img: HTMLImageElement) => {
    setInputImage(img);
  }, []);

  const handleStart = useCallback(async () => {
    if (!inputImage || !selectedModel) return;

    const imageTensor = tf.tidy(() => {
      const raw = tf.browser.fromPixels(inputImage);
      return tf.image
        .resizeBilinear(raw, outputSize)
        .toFloat() as tf.Tensor3D;
    });

    await dream.start(imageTensor, selectedModel.preprocessing, serverClient);
    imageTensor.dispose();
  }, [inputImage, selectedModel, dream, resolution, serverClient]);

  const handleDownload = useCallback(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".dream-canvas");
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dream-${resolution}px.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }, [resolution]);

  const isRunning = dream.state === "running";
  const canStart =
    loadState.state === "loaded" &&
    inputImage !== null &&
    dream.selectedLayers.length > 0 &&
    !isRunning;

  return (
    <>
      <div className="dream-sidebar">
        <BackendIndicator status={backend} serverConnected={serverConnected} />

        <ModelSelector
          loadState={loadState}
          onSelect={handleModelSelect}
          models={dreamModels}
        />

        <ImageUploader onImageLoaded={handleImageLoaded} disabled={isRunning} />

        {loadState.state === "loaded" && (
          <>
            <ResolutionSelector
              value={resolution}
              onChange={setResolution}
              disabled={isRunning}
              serverConnected={serverConnected}
            />

            <LayerPicker
              layers={loadState.layers}
              selected={dream.selectedLayers}
              defaultLayers={selectedModel?.dreamLayers ?? []}
              onChange={dream.setSelectedLayers}
            />

            <ParameterPanel
              params={dream.params}
              onChange={dream.setParams}
              disabled={isRunning}
            />
          </>
        )}

        <div className="dream-controls">
          <button onClick={handleStart} disabled={!canStart}>
            {dream.state === "complete" ? "Dream Again" : "Dream"}
          </button>

          {isRunning && <button onClick={dream.pause}>Pause</button>}

          {dream.state === "paused" && (
            <button onClick={handleStart}>Resume</button>
          )}

          {(dream.state === "complete" || dream.state === "paused") && (
            <button onClick={dream.reset}>Reset</button>
          )}

          {dream.state === "complete" && (
            <button onClick={handleDownload}>Download</button>
          )}
        </div>

        {isRunning && (
          <div className="dream-progress">
            <p>
              Octave {dream.progress.octave + 1}/{dream.params.numOctaves} —
              Step {dream.progress.step} — Loss:{" "}
              {dream.progress.loss.toFixed(4)}
            </p>
          </div>
        )}
      </div>

      <div className="dream-canvas-container">
        <ImageCanvas
          width={outputSize[1]}
          height={outputSize[0]}
          canvasRef={dream.setCanvas}
        />
      </div>
    </>
  );
};

export default DreamPanel;
