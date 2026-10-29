import {
  ChevronDown,
  Copy,
  Footprints,
  Layers3,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import {
  clampParams,
  makePad,
  PAD_LIMITS,
  PARAM_LIMITS,
  type InsoleParams,
  type MetPad,
  type NumericParamKey,
} from "./model";
import CurveEditor from "./CurveEditor";
import Measure from "./Measure";
import DensityOverrideControl from "./DensityOverride";
import RegionMaterialControls from "./RegionMaterialControls";

type Feature = "outline" | "arch" | "heel" | "met" | "base";
type PadNumberKey =
  | "height"
  | "position"
  | "offset"
  | "width"
  | "length"
  | "rotation"
  | "plateau"
  | "curve1"
  | "curve2";
const shapePresets = [
  { label: "Gentle", plateau: 0.18, curve1: 0.98, curve2: 0.65 },
  { label: "Rounded", plateau: 0, curve1: 0.75, curve2: 0.15 },
  { label: "Flat top", plateau: 0.55, curve1: 1, curve2: 0.55 },
];
function ShapeEditor({
  label,
  plateau,
  curve1,
  curve2,
  onChange,
}: {
  label: string;
  plateau: number;
  curve1: number;
  curve2: number;
  onChange: (curve: {
    plateau: number;
    curve1: number;
    curve2: number;
  }) => void;
}) {
  return (
    <>
      <div className="sole-shape-presets">
        <span>SLOPE PROFILE</span>
        <div className="sole-preset-row">
          {shapePresets.map((s) => (
            <button
              key={s.label}
              onClick={() =>
                onChange({
                  plateau: s.plateau,
                  curve1: s.curve1,
                  curve2: s.curve2,
                })
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <details className="sole-details sole-advanced-shape">
        <summary>
          Advanced slope & curve
          <ChevronDown size={14} />
        </summary>
        <p>
          Drag the orange handles to shape the falloff. A wider plateau spreads
          the height across a flatter top.
        </p>
        <CurveEditor
          label={`${label} slope curve`}
          plateau={plateau}
          curve1={curve1}
          curve2={curve2}
          onChange={onChange}
        />
        <Measure
          label={`${label} top plateau`}
          value={plateau * 100}
          min={0}
          max={90}
          step={1}
          unit="%"
          onChange={(v) => onChange({ plateau: v / 100, curve1, curve2 })}
        />
        <Measure
          label={`${label} shoulder fullness`}
          value={curve1 * 100}
          min={0}
          max={100}
          step={1}
          unit="%"
          onChange={(v) => onChange({ plateau, curve1: v / 100, curve2 })}
        />
        <Measure
          label={`${label} edge fullness`}
          value={curve2 * 100}
          min={0}
          max={100}
          step={1}
          unit="%"
          onChange={(v) => onChange({ plateau, curve1, curve2: v / 100 })}
        />
      </details>
    </>
  );
}
export default function SupportControls({
  params: p,
  onChange,
  feature,
  onFeature,
  selectedPadId,
  onSelectedPad,
}: {
  params: InsoleParams;
  onChange: (p: InsoleParams) => void;
  feature: Feature;
  onFeature: (f: Feature) => void;
  selectedPadId?: string;
  onSelectedPad: (id: string) => void;
}) {
  const active = p.pads.find((pad) => pad.id === selectedPadId) ?? p.pads[0];
  const set = (key: NumericParamKey, value: number) =>
    onChange(clampParams({ ...p, [key]: value }));
  const changePad = (next: MetPad) =>
    onChange(
      clampParams({
        ...p,
        pads: p.pads.map((pad) => (pad.id === next.id ? next : pad)),
      }),
    );
  const addPad = () => {
    const pad = makePad(p.pads.length);
    pad.position = Math.min(0.9, 0.63 + p.pads.length * 0.055);
    pad.offset = p.pads.length % 2 ? 15 : -12;
    onChange(clampParams({ ...p, pads: [...p.pads, pad] }));
    onSelectedPad(pad.id);
  };
  const field = (
    key: NumericParamKey,
    label: string,
    unit = "mm",
    scale = 1,
    note?: string,
  ) => (
    <Measure
      key={key}
      label={label}
      value={p[key] * scale}
      min={PARAM_LIMITS[key][0] * scale}
      max={PARAM_LIMITS[key][1] * scale}
      step={
        key === "baseThickness"
          ? 0.1
          : scale === 100
            ? 0.1
            : key.includes("Height") ||
                key === "toeSpring" ||
                key === "heelLift"
              ? 0.5
              : 1
      }
      unit={unit}
      note={note}
      onChange={(n) => set(key, n / scale)}
    />
  );
  const padField = (key: PadNumberKey, label: string, unit = "mm", scale = 1) =>
    active && (
      <Measure
        key={key}
        label={label}
        value={active[key] * scale}
        min={PAD_LIMITS[key][0] * scale}
        max={PAD_LIMITS[key][1] * scale}
        step={
          scale === 100
            ? 0.1
            : key === "height"
              ? 0.25
              : key === "rotation"
                ? 1
                : 0.5
        }
        unit={unit}
        onChange={(n) => changePad({ ...active, [key]: n / scale })}
      />
    );
  return (
    <>
      <div
        className="sole-feature-tabs"
        role="group"
        aria-label="Support sections"
      >
        <button
          className={feature === "arch" ? "active" : ""}
          aria-pressed={feature === "arch"}
          onClick={() => onFeature("arch")}
        >
          <Layers3 size={17} />
          <span>Arch support</span>
          <span className="sole-feature-dot" />
        </button>
        <button
          className={feature === "heel" ? "active" : ""}
          aria-pressed={feature === "heel"}
          onClick={() => onFeature("heel")}
        >
          <ShieldCheck size={17} />
          <span>Heel cup</span>
          <span className="sole-feature-dot" />
        </button>
        <button
          className={feature === "met" ? "active" : ""}
          aria-pressed={feature === "met"}
          onClick={() => onFeature("met")}
        >
          <Footprints size={17} />
          <span>Metatarsal pads</span>
          <span className="sole-pad-count">{p.pads.length}</span>
        </button>
        <button
          className={feature === "base" ? "active" : ""}
          aria-pressed={feature === "base"}
          onClick={() => onFeature("base")}
        >
          <SlidersHorizontal size={17} />
          <span>Base & flex</span>
          <span className="sole-feature-dot" />
        </button>
      </div>
      {feature === "arch" && (
        <>
          <div className="sole-feature-description">
            Shape and position the arch in every direction. Heights are measured
            above the base; where supports overlap, the higher surface wins.
          </div>
          <ShapeEditor
            label="Arch"
            plateau={p.archPlateau}
            curve1={p.archCurve1}
            curve2={p.archCurve2}
            onChange={(c) =>
              onChange({
                ...p,
                archPlateau: c.plateau,
                archCurve1: c.curve1,
                archCurve2: c.curve2,
              })
            }
          />
          <DensityOverrideControl
            label="Arch"
            baseInfill={p.density.baseInfill}
            basePattern={p.density.pattern}
            baseTemperature={p.density.temperature}
            value={p.density.arch}
            onChange={(arch) =>
              onChange({ ...p, density: { ...p.density, arch } })
            }
          />
          {field("archHeight", "Arch height")}
          {field("archLength", "Arch length")}
          {field("archSpan", "Arch support width")}
          {field(
            "archPosition",
            "Arch position",
            "%",
            100,
            "Heel → toe; drag the arch landmark to move it in two dimensions.",
          )}
          {field("archOffset", "Arch lateral offset")}
          {field("archRotation", "Arch rotation", "°")}
        </>
      )}
      {feature === "heel" && (
        <>
          <div className="sole-feature-description">
            Raise the heel rim from 0 to 50 mm.
          </div>
          <DensityOverrideControl
            label="Heel"
            baseInfill={p.density.baseInfill}
            basePattern={p.density.pattern}
            baseTemperature={p.density.temperature}
            value={p.density.heel}
            onChange={(heel) =>
              onChange({ ...p, density: { ...p.density, heel } })
            }
          />
          {field("heelCupHeight", "Heel cup height")}
          <p className="sole-feature-description">
            To raise the whole heel seat, use Heel lift in Base & flex.
          </p>
        </>
      )}
      {feature === "met" && (
        <>
          <div className="sole-pad-list" aria-label="Metatarsal pads">
            {p.pads.map((pad, i) => (
              <div
                key={pad.id}
                className={`sole-pad-row ${active?.id === pad.id ? "active" : ""}`}
              >
                <button onClick={() => onSelectedPad(pad.id)}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <strong>{pad.name}</strong>
                  <small>{pad.height} mm</small>
                </button>
                <input
                  type="checkbox"
                  aria-label={`Enable ${pad.name}`}
                  checked={pad.enabled}
                  onChange={(e) =>
                    changePad({ ...pad, enabled: e.target.checked })
                  }
                />
              </div>
            ))}
          </div>
          <button
            className="sole-button sole-full sole-add-pad"
            onClick={addPad}
          >
            <Plus size={14} />
            Add metatarsal pad
          </button>
          {active ? (
            <>
              <div className="sole-pad-editor-heading">
                <label>
                  Pad name
                  <input
                    aria-label="Pad name"
                    maxLength={60}
                    value={active.name}
                    onChange={(e) =>
                      changePad({ ...active, name: e.target.value })
                    }
                  />
                </label>
                <button
                  aria-label="Duplicate selected pad"
                  title="Duplicate selected pad"
                  onClick={() => {
                    const pad = {
                      ...active,
                      ...{
                        id: makePad().id,
                        name: `${active.name} copy`,
                        offset: Math.min(100, active.offset + 10),
                      },
                    };
                    onChange({
                      ...p,
                      pads: [...p.pads, pad],
                      density: {
                        ...p.density,
                        pads: {
                          ...p.density.pads,
                          ...(p.density.pads[active.id]
                            ? { [pad.id]: { ...p.density.pads[active.id] } }
                            : {}),
                        },
                      },
                    });
                    onSelectedPad(pad.id);
                  }}
                >
                  <Copy size={15} />
                </button>
                <button
                  aria-label="Remove selected pad"
                  title="Remove selected pad"
                  onClick={() => {
                    const next = p.pads.filter((pad) => pad.id !== active.id);
                    onChange({ ...p, pads: next });
                    onSelectedPad(next[0]?.id ?? "");
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {!active.enabled && (
                <p className="sole-disabled-pad-note">
                  This pad is disabled. Enable it in the list to include it in
                  the surface and export.
                </p>
              )}
              <DensityOverrideControl
                label="Pad"
                baseInfill={p.density.baseInfill}
                basePattern={p.density.pattern}
                baseTemperature={p.density.temperature}
                value={p.density.pads[active.id] ?? null}
                onChange={(value) => {
                  const pads = { ...p.density.pads };
                  if (value) pads[active.id] = value;
                  else delete pads[active.id];
                  onChange({ ...p, density: { ...p.density, pads } });
                }}
              />
              <ShapeEditor
                label="Pad"
                plateau={active.plateau}
                curve1={active.curve1}
                curve2={active.curve2}
                onChange={(c) => changePad({ ...active, ...c })}
              />
              {padField("height", "Pad height")}
              {padField("width", "Pad width")}
              {padField("length", "Pad length")}
              {padField("position", "Pad position", "%", 100)}
              {padField("offset", "Pad lateral offset")}
              {padField("rotation", "Pad rotation", "°")}
              <p className="sole-feature-description">
                Arch and pad heights are measured above the same base. Where
                they overlap, the higher surface wins; heights do not stack.
              </p>
            </>
          ) : (
            <div className="sole-empty-pads">
              <Footprints size={24} />
              <p>
                Add a pad to start shaping the forefoot. You can use as many as
                your design needs.
              </p>
            </div>
          )}
        </>
      )}
      {feature === "base" && (
        <>
          <div className="sole-feature-description">
            Set the base thickness, then raise the heel or toe. The underside
            stays flat for printing.
          </div>
          {field(
            "baseThickness",
            "Base thickness",
            "mm",
            1,
            "0.8–20 mm beneath the supports, before heel and toe lift.",
          )}
          {field(
            "heelLift",
            "Heel lift",
            "mm",
            1,
            "0–40 mm added across the heel seat, blending smoothly to zero by 60% of the insole length.",
          )}
          {field(
            "toeSpring",
            "Toe lift",
            "mm",
            1,
            "0–40 mm of upper-surface lift at the toe.",
          )}
          <div className="sole-control-heading sole-section-break">
            <Layers3 size={15} />
            <h3>Base material</h3>
          </div>
          <Measure
            label="Base infill"
            value={p.density.baseInfill}
            min={0}
            max={100}
            unit="%"
            onChange={(baseInfill) =>
              onChange({ ...p, density: { ...p.density, baseInfill } })
            }
            note="Defaults for every region without custom settings."
          />
          <RegionMaterialControls
            label="Base"
            pattern={p.density.pattern}
            temperature={p.density.temperature}
            onPatternChange={(pattern) =>
              onChange({ ...p, density: { ...p.density, pattern } })
            }
            onTemperatureChange={(temperature) =>
              onChange({ ...p, density: { ...p.density, temperature } })
            }
            temperatureNote="Whole-insole print temperature in complete projects; local temperature targets are saved separately. Changing temperature also adjusts the starting flow for foaming TPU."
          />
        </>
      )}
    </>
  );
}
