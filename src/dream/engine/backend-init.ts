import * as tf from "@tensorflow/tfjs";

type ComputeBackend = "webgpu" | "webgl";

let currentBackend: ComputeBackend | null = null;
let initPromise: Promise<ComputeBackend> | null = null;

export async function initComputeBackend(): Promise<ComputeBackend> {
  if (currentBackend) return currentBackend;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Try WebGPU first
    if (typeof navigator !== "undefined" && "gpu" in navigator) {
      try {
        await import("@tensorflow/tfjs-backend-webgpu");
        const success = await tf.setBackend("webgpu");
        if (success) {
          await tf.ready();
          currentBackend = "webgpu";
          console.log("Dream Explorer: using WebGPU backend");
          return "webgpu" as const;
        }
      } catch (e) {
        console.warn("WebGPU backend failed, falling back to WebGL:", e);
      }
    }

    // Fallback to WebGL
    await tf.setBackend("webgl");
    await tf.ready();
    currentBackend = "webgl";
    console.log("Dream Explorer: using WebGL backend (fallback)");
    return "webgl" as const;
  })();

  return initPromise;
}

export function getComputeBackend(): ComputeBackend | null {
  return currentBackend;
}
