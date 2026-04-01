import type { StyleOptimParams } from "../../hooks/useStyleTransferOptim";

interface Props {
  params: StyleOptimParams;
  onChange: (params: StyleOptimParams) => void;
  disabled?: boolean;
}

const StyleParamPanel = ({ params, onChange, disabled }: Props) => {
  const update = (partial: Partial<StyleOptimParams>) => {
    onChange({ ...params, ...partial });
  };

  return (
    <div className="parameter-panel">
      <div className="param-group">
        <div className="param-row">
          <label htmlFor="st-scale">Style scale:</label>
          <input
            id="st-scale"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={params.styleScale}
            disabled={disabled}
            onChange={(e) =>
              update({ styleScale: parseFloat(e.target.value) })
            }
          />
          <span>{params.styleScale.toFixed(2)}</span>
        </div>
        <div className="strength-labels">
          <span>Fine textures</span>
          <span>Large patterns</span>
        </div>
        <p className="param-desc">
          Controls the size of style patterns. Low = small brushstrokes and
          fine detail from early network layers. High = large structural
          patterns from deep layers.
        </p>
      </div>

      <div className="param-group">
        <div className="param-row">
          <label htmlFor="st-iterations">Iterations:</label>
          <input
            id="st-iterations"
            type="range"
            min={100}
            max={2000}
            step={50}
            value={params.iterations}
            disabled={disabled}
            onChange={(e) => update({ iterations: parseInt(e.target.value) })}
          />
          <span>{params.iterations}</span>
        </div>
        <p className="param-desc">
          Total optimization steps. More iterations = better convergence but
          slower. 300-500 is usually enough, 1000+ for fine detail.
        </p>
      </div>

      <div className="param-group">
        <div className="param-row">
          <label htmlFor="st-lr">Learning rate:</label>
          <input
            id="st-lr"
            type="range"
            min={0.001}
            max={0.05}
            step={0.001}
            value={params.learningRate}
            disabled={disabled}
            onChange={(e) =>
              update({ learningRate: parseFloat(e.target.value) })
            }
          />
          <span>{params.learningRate.toFixed(3)}</span>
        </div>
        <p className="param-desc">
          Speed of optimization. Too high = noisy artifacts. Too low = needs
          more iterations to converge.
        </p>
      </div>

      <div className="param-group">
        <div className="param-row">
          <label htmlFor="st-content-w">Content weight:</label>
          <input
            id="st-content-w"
            type="range"
            min={-2}
            max={3}
            step={0.1}
            value={Math.log10(params.contentWeight)}
            disabled={disabled}
            onChange={(e) =>
              update({ contentWeight: 10 ** parseFloat(e.target.value) })
            }
          />
          <span>{params.contentWeight.toExponential(0)}</span>
        </div>
        <p className="param-desc">
          How strongly the original image structure is preserved. Higher =
          output looks more like the content image.
        </p>
      </div>

      <div className="param-group">
        <div className="param-row">
          <label htmlFor="st-style-w">Style weight:</label>
          <input
            id="st-style-w"
            type="range"
            min={2}
            max={8}
            step={0.1}
            value={Math.log10(params.styleWeight)}
            disabled={disabled}
            onChange={(e) =>
              update({ styleWeight: 10 ** parseFloat(e.target.value) })
            }
          />
          <span>{params.styleWeight.toExponential(0)}</span>
        </div>
        <p className="param-desc">
          How strongly the style image's textures and colors are applied.
          Higher = more stylized, lower = more photographic.
        </p>
      </div>

      <div className="param-group">
        <div className="param-row">
          <label htmlFor="st-tv-w">TV weight:</label>
          <input
            id="st-tv-w"
            type="range"
            min={-6}
            max={-1}
            step={0.1}
            value={Math.log10(params.tvWeight)}
            disabled={disabled}
            onChange={(e) =>
              update({ tvWeight: 10 ** parseFloat(e.target.value) })
            }
          />
          <span>{params.tvWeight.toExponential(0)}</span>
        </div>
        <p className="param-desc">
          Total variation smoothing. Reduces noise and high-frequency
          artifacts. Too high = blurry output.
        </p>
      </div>
    </div>
  );
};

export default StyleParamPanel;
