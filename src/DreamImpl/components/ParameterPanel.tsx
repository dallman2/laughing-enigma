import type { DreamParams } from "../../hooks/useDream";

interface Props {
  params: DreamParams;
  onChange: (params: DreamParams) => void;
  disabled?: boolean;
}

const ParameterPanel = ({ params, onChange, disabled }: Props) => {
  const update = (partial: Partial<DreamParams>) => {
    onChange({ ...params, ...partial });
  };

  return (
    <div className="parameter-panel">
      <div className="param-group">
        <div className="param-row">
          <label htmlFor="step-size">Step size:</label>
          <input
            id="step-size"
            type="range"
            min={0.001}
            max={0.05}
            step={0.001}
            value={params.stepSize}
            disabled={disabled}
            onChange={(e) => update({ stepSize: parseFloat(e.target.value) })}
          />
          <span>{params.stepSize.toFixed(3)}</span>
        </div>
        <p className="param-desc">
          How aggressively patterns are amplified each step. Higher = stronger
          effect but can cause artifacts.
        </p>
      </div>

      <div className="param-group">
        <div className="param-row">
          <label htmlFor="num-octaves">Octaves:</label>
          <input
            id="num-octaves"
            type="range"
            min={1}
            max={6}
            step={1}
            value={params.numOctaves}
            disabled={disabled}
            onChange={(e) => update({ numOctaves: parseInt(e.target.value) })}
          />
          <span>{params.numOctaves}</span>
        </div>
        <p className="param-desc">
          Number of resolution scales. More octaves = patterns at multiple
          scales (fine detail + large structures). 1 = single scale only.
        </p>
      </div>

      <div className="param-group">
        <div className="param-row">
          <label htmlFor="octave-scale">Octave scale:</label>
          <input
            id="octave-scale"
            type="range"
            min={1.1}
            max={2.0}
            step={0.05}
            value={params.octaveScale}
            disabled={disabled}
            onChange={(e) =>
              update({ octaveScale: parseFloat(e.target.value) })
            }
          />
          <span>{params.octaveScale.toFixed(2)}</span>
        </div>
        <p className="param-desc">
          Resolution ratio between octaves. 1.3 = each octave is 30% larger.
          Higher = bigger jump between scales, coarser low-frequency patterns.
        </p>
      </div>

      <div className="param-group">
        <div className="param-row">
          <label htmlFor="steps-per-octave">Steps/octave:</label>
          <input
            id="steps-per-octave"
            type="range"
            min={5}
            max={100}
            step={5}
            value={params.stepsPerOctave}
            disabled={disabled}
            onChange={(e) =>
              update({ stepsPerOctave: parseInt(e.target.value) })
            }
          />
          <span>{params.stepsPerOctave}</span>
        </div>
        <p className="param-desc">
          Gradient ascent iterations at each scale. More steps = stronger,
          more defined patterns but slower. 20 is subtle, 100 is intense.
        </p>
      </div>
    </div>
  );
};

export default ParameterPanel;
