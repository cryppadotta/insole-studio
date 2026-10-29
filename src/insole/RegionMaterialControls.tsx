import { useId } from "react";
import type { DensityPattern } from "./density";

const PATTERNS: { value: DensityPattern; label: string }[] = [
  { value: "gyroid", label: "Gyroid" },
  { value: "cubic", label: "Cubic" },
  { value: "rectilinear", label: "Rectilinear · alternating cross-hatch" },
];

export const densityPatternLabel = (pattern: DensityPattern) =>
  PATTERNS.find((option) => option.value === pattern)?.label.split(" · ")[0] ??
  "Gyroid";

export default function RegionMaterialControls({
  label,
  pattern,
  onPatternChange,
}: {
  label: string;
  pattern: DensityPattern;
  onPatternChange: (pattern: DensityPattern) => void;
}) {
  const patternId = useId();
  return (
    <div className="sole-region-material-controls">
      <label className="sole-density-select" htmlFor={patternId}>
        {label} infill pattern
        <select
          id={patternId}
          aria-label={`${label} infill pattern`}
          value={pattern}
          onChange={(event) =>
            onPatternChange(event.target.value as DensityPattern)
          }
        >
          {PATTERNS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
