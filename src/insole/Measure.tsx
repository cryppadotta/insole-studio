import { useEffect, useState } from "react";

export default function Measure({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "mm",
  onChange,
  note,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (n: number) => void;
  note?: string;
}) {
  const id = "insole-" + label.toLowerCase().replace(/\W/g, "-");
  const [draft, setDraft] = useState(String(Number(value.toFixed(2))));
  useEffect(() => setDraft(String(Number(value.toFixed(2)))), [value]);
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() && Number.isFinite(n))
      onChange(Math.min(max, Math.max(min, n)));
    else setDraft(String(Number(value.toFixed(2))));
  };
  return (
    <div className="sole-measure">
      <div className="sole-measure-label">
        <label htmlFor={id}>{label}</label>
        <div className="sole-number">
          <input
            id={id}
            type="number"
            min={min}
            max={max}
            step={step}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const n = Number(e.target.value);
              if (e.target.value && Number.isFinite(n) && n >= min && n <= max)
                onChange(n);
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <span>{unit}</span>
        </div>
      </div>
      <input
        aria-label={`${label} slider`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, var(--sole-green) ${(100 * (value - min)) / (max - min)}%, #e1e5df 0%)`,
        }}
      />
      {note && <p>{note}</p>}
    </div>
  );
}
