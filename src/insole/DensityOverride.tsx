import Measure from "./Measure";
import {
  DEFAULT_PRINT_TEMPERATURE,
  type DensityOverride,
  type DensityPattern,
  type DensityScope,
} from "./density";
import RegionMaterialControls, {
  densityPatternLabel,
} from "./RegionMaterialControls";

export function ScopeSelect({
  value,
  onChange,
  label = "Vertical extent",
}: {
  value: DensityScope;
  onChange: (scope: DensityScope) => void;
  label?: string;
}) {
  return (
    <label className="sole-density-select">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as DensityScope)}
      >
        <option value="full">Full thickness</option>
        <option value="base">Base only</option>
        <option value="support">Support above the base</option>
      </select>
    </label>
  );
}
export default function DensityOverrideControl({
  label,
  value,
  baseInfill,
  basePattern,
  onChange,
}: {
  label: string;
  value: DensityOverride | null;
  baseInfill: number;
  basePattern: DensityPattern;
  onChange: (value: DensityOverride | null) => void;
}) {
  return (
    <div className="sole-density-override">
      <label className="sole-density-toggle">
        <input
          type="checkbox"
          aria-label={`Custom ${label.toLowerCase()} settings`}
          checked={value !== null}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? {
                    infill: baseInfill,
                    pattern: basePattern,
                    temperature: DEFAULT_PRINT_TEMPERATURE,
                    scope: "full",
                  }
                : null,
            )
          }
        />
        <span>Custom {label.toLowerCase()} settings</span>
        <strong>
          {value ? `${value.infill}%` : `${baseInfill}% inherited`}
        </strong>
      </label>
      <div className="sole-region-summary">
        {densityPatternLabel(value?.pattern ?? basePattern)}
        {value ? "" : " · inherited"}
      </div>
      {value && (
        <>
          <Measure
            label={`${label} infill`}
            value={value.infill}
            min={0}
            max={100}
            unit="%"
            onChange={(infill) => onChange({ ...value, infill })}
          />
          <RegionMaterialControls
            label={label}
            pattern={value.pattern}
            onPatternChange={(pattern) => onChange({ ...value, pattern })}
          />
          <ScopeSelect
            label={`${label} density extent`}
            value={value.scope}
            onChange={(scope) => onChange({ ...value, scope })}
          />
        </>
      )}
      <p>
        {value
          ? "This footprint follows the support as you move or resize it."
          : "Inherits base infill and pattern. Enable to customize this footprint."}
      </p>
    </div>
  );
}
