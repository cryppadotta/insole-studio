import { useState } from "react";
import { ArrowDownToLine, ChevronDown } from "lucide-react";
import {
  SIZES,
  SIZE_SOURCE,
  sizeOptions,
  sizePreset,
  type SizeSystem,
} from "./sizes";
import type { InsoleParams } from "./model";
import Measure from "./Measure";

export default function SizePresets({
  params,
  system,
  value,
  onSelection,
  onApply,
}: {
  params: InsoleParams;
  system: SizeSystem;
  value: string;
  onSelection: (system: SizeSystem, value: string) => void;
  onApply: (params: InsoleParams, footLength: number) => void;
}) {
  const [narrow, setNarrow] = useState(false);
  const [allowance, setAllowance] = useState(10);
  const options = sizeOptions(system);
  const active = options.some((o) => o.value === value)
    ? value
    : options[0].value;
  const size = SIZES.find((s) => String(s.eu) === active)!;
  return (
    <details className="sole-size-presets" open>
      <summary>
        <span>Start from a shoe size</span>
        <ChevronDown size={14} />
      </summary>
      <div className="sole-size-fields">
        <label>
          Size system
          <select
            aria-label="Size system"
            value={system}
            onChange={(e) => {
              const next = e.target.value as SizeSystem;
              const opts = sizeOptions(next);
              onSelection(
                next,
                opts.some((o) => o.value === active) ? active : opts[0].value,
              );
            }}
          >
            <option value="eu">Birkenstock / EU</option>
            <option value="us-men">US Men · Birkenstock</option>
            <option value="us-women">US Women · Birkenstock</option>
          </select>
        </label>
        <label>
          Size
          <select
            aria-label="Shoe size preset"
            value={active}
            onChange={(e) => onSelection(system, e.target.value)}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="sole-preset-row sole-size-width">
        <button
          className={!narrow ? "active" : ""}
          aria-pressed={!narrow}
          onClick={() => setNarrow(false)}
        >
          Regular template
        </button>
        <button
          className={narrow ? "active" : ""}
          aria-pressed={narrow}
          onClick={() => setNarrow(true)}
        >
          Narrow template
        </button>
      </div>
      <div className="sole-size-reference">
        <strong>
          {size.mm}
          <small>mm foot reference</small>
        </strong>
        <span>
          EU {size.eu}
          {size.men !== null ? ` · US M ${size.men}–${size.men + 0.5}` : ""}
          {size.women !== null
            ? ` · US W ${size.women}–${size.women + 0.5}`
            : ""}
        </span>
      </div>
      <Measure
        label="Preset toe allowance"
        value={allowance}
        min={0}
        max={30}
        onChange={setAllowance}
      />
      <button
        className="sole-button sole-full"
        onClick={() => {
          const preset = sizePreset(params, size.eu, narrow, allowance);
          onApply(preset.params, preset.footLength);
        }}
      >
        <ArrowDownToLine size={14} />
        Apply{" "}
        {system === "eu"
          ? `EU ${size.eu}`
          : `US ${system === "us-men" ? "M" : "W"} ${system === "us-men" ? size.men : size.women}`}{" "}
        starting point
      </button>
      <p>
        Outline dimensions are estimates. Check your actual insole before
        printing.{" "}
        <a href={SIZE_SOURCE} target="_blank" rel="noreferrer">
          Birkenstock size guide ↗
        </a>
      </p>
    </details>
  );
}
