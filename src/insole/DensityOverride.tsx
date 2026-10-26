import Measure from "./Measure";
import type { DensityOverride, DensityScope } from "./density";

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
  onChange,
}: {
  label: string;
  value: DensityOverride | null;
  baseInfill: number;
  onChange: (value: DensityOverride | null) => void;
}) {
  return (
    <div className="sole-density-override">
      <label className="sole-density-toggle">
        <input
          type="checkbox"
          aria-label={`Custom ${label.toLowerCase()} infill`}
          checked={value !== null}
          onChange={(e) =>
            onChange(
              e.target.checked ? { infill: baseInfill, scope: "full" } : null,
            )
          }
        />
        <span>Custom {label.toLowerCase()} infill</span>
        <strong>
          {value ? `${value.infill}%` : `${baseInfill}% inherited`}
        </strong>
      </label>
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
          : "Uses the base infill until you enable an override."}
      </p>
    </div>
  );
}
