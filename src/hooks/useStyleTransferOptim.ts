import { useCallback, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import { styleTransferOptimize } from "../dream/engine/style-transfer-optim";
import { preprocess, deprocess } from "../dream/engine/preprocessing";
import type { DreamServerClient } from "../dream/server/client";
import { tensorToBase64Jpeg } from "../dream/server/encode";

export type StyleOptimState =
  | "idle"
  | "loading_model"
  | "model_ready"
  | "running"
  | "paused"
  | "complete";

export interface StyleOptimParams {
  iterations: number;
  learningRate: number;
  contentWeight: number;
  styleWeight: number;
  tvWeight: number;
  /** 0 = fine textures (early layers), 1 = large patterns (late layers) */
  styleScale: number;
}

export const DEFAULT_STYLE_OPTIM_PARAMS: StyleOptimParams = {
  iterations: 500,
  learningRate: 0.01,
  contentWeight: 1,
  styleWeight: 1e5,
  tvWeight: 1e-4,
  styleScale: 0.5,
};

export interface StyleOptimProgress {
  iteration: number;
  contentLoss: number;
  styleLoss: number;
  tvLoss: number;
  totalLoss: number;
}

export function useStyleTransferOptim() {
  const [state, setState] = useState<StyleOptimState>("idle");
  const [params, setParams] = useState<StyleOptimParams>(
    DEFAULT_STYLE_OPTIM_PARAMS,
  );
  const [progress, setProgress] = useState<StyleOptimProgress>({
    iteration: 0,
    contentLoss: 0,
    styleLoss: 0,
    tvLoss: 0,
    totalLoss: 0,
  });

  const abortRef = useRef<AbortController | null>(null);
  const modelRef = useRef<tf.LayersModel | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const setCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
  }, []);

  const setModel = useCallback((model: tf.LayersModel) => {
    modelRef.current = model;
    setState("model_ready");
  }, []);

  const start = useCallback(
    async (
      contentImage: tf.Tensor3D,
      styleImage: tf.Tensor3D,
      contentLayer: string,
      styleLayers: string[],
      serverClient?: DreamServerClient | null,
    ) => {
      console.log("[useStyleOptim] start called. model:", !!modelRef.current, "serverClient:", !!serverClient, "connected:", serverClient?.connected, "canvas:", !!canvasRef.current);
      if (!modelRef.current) return;

      setState("running");
      abortRef.current = new AbortController();

      if (serverClient?.connected) {
        // Server mode: delegate via WebSocket
        console.log("[useStyleOptim] using SERVER path");
        try {
          const [contentB64, styleB64] = await Promise.all([
            tensorToBase64Jpeg(contentImage),
            tensorToBase64Jpeg(styleImage),
          ]);
          console.log("[useStyleOptim] encoded images:", contentB64.length, styleB64.length, "chars");

          serverClient.startStyleTransfer({
            type: "start_style_transfer",
            model_id: "vgg19",
            content_image: contentB64,
            style_image: styleB64,
            content_layers: [contentLayer],
            style_layers: styleLayers,
            params: {
              iterations: params.iterations,
              learning_rate: params.learningRate,
              content_weight: params.contentWeight,
              style_weight: params.styleWeight,
              tv_weight: params.tvWeight,
              style_scale: params.styleScale,
            },
          });

          serverClient.onFrame((frameBlob) => {
            if (canvasRef.current) {
              const img = new Image();
              const url = URL.createObjectURL(frameBlob);
              img.onload = () => {
                const ctx = canvasRef.current?.getContext("2d");
                const c = canvasRef.current;
                if (ctx && c) ctx.drawImage(img, 0, 0, c.width, c.height);
                URL.revokeObjectURL(url);
              };
              img.src = url;
            }
          });

          serverClient.onStyleProgress((p) => setProgress(p));
          serverClient.onComplete(() => {
            console.log("[useStyleOptim] server style transfer complete");
            setState("complete");
          });
        } catch (e) {
          console.error("[useStyleOptim] Server style transfer failed:", e);
          setState("model_ready");
        }
      } else {
        // Browser mode: run TF.js optimization locally
        console.log("[useStyleOptim] using BROWSER path, canvas:", canvasRef.current?.width, "x", canvasRef.current?.height);
        try {
          const preprocessedContent = preprocess(contentImage, "imagenet");
          const preprocessedStyle = preprocess(styleImage, "imagenet");
          console.log("[useStyleOptim] preprocessed content:", preprocessedContent.shape, "style:", preprocessedStyle.shape);

          // Compute per-layer weights from styleScale.
          // scale=0: early layers dominate (fine textures)
          // scale=1: late layers dominate (large patterns)
          // Uses exponential weighting across the N style layers.
          const numStyleLayers = styleLayers.length;
          const styleLayerWeights = styleLayers.map((_, i) => {
            const position = numStyleLayers > 1 ? i / (numStyleLayers - 1) : 0.5;
            // Shift the distribution based on styleScale
            const weight = Math.exp(
              -4 * (position - params.styleScale) ** 2,
            );
            return weight;
          });
          // Normalize so weights sum to 1
          const weightSum = styleLayerWeights.reduce((a, b) => a + b, 0);
          const normalizedWeights = styleLayerWeights.map((w) => w / weightSum);
          console.log("[useStyleOptim] style layer weights:", normalizedWeights.map((w) => w.toFixed(3)));

          const result = await styleTransferOptimize(
            modelRef.current,
            preprocessedContent,
            preprocessedStyle,
            contentLayer,
            styleLayers,
            {
              ...params,
              styleLayerWeights: normalizedWeights,
              onProgress: async (iteration, losses, image) => {
                setProgress({
                  iteration,
                  contentLoss: losses.content,
                  styleLoss: losses.style,
                  tvLoss: losses.tv,
                  totalLoss: losses.total,
                });
                if (canvasRef.current) {
                  const display = deprocess(image, "imagenet");
                  await tf.browser.toPixels(display, canvasRef.current);
                  display.dispose();
                }
              },
            },
            abortRef.current.signal,
          );

          console.log("[useStyleOptim] optimization complete, result shape:", (result as tf.Tensor).shape);
          if (canvasRef.current) {
            const finalDisplay = deprocess(
              result as tf.Tensor3D,
              "imagenet",
            );
            console.log("[useStyleOptim] painting final result, display range:", finalDisplay.min().dataSync()[0], "-", finalDisplay.max().dataSync()[0]);
            await tf.browser.toPixels(finalDisplay, canvasRef.current);
            finalDisplay.dispose();
          } else {
            console.error("[useStyleOptim] canvas ref is null!");
          }

          preprocessedContent.dispose();
          preprocessedStyle.dispose();
          setState("complete");
        } catch (e) {
          console.error("[useStyleOptim] Style transfer failed:", e);
          setState("model_ready");
        }
      }
    },
    [params],
  );

  const pause = useCallback(() => {
    abortRef.current?.abort();
    setState("paused");
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setProgress({
      iteration: 0,
      contentLoss: 0,
      styleLoss: 0,
      tvLoss: 0,
      totalLoss: 0,
    });
    setState("model_ready");
  }, []);

  return {
    state,
    params,
    setParams,
    progress,
    setCanvas,
    setModel,
    start,
    pause,
    reset,
  };
}
