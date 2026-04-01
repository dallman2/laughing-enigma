export type DreamMode = "dream" | "style-optim" | "style-fast";

interface Props {
  mode: DreamMode;
  onChange: (mode: DreamMode) => void;
}

const modes: { value: DreamMode; label: string }[] = [
  { value: "dream", label: "Deep Dream" },
  { value: "style-optim", label: "Style Transfer" },
  { value: "style-fast", label: "Fast Style" },
];

const ModeSelector = ({ mode, onChange }: Props) => {
  return (
    <div className="mode-selector">
      {modes.map((m) => (
        <button
          key={m.value}
          className={`mode-btn ${mode === m.value ? "active" : ""}`}
          onClick={() => onChange(m.value)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
};

export default ModeSelector;
