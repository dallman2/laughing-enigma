import { useCallback, useState } from "react";
import * as tf from "@tensorflow/tfjs";

export type GraphModelLoadState =
  | { state: "idle" }
  | { state: "loading"; progress: number }
  | { state: "loaded"; model: tf.GraphModel }
  | { state: "error"; error: string };

/**
 * Load a TF.js GraphModel with IndexedDB caching.
 * GraphModels are inference-only (no gradient support) — used for Magenta feedforward models.
 */
export function useGraphModelLoader() {
  const [loadState, setLoadState] = useState<GraphModelLoadState>({
    state: "idle",
  });

  const load = useCallback(async (url: string) => {
    const cacheKey = `indexeddb://dream-graph-${encodeURIComponent(url)}`;

    setLoadState({ state: "loading", progress: 0 });
    try {
      // Check IndexedDB cache
      const models = await tf.io.listModels();
      let model: tf.GraphModel;

      if (cacheKey in models) {
        model = await tf.loadGraphModel(cacheKey);
      } else {
        model = await tf.loadGraphModel(url, {
          onProgress: (fraction) => {
            setLoadState({ state: "loading", progress: fraction });
          },
        });
        // Cache for next time
        try {
          await model.save(cacheKey);
        } catch (e) {
          console.warn("Failed to cache GraphModel:", e);
        }
      }

      setLoadState({ state: "loaded", model });
      return model;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoadState({ state: "error", error: msg });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setLoadState({ state: "idle" });
  }, []);

  return { loadState, load, reset };
}
