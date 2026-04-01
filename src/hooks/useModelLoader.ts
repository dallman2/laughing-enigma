import { useCallback, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import { loadLayersModel, type LoadProgress } from "../dream/models/loader";
import { inspectLayers, type LayerInfo } from "../dream/models/layer-inspector";

export type ModelLoadState =
  | { state: "idle" }
  | { state: "loading"; progress: number }
  | { state: "loaded"; model: tf.LayersModel; layers: LayerInfo[] }
  | { state: "error"; error: string };

export function useModelLoader() {
  const [loadState, setLoadState] = useState<ModelLoadState>({ state: "idle" });

  const load = useCallback(async (url: string) => {
    setLoadState({ state: "loading", progress: 0 });
    try {
      const model = await loadLayersModel(url, (p: LoadProgress) => {
        setLoadState({ state: "loading", progress: p.fraction });
      });
      const layers = inspectLayers(model);
      setLoadState({ state: "loaded", model, layers });
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
