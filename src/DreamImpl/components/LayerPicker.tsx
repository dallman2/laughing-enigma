import { useCallback } from "react";
import type { LayerInfo } from "../../dream/models/layer-inspector";

interface Props {
  layers: LayerInfo[];
  selected: string[];
  defaultLayers: string[];
  onChange: (selected: string[]) => void;
}

const LayerPicker = ({ layers, selected, defaultLayers, onChange }: Props) => {
  // Filter to show interesting layers (skip input, flatten, etc.)
  const interestingClasses = new Set([
    "ReLU",
    "Activation",
    "Conv2D",
    "BatchNormalization",
    "Concatenate",
    "Add",
    "DepthwiseConv2D",
  ]);

  const displayLayers = layers.filter(
    (l) =>
      interestingClasses.has(l.className) || defaultLayers.includes(l.name),
  );

  const toggle = (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter((n) => n !== name));
    } else {
      onChange([...selected, name]);
    }
  };

  const selectRandom = useCallback(
    (count: number) => {
      const shuffled = [...displayLayers].sort(() => Math.random() - 0.5);
      onChange(shuffled.slice(0, count).map((l) => l.name));
    },
    [displayLayers, onChange],
  );

  return (
    <div className="layer-picker">
      <label>Dream layers:</label>
      <div className="layer-buttons">
        <button onClick={() => onChange([])}>Deselect all</button>
        <button onClick={() => selectRandom(3)}>3 random</button>
        <button onClick={() => selectRandom(5)}>5 random</button>
        <button onClick={() => selectRandom(8)}>8 random</button>
      </div>
      <div className="layer-list">
        {displayLayers.map((layer) => (
          <label key={layer.name} className="layer-item">
            <input
              type="checkbox"
              checked={selected.includes(layer.name)}
              onChange={() => toggle(layer.name)}
            />
            <span className="layer-name">{layer.name}</span>
            <span className="layer-meta">
              {layer.className} [{layer.outputShape.join("\u00d7")}]
            </span>
          </label>
        ))}
      </div>
    </div>
  );
};

export default LayerPicker;
