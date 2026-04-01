import { BUNDLED_MODELS, type BundledModel } from "../../dream/models/registry";
import type { ModelLoadState } from "../../hooks/useModelLoader";

interface Props {
  loadState: ModelLoadState;
  onSelect: (model: BundledModel) => void;
  models?: BundledModel[];
}

const ModelSelector = ({ loadState, onSelect, models }: Props) => {
  const displayModels = models ?? BUNDLED_MODELS;

  const formatSize = (bytes: number) => {
    const mb = bytes / 1_000_000;
    return `${mb.toFixed(0)} MB`;
  };

  return (
    <div className="model-selector">
      <label htmlFor="model-select">Model:</label>
      <select
        id="model-select"
        disabled={loadState.state === "loading"}
        onChange={(e) => {
          const model = displayModels.find((m) => m.id === e.target.value);
          if (model) onSelect(model);
        }}
        defaultValue=""
      >
        <option value="" disabled>
          Select a model...
        </option>
        {displayModels.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} ({formatSize(m.sizeBytes)})
          </option>
        ))}
      </select>

      {loadState.state === "loading" && (
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${(loadState.progress * 100).toFixed(0)}%` }}
          />
          <span>{(loadState.progress * 100).toFixed(0)}%</span>
        </div>
      )}

      {loadState.state === "error" && (
        <p className="error-text">Failed to load model: {loadState.error}</p>
      )}
    </div>
  );
};

export default ModelSelector;
