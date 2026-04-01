import { useCallback, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import { useModelLoader } from "../../hooks/useModelLoader";
import { useStyleTransferOptim } from "../../hooks/useStyleTransferOptim";
import type { BackendStatus } from "../../hooks/useBackend";
import type { DreamServerClient } from "../../dream/server/client";
import { getModelById } from "../../dream/models/registry";
import BackendIndicator from "./BackendIndicator";
import DualImageUploader from "./DualImageUploader";
import StyleParamPanel from "./StyleParamPanel";
import ResolutionSelector from "./ResolutionSelector";
import ImageCanvas from "./ImageCanvas";

interface Props {
  backend: BackendStatus;
  serverClient: DreamServerClient | null;
  serverConnected: boolean;
}

const VGG19_MODEL = getModelById("vgg19")!;

const StyleOptimPanel = ({ backend, serverClient, serverConnected }: Props) => {
  const { loadState, load } = useModelLoader();
  const style = useStyleTransferOptim();

  const [contentImage, setContentImage] = useState<HTMLImageElement | null>(
    null,
  );
  const [styleImage, setStyleImage] = useState<HTMLImageElement | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [resolution, setResolution] = useState(224);

  // Compute output dimensions preserving content image aspect ratio, snapped to multiples of 32
  const outputSize: [number, number] = (() => {
    if (!contentImage) return [resolution, resolution];
    const aspect = contentImage.naturalWidth / contentImage.naturalHeight;
    let w: number, h: number;
    if (aspect >= 1) {
      w = resolution;
      h = Math.round(resolution / aspect);
    } else {
      h = resolution;
      w = Math.round(resolution * aspect);
    }
    w = Math.max(32, Math.round(w / 32) * 32);
    h = Math.max(32, Math.round(h / 32) * 32);
    return [h, w];
  })();

  const handleLoadModel = useCallback(async () => {
    const model = await load(VGG19_MODEL.url);
    if (model) {
      style.setModel(model);
      setModelLoaded(true);
    }
  }, [load, style]);

  const handleStart = useCallback(async () => {
    if (!contentImage || !styleImage || !modelLoaded) return;

    const contentTensor = tf.tidy(() =>
      tf.browser
        .fromPixels(contentImage)
        .resizeBilinear(outputSize)
        .toFloat() as tf.Tensor3D,
    );
    // Style image resized to same output dimensions
    const styleTensor = tf.tidy(() =>
      tf.browser
        .fromPixels(styleImage)
        .resizeBilinear(outputSize)
        .toFloat() as tf.Tensor3D,
    );

    await style.start(
      contentTensor,
      styleTensor,
      VGG19_MODEL.contentLayers![0],
      VGG19_MODEL.styleLayers!,
      serverClient,
    );

    contentTensor.dispose();
    styleTensor.dispose();
  }, [contentImage, styleImage, modelLoaded, style, outputSize, serverClient]);

  const handleDownload = useCallback(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".dream-canvas");
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `style-transfer-${outputSize[1]}x${outputSize[0]}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }, [outputSize]);

  const isRunning = style.state === "running";
  const canStart =
    modelLoaded && contentImage !== null && styleImage !== null && !isRunning;

  return (
    <>
      <div className="dream-sidebar">
        <BackendIndicator status={backend} serverConnected={serverConnected} />

        <div className="model-selector">
          <label>Model: VGG19 (~80 MB)</label>
          {!modelLoaded && (
            <button
              onClick={handleLoadModel}
              disabled={loadState.state === "loading"}
            >
              {loadState.state === "loading"
                ? `Loading... ${((loadState as { progress: number }).progress * 100).toFixed(0)}%`
                : "Load VGG19"}
            </button>
          )}
          {modelLoaded && <span className="backend-badge">Loaded</span>}
          {loadState.state === "error" && (
            <p className="error-text">
              {(loadState as { error: string }).error}
            </p>
          )}
        </div>

        <DualImageUploader
          onContentLoaded={setContentImage}
          onStyleLoaded={setStyleImage}
          disabled={isRunning}
        />

        {modelLoaded && (
          <>
            <ResolutionSelector
              value={resolution}
              onChange={setResolution}
              disabled={isRunning}
              serverConnected={serverConnected}
            />

            <StyleParamPanel
              params={style.params}
              onChange={style.setParams}
              disabled={isRunning}
            />
          </>
        )}

        <div className="dream-controls">
          <button onClick={handleStart} disabled={!canStart}>
            {style.state === "complete" ? "Stylize Again" : "Stylize"}
          </button>

          {isRunning && <button onClick={style.pause}>Pause</button>}

          {(style.state === "complete" || style.state === "paused") && (
            <button onClick={style.reset}>Reset</button>
          )}

          {style.state === "complete" && (
            <button onClick={handleDownload}>Download</button>
          )}
        </div>

        {isRunning && (
          <div className="dream-progress">
            <p>
              Iteration {style.progress.iteration}/{style.params.iterations} —
              Loss: {style.progress.totalLoss.toFixed(4)}
            </p>
          </div>
        )}
      </div>

      <div className="dream-canvas-container">
        <ImageCanvas
          width={outputSize[1]}
          height={outputSize[0]}
          canvasRef={style.setCanvas}
        />
      </div>
    </>
  );
};

export default StyleOptimPanel;
