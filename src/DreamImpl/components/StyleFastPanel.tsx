import { useCallback, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import { useGraphModelLoader } from "../../hooks/useGraphModelLoader";
import { useStyleTransferFast } from "../../hooks/useStyleTransferFast";
import type { BackendStatus } from "../../hooks/useBackend";
import type { DreamServerClient } from "../../dream/server/client";
import { getModelById } from "../../dream/models/registry";
import BackendIndicator from "./BackendIndicator";
import DualImageUploader from "./DualImageUploader";
import StylizationSlider from "./StylizationSlider";
import ResolutionSelector from "./ResolutionSelector";
import ImageCanvas from "./ImageCanvas";

interface Props {
  backend: BackendStatus;
  serverClient: DreamServerClient | null;
  serverConnected: boolean;
}

const PREDICTOR = getModelById("magenta_style_predictor")!;
const TRANSFORMER = getModelById("magenta_style_transformer")!;

const StyleFastPanel = ({ backend, serverClient, serverConnected }: Props) => {
  const predictorLoader = useGraphModelLoader();
  const transformerLoader = useGraphModelLoader();
  const fast = useStyleTransferFast(serverConnected);

  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [contentImage, setContentImage] = useState<HTMLImageElement | null>(
    null,
  );
  const [styleImage, setStyleImage] = useState<HTMLImageElement | null>(null);
  const [resolution, setResolution] = useState(256);

  const contentTensorRef = useRef<tf.Tensor3D | null>(null);
  const styleTensorRef = useRef<tf.Tensor3D | null>(null);

  // Server mode is ready when connected (no browser models needed)
  const effectiveReady = serverConnected || modelsLoaded;

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

  const handleLoadModels = useCallback(async () => {
    const [predictor, transformer] = await Promise.all([
      predictorLoader.load(PREDICTOR.url),
      transformerLoader.load(TRANSFORMER.url),
    ]);
    if (predictor && transformer) {
      fast.setModels(predictor, transformer);
      setModelsLoaded(true);
    }
  }, [predictorLoader, transformerLoader, fast]);

  const prepareAndStylize = useCallback(
    async (strength?: number) => {
      if (!contentImage || !styleImage || !effectiveReady) return;

      contentTensorRef.current?.dispose();
      styleTensorRef.current?.dispose();

      contentTensorRef.current = tf.tidy(() =>
        tf.browser
          .fromPixels(contentImage)
          .resizeBilinear(outputSize)
          .toFloat() as tf.Tensor3D,
      );
      styleTensorRef.current = tf.tidy(() =>
        tf.browser
          .fromPixels(styleImage)
          .resizeBilinear(outputSize)
          .toFloat() as tf.Tensor3D,
      );

      await fast.stylize(
        contentTensorRef.current,
        styleTensorRef.current,
        strength,
        serverClient,
      );
    },
    [contentImage, styleImage, effectiveReady, fast, outputSize, serverClient],
  );

  const handleStrengthChange = useCallback(
    (value: number) => {
      fast.setStrength(value);
      if (
        !contentTensorRef.current ||
        !styleTensorRef.current ||
        !effectiveReady
      )
        return;
      fast.stylizeDebounced(
        contentTensorRef.current,
        styleTensorRef.current,
        value,
        serverClient,
      );
    },
    [effectiveReady, fast, serverClient],
  );

  const handleContentLoaded = useCallback(
    (img: HTMLImageElement) => {
      setContentImage(img);
      if (styleImage && effectiveReady) {
        setTimeout(() => prepareAndStylize(), 0);
      }
    },
    [styleImage, effectiveReady, prepareAndStylize],
  );

  const handleStyleLoaded = useCallback(
    (img: HTMLImageElement) => {
      setStyleImage(img);
      if (contentImage && effectiveReady) {
        setTimeout(() => prepareAndStylize(), 0);
      }
    },
    [contentImage, effectiveReady, prepareAndStylize],
  );

  const handleDownload = useCallback(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".dream-canvas");
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fast-style-${outputSize[1]}x${outputSize[0]}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }, [outputSize]);

  const isLoading =
    predictorLoader.loadState.state === "loading" ||
    transformerLoader.loadState.state === "loading";

  return (
    <>
      <div className="dream-sidebar">
        <BackendIndicator status={backend} />

        {serverConnected ? (
          <div className="model-selector">
            <label>AdaIN Style Transfer (Server)</label>
            <span className="backend-badge">Server Ready</span>
          </div>
        ) : (
          <div className="model-selector">
            <label>Magenta Models (~17.5 MB total)</label>
            {!modelsLoaded && (
              <button onClick={handleLoadModels} disabled={isLoading}>
                {isLoading ? "Loading..." : "Load Models"}
              </button>
            )}
            {modelsLoaded && <span className="backend-badge">Loaded</span>}
          </div>
        )}

        <DualImageUploader
          onContentLoaded={handleContentLoaded}
          onStyleLoaded={handleStyleLoaded}
        />

        {effectiveReady && (
          <>
            <ResolutionSelector
              value={resolution}
              onChange={setResolution}
              disabled={fast.state === "stylizing"}
              serverConnected={serverConnected}
              maxBrowserResolution={384}
            />

            <StylizationSlider
              value={fast.strength}
              onChange={handleStrengthChange}
              disabled={fast.state === "stylizing"}
            />
          </>
        )}

        <div className="dream-controls">
          {effectiveReady &&
            contentImage &&
            styleImage &&
            fast.state === "ready" && (
              <button onClick={() => prepareAndStylize()}>Re-stylize</button>
            )}
          {fast.state === "ready" && contentImage && styleImage && (
            <button onClick={handleDownload}>Download</button>
          )}
        </div>

        {fast.state === "stylizing" && (
          <div className="dream-progress">
            <p>Stylizing...</p>
          </div>
        )}
      </div>

      <div className="dream-canvas-container">
        <ImageCanvas
          width={outputSize[1]}
          height={outputSize[0]}
          canvasRef={fast.setCanvas}
        />
      </div>
    </>
  );
};

export default StyleFastPanel;
