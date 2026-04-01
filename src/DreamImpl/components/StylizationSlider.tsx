interface Props {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const StylizationSlider = ({ value, onChange, disabled }: Props) => {
  return (
    <div className="parameter-panel">
      <div className="param-row">
        <label htmlFor="stylization-strength">Strength:</label>
        <input
          id="stylization-strength"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <span>{value.toFixed(2)}</span>
      </div>
      <div className="strength-labels">
        <span>Content</span>
        <span>Style</span>
      </div>
    </div>
  );
};

export default StylizationSlider;
