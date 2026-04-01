import { useEffect, useState } from "react";

interface Props {
  value: number;
  onChange: (size: number) => void;
  disabled?: boolean;
  serverConnected: boolean;
  /** Max resolution allowed in browser-only mode (e.g., 384 for Magenta fast style) */
  maxBrowserResolution?: number;
}

interface ResOption {
  size: number;
  label: string;
  memEstimateMB: number;
}

const RESOLUTIONS: ResOption[] = [
  { size: 224, label: "224 × 224", memEstimateMB: 150 },
  { size: 384, label: "384 × 384", memEstimateMB: 400 },
  { size: 512, label: "512 × 512", memEstimateMB: 800 },
  { size: 768, label: "768 × 768", memEstimateMB: 1600 },
  { size: 1024, label: "1024 × 1024", memEstimateMB: 3000 },
  { size: 1536, label: "1536 × 1536", memEstimateMB: 6000 },
  { size: 2048, label: "2048 × 2048", memEstimateMB: 10000 },
];

/**
 * Estimate available GPU memory.
 * WebGPU exposes adapter limits; WebGL has no API for this.
 * Falls back to conservative estimate based on device memory.
 */
async function estimateGpuMemoryMB(): Promise<number> {
  // Try WebGPU adapter info
  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        // maxBufferSize gives a rough proxy — typically 25-50% of VRAM
        const maxBuffer = adapter.limits.maxBufferSize;
        // Conservative: assume total GPU mem is ~4x maxBufferSize
        return Math.round((maxBuffer * 4) / (1024 * 1024));
      }
    } catch {
      // WebGPU not available or failed
    }
  }

  // Fallback: use deviceMemory API (reports RAM in GB, rough proxy)
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (nav.deviceMemory) {
    // Assume GPU can use ~25% of system RAM for tensor ops
    return Math.round((nav.deviceMemory * 1024) / 4);
  }

  // Ultra-conservative default
  return 2000;
}

const ResolutionSelector = ({
  value,
  onChange,
  disabled,
  serverConnected,
  maxBrowserResolution,
}: Props) => {
  const [gpuMemMB, setGpuMemMB] = useState<number>(2000);

  useEffect(() => {
    estimateGpuMemoryMB().then(setGpuMemMB);
  }, []);

  return (
    <div className="resolution-selector">
      <label htmlFor="resolution-select">Resolution:</label>
      <select
        id="resolution-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseInt(e.target.value))}
      >
        {RESOLUTIONS.map((r) => {
          const exceedsModelCap =
            !serverConnected &&
            maxBrowserResolution !== undefined &&
            r.size > maxBrowserResolution;
          const isWarning =
            !serverConnected &&
            !exceedsModelCap &&
            r.memEstimateMB >= gpuMemMB * 0.7 &&
            r.memEstimateMB < gpuMemMB;
          const isTooLarge =
            !serverConnected &&
            !exceedsModelCap &&
            r.memEstimateMB >= gpuMemMB;

          const isDisabled = exceedsModelCap || isTooLarge;

          let suffix = "";
          if (serverConnected) {
            suffix = "";
          } else if (exceedsModelCap) {
            suffix = " (requires server)";
          } else if (isTooLarge) {
            suffix = " (may OOM)";
          } else if (isWarning) {
            suffix = " (heavy)";
          }

          return (
            <option key={r.size} value={r.size} disabled={isDisabled}>
              {r.label}
              {suffix}
            </option>
          );
        })}
      </select>
      {!serverConnected && value >= 512 && (
        <p className="resolution-warning">
          Large resolutions use significant GPU memory. Start the local server
          for better performance.
        </p>
      )}
    </div>
  );
};

export default ResolutionSelector;
