import { useCallback, useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import { arbitraryStyleTransfer } from "../dream/engine/style-transfer-fast";
import type { DreamServerClient } from "../dream/server/client";
import { tensorToBase64Jpeg } from "../dream/server/encode";

export type StyleFastState = "idle" | "loading_models" | "ready" | "stylizing";

export function useStyleTransferFast(serverConnected?: boolean) {
  const [state, setState] = useState<StyleFastState>("idle");
  const [strength, setStrength] = useState(0.5);

  const predictorRef = useRef<tf.GraphModel | tf.LayersModel | null>(null);
  const transformerRef = useRef<tf.GraphModel | tf.LayersModel | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When server connects, transition to ready (no browser models needed)
  useEffect(() => {
    if (serverConnected && state === "idle") {
      setState("ready");
    } else if (!serverConnected && !predictorRef.current && state === "ready") {
      setState("idle");
    }
  }, [serverConnected, state]);

  const setCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
  }, []);

  const setModels = useCallback(
    (
      predictor: tf.GraphModel | tf.LayersModel,
      transformer: tf.GraphModel | tf.LayersModel,
    ) => {
      predictorRef.current = predictor;
      transformerRef.current = transformer;
      setState("ready");
    },
    [],
  );

  /**
   * Run style transfer. Delegates to server (AdaIN) when connected,
   * otherwise uses browser Magenta models.
   */
  const stylize = useCallback(
    async (
      contentImage: tf.Tensor3D,
      styleImage: tf.Tensor3D,
      stylizationStrength?: number,
      serverClient?: DreamServerClient | null,
    ) => {
      const effectiveStrength = stylizationStrength ?? strength;

      if (serverClient?.connected) {
        // Server path: AdaIN via WebSocket
        setState("stylizing");
        try {
          const [contentB64, styleB64] = await Promise.all([
            tensorToBase64Jpeg(contentImage),
            tensorToBase64Jpeg(styleImage),
          ]);

          serverClient.startFastStyleTransfer({
            type: "start_fast_style_transfer",
            content_image: contentB64,
            style_image: styleB64,
            params: { alpha: effectiveStrength },
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

          serverClient.onComplete(() => {
            setState("ready");
          });
        } catch (e) {
          console.error("Fast style transfer (server) failed:", e);
          setState("ready");
        }
      } else {
        // Browser path: Magenta models
        if (!predictorRef.current || !transformerRef.current) return;

        setState("stylizing");
        try {
          const result = await arbitraryStyleTransfer(
            predictorRef.current,
            transformerRef.current,
            contentImage,
            styleImage,
            effectiveStrength,
          );

          if (canvasRef.current) {
            await tf.browser.toPixels(result, canvasRef.current);
          }
          result.dispose();
          setState("ready");
        } catch (e) {
          console.error("Fast style transfer failed:", e);
          setState("ready");
        }
      }
    },
    [strength],
  );

  /**
   * Debounced stylize — call this on slider change for smooth interaction.
   */
  const stylizeDebounced = useCallback(
    (
      contentImage: tf.Tensor3D,
      styleImage: tf.Tensor3D,
      newStrength: number,
      serverClient?: DreamServerClient | null,
    ) => {
      setStrength(newStrength);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        stylize(contentImage, styleImage, newStrength, serverClient);
      }, 100);
    },
    [stylize],
  );

  return {
    state,
    strength,
    setStrength,
    setCanvas,
    setModels,
    stylize,
    stylizeDebounced,
  };
}
