import { useCallback, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import { buildDreamModel } from "../dream/models/layer-inspector";
import { preprocess, deprocess, type PreprocessingMode } from "../dream/engine/preprocessing";
import { deepDreamWithOctaves } from "../dream/engine/deep-dream";
import { DreamServerClient } from "../dream/server/client";

export type DreamState =
  | "idle"
  | "loading_model"
  | "model_ready"
  | "configuring"
  | "running"
  | "paused"
  | "complete";

export interface DreamParams {
  stepSize: number;
  numOctaves: number;
  octaveScale: number;
  stepsPerOctave: number;
  maxLoss: number | null;
}

export const DEFAULT_DREAM_PARAMS: DreamParams = {
  stepSize: 0.01,
  numOctaves: 3,
  octaveScale: 1.3,
  stepsPerOctave: 20,
  maxLoss: null,
};

export interface DreamProgress {
  octave: number;
  step: number;
  loss: number;
}

export function useDream() {
  const [state, setState] = useState<DreamState>("idle");
  const [params, setParams] = useState<DreamParams>(DEFAULT_DREAM_PARAMS);
  const [progress, setProgress] = useState<DreamProgress>({
    octave: 0,
    step: 0,
    loss: 0,
  });
  const [selectedLayers, setSelectedLayers] = useState<string[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const modelRef = useRef<tf.LayersModel | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageVarRef = useRef<tf.Variable | null>(null);

  const setCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
  }, []);

  const setModel = useCallback(
    (model: tf.LayersModel, defaultLayers: string[]) => {
      modelRef.current = model;
      setSelectedLayers(defaultLayers);
      setState("model_ready");
    },
    [],
  );

  /**
   * Start dreaming on the given image using the selected layers and params.
   * Supports two paths: browser (TF.js) and server (WebSocket).
   */
  const start = useCallback(
    async (
      sourceImage: tf.Tensor3D,
      preprocessingMode: PreprocessingMode,
      serverClient?: DreamServerClient | null,
    ) => {
      console.log("[useDream] start called. model:", !!modelRef.current, "layers:", selectedLayers, "canvas:", !!canvasRef.current);
      if (!modelRef.current || selectedLayers.length === 0) { console.log("[useDream] bailing: no model or no layers"); return; }

      setState("running");
      abortRef.current = new AbortController();

      // Clear canvas from any previous run
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }

      if (serverClient?.connected) {
        // Server mode: delegate to Python server via WebSocket
        console.log("[useDream] using SERVER path");
        try {
          // Convert tensor to JPEG for transmission
          // sourceImage is [0, 255] float — scale to [0, 1] for toPixels
          const normalized = tf.tidy(() =>
            sourceImage.div(255).clipByValue(0, 1) as tf.Tensor3D,
          );
          const canvas = document.createElement("canvas");
          await tf.browser.toPixels(normalized, canvas);
          normalized.dispose();

          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob((b) => resolve(b), "image/jpeg", 0.95),
          );
          if (!blob) {
            console.error("[useDream] Failed to create JPEG blob");
            setState("model_ready");
            return;
          }

          const buffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          // Encode base64 in chunks to avoid stack overflow on large images
          let base64 = "";
          for (let i = 0; i < bytes.length; i += 8192) {
            base64 += String.fromCharCode(
              ...bytes.subarray(i, Math.min(i + 8192, bytes.length)),
            );
          }
          base64 = btoa(base64);
          console.log("[useDream] encoded image:", base64.length, "chars");

          serverClient.startDream({
            type: "start_dream",
            model_id: "mobilenet_v2",
            layers: selectedLayers,
            image: base64,
            params: {
              step_size: params.stepSize,
              num_octaves: params.numOctaves,
              octave_scale: params.octaveScale,
              steps_per_octave: params.stepsPerOctave,
              max_loss: params.maxLoss,
            },
          });

          serverClient.onFrame((frameBlob) => {
            if (canvasRef.current) {
              const img = new Image();
              const url = URL.createObjectURL(frameBlob);
              img.onload = () => {
                const c = canvasRef.current;
                const ctx = c?.getContext("2d");
                if (ctx && c) {
                  ctx.drawImage(img, 0, 0, c.width, c.height);
                }
                URL.revokeObjectURL(url);
              };
              img.src = url;
            }
          });

          serverClient.onProgress((p) => {
            setProgress(p);
          });

          serverClient.onComplete(() => {
            console.log("[useDream] server dream complete");
            setState("complete");
          });
        } catch (e) {
          console.error("[useDream] Server dream failed:", e);
          setState("model_ready");
        }
      } else {
        // Browser mode: run TF.js gradient ascent locally
        try {
          console.log("[useDream] browser mode. sourceImage shape:", sourceImage.shape, "preprocessing:", preprocessingMode);
          const preprocessed = preprocess(sourceImage, preprocessingMode);
          console.log("[useDream] preprocessed stats - min:", preprocessed.min().dataSync()[0], "max:", preprocessed.max().dataSync()[0]);
          const dreamModel = buildDreamModel(
            modelRef.current,
            selectedLayers,
          );
          console.log("[useDream] dreamModel built. inputs:", dreamModel.inputs.length, "outputs:", dreamModel.outputs.length);

          const result = await deepDreamWithOctaves(
            dreamModel,
            preprocessed,
            {
              ...params,
              onProgress: async (octave, step, loss, image) => {
                setProgress({ octave, step, loss });
                if (canvasRef.current) {
                  // Resize to canvas dimensions before painting
                  // (octave images may be smaller than the canvas)
                  const resized = tf.tidy(() =>
                    tf.image
                      .resizeBilinear(image.expandDims(0) as tf.Tensor4D, [
                        canvasRef.current!.height,
                        canvasRef.current!.width,
                      ])
                      .squeeze() as tf.Tensor3D,
                  );
                  const displayImage = deprocess(resized, preprocessingMode);
                  await tf.browser.toPixels(displayImage, canvasRef.current);
                  displayImage.dispose();
                  resized.dispose();
                }
              },
            },
            abortRef.current.signal,
          );

          // Paint final result
          if (canvasRef.current) {
            const finalDisplay = deprocess(
              result as tf.Tensor3D,
              preprocessingMode,
            );
            await tf.browser.toPixels(finalDisplay, canvasRef.current);
            finalDisplay.dispose();
          }

          console.log("[useDream] dream complete. result shape:", (result as tf.Tensor).shape);
          imageVarRef.current = result as unknown as tf.Variable;
          preprocessed.dispose();
          // Do NOT dispose dreamModel — it shares layers with the base model.
          // Disposing it corrupts the base model's weights for subsequent runs.
          setState("complete");
        } catch (e) {
          console.error("[useDream] Dream failed:", e);
          setState("model_ready");
        }
      }
    },
    [selectedLayers, params],
  );

  const pause = useCallback(() => {
    abortRef.current?.abort();
    setState("paused");
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    imageVarRef.current?.dispose();
    imageVarRef.current = null;
    setProgress({ octave: 0, step: 0, loss: 0 });
    setState("model_ready");
  }, []);

  return {
    state,
    params,
    setParams,
    progress,
    selectedLayers,
    setSelectedLayers,
    setCanvas,
    setModel,
    start,
    pause,
    reset,
  };
}
