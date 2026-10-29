import { useId } from "react";
import Measure from "./Measure";
import { TEMPERATURE_LIMITS, type DensityPattern } from "./density";

const PATTERNS: { value: DensityPattern; label: string }[] = [
  { value: "gyroid", label: "Gyroid" },
  { value: "cubic", label: "Cubic" },
  { value: "rectilinear", label: "Rectilinear · alternating cross-hatch" },
];

export const densityPatternLabel = (pattern: DensityPattern) =>
  PATTERNS.find((option) => option.value === pattern)?.label.split(" · ")[0] ??
  "Gyroid";

export const REGION_TEMPERATURE_HELP =
  "Prusa 3MF applies infill and pattern. Regional temperature is a saved target; standard PrusaSlicer modifiers cannot change nozzle temperature.";

export default function RegionMaterialControls({
  label,
  pattern,
  temperature,
  onPatternChange,
  onTemperatureChange,
  temperatureNote = REGION_TEMPERATURE_HELP,
}: {
  label: string;
  pattern: DensityPattern;
  temperature: number;
  onPatternChange: (pattern: DensityPattern) => void;
  onTemperatureChange: (temperature: number) => void;
  temperatureNote?: string;
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
      <Measure
        label={`${label} target temperature`}
        value={temperature}
        min={TEMPERATURE_LIMITS[0]}
        max={TEMPERATURE_LIMITS[1]}
        step={1}
        unit="°C"
        onChange={onTemperatureChange}
        note={temperatureNote}
      />
      <div
        className="sole-temperature-presets"
        aria-label={`${label} temperature presets`}
      >
        {[240, 250, 260, 270].map((preset) => (
          <button
            key={preset}
            type="button"
            aria-label={`${label} target temperature ${preset}°C`}
            aria-pressed={temperature === preset}
            onClick={() => onTemperatureChange(preset)}
          >
            {preset}°
          </button>
        ))}
      </div>
    </div>
  );
}
