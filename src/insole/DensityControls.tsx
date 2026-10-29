import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Download,
  Layers3,
  Plus,
  Trash2,
} from "lucide-react";
import type { InsoleParams } from "./model";
import {
  getDensityRegions,
  makeDensityZone,
  type DensityZone,
} from "./density";
import DensityOverrideControl, { ScopeSelect } from "./DensityOverride";
import Measure from "./Measure";
import RegionMaterialControls, {
  densityPatternLabel,
} from "./RegionMaterialControls";

export default function DensityControls({
  params: p,
  onChange,
  selectedZoneId,
  onSelectZone,
  onExport,
}: {
  params: InsoleParams;
  onChange: (p: InsoleParams) => void;
  selectedZoneId?: string;
  onSelectZone: (id: string) => void;
  onExport: () => void;
}) {
  const d = p.density;
  const selected =
    d.zones.find((zone) => zone.id === selectedZoneId) ?? d.zones[0];
  const setZone = (zone: DensityZone) =>
    onChange({
      ...p,
      density: {
        ...d,
        zones: d.zones.map((z) => (z.id === zone.id ? zone : z)),
      },
    });
  const addZone = (type: "blank" | "heel" | "forefoot") => {
    const zone = makeDensityZone(d.zones.length);
    if (type === "heel") {
      zone.name = "Heel cushion";
      zone.position = 0.15;
      zone.width = p.heelWidth * 0.85;
      zone.length = p.length * 0.25;
    }
    if (type === "forefoot") {
      zone.name = "Forefoot cushion";
      zone.position = 0.73;
      zone.width = p.width * 0.9;
      zone.length = p.length * 0.22;
    }
    onChange({ ...p, density: { ...d, zones: [...d.zones, zone] } });
    onSelectZone(zone.id);
  };
  const field = (
    key: "position" | "offset" | "width" | "length" | "rotation",
    label: string,
    min: number,
    max: number,
    scale = 1,
    unit = "mm",
  ) =>
    selected && (
      <Measure
        label={label}
        value={selected[key] * scale}
        min={min}
        max={max}
        step={key === "rotation" ? 1 : 0.1}
        unit={unit}
        onChange={(n) => setZone({ ...selected, [key]: n / scale })}
      />
    );
  const move = (direction: number) => {
    if (!selected) return;
    const index = d.zones.indexOf(selected);
    const next = index + direction;
    if (next < 0 || next >= d.zones.length) return;
    const zones = [...d.zones];
    [zones[index], zones[next]] = [zones[next], zones[index]];
    onChange({ ...p, density: { ...d, zones } });
  };
  return (
    <>
      <div className="sole-control-heading">
        <Layers3 size={15} />
        <h3>Base structure</h3>
        <span>MATERIAL</span>
      </div>
      <Measure
        label="Base infill"
        value={d.baseInfill}
        min={0}
        max={100}
        unit="%"
        onChange={(baseInfill) =>
          onChange({ ...p, density: { ...d, baseInfill } })
        }
        note="Default internal infill wherever no region overrides it."
      />
      <RegionMaterialControls
        label="Base"
        pattern={d.pattern}
        onPatternChange={(pattern) =>
          onChange({ ...p, density: { ...d, pattern } })
        }
      />
      <p className="sole-density-help">
        These percentages control internal infill, not a measured compression or
        foam density. At 100%, the export uses rectilinear.
      </p>
      <p className="sole-density-help">
        Complete MK4S projects use 250°C for the whole insole, with matching
        starting flow for your selected TPU Air grade.
      </p>
      <details className="sole-details">
        <summary>
          Support-linked regions
          <ChevronDown size={14} />
        </summary>
        <p>
          These regions move with the existing arch, heel and pads. The same
          controls are also in Add your support.
        </p>
        <DensityOverrideControl
          label="Arch"
          value={d.arch}
          baseInfill={d.baseInfill}
          basePattern={d.pattern}
          onChange={(arch) => onChange({ ...p, density: { ...d, arch } })}
        />
        <DensityOverrideControl
          label="Heel"
          value={d.heel}
          baseInfill={d.baseInfill}
          basePattern={d.pattern}
          onChange={(heel) => onChange({ ...p, density: { ...d, heel } })}
        />
        {p.pads.map((pad, i) => (
          <DensityOverrideControl
            key={pad.id}
            label={`Pad ${i + 1}`}
            value={d.pads[pad.id] ?? null}
            baseInfill={d.baseInfill}
            basePattern={d.pattern}
            onChange={(value) => {
              const pads = { ...d.pads };
              if (value) pads[pad.id] = value;
              else delete pads[pad.id];
              onChange({ ...p, density: { ...d, pads } });
            }}
          />
        ))}
      </details>
      <div className="sole-control-heading sole-section-break">
        <Layers3 size={15} />
        <h3>Custom base regions</h3>
        <span>{d.zones.length}</span>
      </div>
      <div className="sole-preset-row">
        <button onClick={() => addZone("heel")}>+ Heel</button>
        <button onClick={() => addZone("forefoot")}>+ Forefoot</button>
        <button onClick={() => addZone("blank")}>+ Custom</button>
      </div>
      <div className="sole-pad-list" aria-label="Custom density regions">
        {d.zones.map((zone, i) => (
          <div
            key={zone.id}
            className={`sole-pad-row ${selected?.id === zone.id ? "active" : ""}`}
          >
            <button onClick={() => onSelectZone(zone.id)}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <strong>{zone.name}</strong>
              <small className="sole-zone-material-summary">
                <span>
                  {zone.infill}% · {densityPatternLabel(zone.pattern)}
                </span>
              </small>
            </button>
            <input
              type="checkbox"
              aria-label={`Enable ${zone.name}`}
              checked={zone.enabled}
              onChange={(e) => setZone({ ...zone, enabled: e.target.checked })}
            />
          </div>
        ))}
      </div>
      {selected ? (
        <>
          <div className="sole-pad-editor-heading">
            <label>
              Region name
              <input
                aria-label="Density region name"
                maxLength={60}
                value={selected.name}
                onChange={(e) => setZone({ ...selected, name: e.target.value })}
              />
            </label>
            <button
              aria-label="Move region earlier"
              title="Lower overlap priority"
              onClick={() => move(-1)}
              disabled={d.zones[0] === selected}
            >
              <ArrowUp size={14} />
            </button>
            <button
              aria-label="Move region later"
              title="Higher overlap priority"
              onClick={() => move(1)}
              disabled={d.zones.at(-1) === selected}
            >
              <ArrowDown size={14} />
            </button>
            <button
              aria-label="Delete density region"
              onClick={() => {
                const zones = d.zones.filter((z) => z.id !== selected.id);
                onChange({ ...p, density: { ...d, zones } });
                onSelectZone(zones[0]?.id ?? "");
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
          <Measure
            label="Region infill"
            value={selected.infill}
            min={0}
            max={100}
            unit="%"
            onChange={(infill) => setZone({ ...selected, infill })}
          />
          <RegionMaterialControls
            label="Region"
            pattern={selected.pattern}
            onPatternChange={(pattern) => setZone({ ...selected, pattern })}
          />
          <ScopeSelect
            label="Region density extent"
            value={selected.scope}
            onChange={(scope) => setZone({ ...selected, scope })}
          />
          <label className="sole-density-select">
            Region shape
            <select
              aria-label="Density region shape"
              value={selected.shape}
              onChange={(e) =>
                setZone({
                  ...selected,
                  shape: e.target.value as "ellipse" | "box",
                })
              }
            >
              <option value="ellipse">Ellipse</option>
              <option value="box">Rectangle</option>
            </select>
          </label>
          {field("position", "Region position", 0, 100, 100, "%")}
          {field("offset", "Region lateral offset", -150, 150)}
          {field("width", "Region width", 5, 300)}
          {field("length", "Region length", 5, 450)}
          {field("rotation", "Region rotation", -180, 180, 1, "°")}
          <p className="sole-density-help">
            Drag the selected orange center in plan view to move this region.
          </p>
        </>
      ) : (
        <div className="sole-empty-pads">
          <Plus size={22} />
          <p>
            Add a region anywhere in the base. Its footprint changes infill
            without changing your insole shape.
          </p>
        </div>
      )}
      <details className="sole-details">
        <summary>
          Overlaps & sliced result
          <ChevronDown size={14} />
        </summary>
        <p>
          Infill and pattern are absolute settings, not additive. Priority: arch
          → heel → pads in order → custom regions in order. The last matching
          region wins. Move a custom region down to give it priority.
        </p>
        <p>
          Only the part inside the insole is affected. Regions outside the
          footprint print nothing. Top and bottom solid layers and perimeters
          still come from your PrusaSlicer settings, so a thin base can remain
          fully solid even with low infill.
        </p>
        <p>
          The 3D colors sample the surface; a base-only region may show on the
          underside. The plan view shows all footprints. Slice the 3MF to
          inspect actual toolpaths and solid shells.
        </p>
      </details>
      <button className="sole-button sole-primary sole-full" onClick={onExport}>
        <Download size={15} />
        Export PrusaSlicer 3MF
      </button>
      <p className="sole-density-help">
        {getDensityRegions(p).length} non-printing modifiers · infill and
        pattern applied in PrusaSlicer.
      </p>
      <details className="sole-details sole-material-guide">
        <summary>
          Siraya Flex TPU Air
          <ChevronDown size={14} />
        </summary>
        <p>
          Foaming and infill both affect feel. Use the same shells and material
          settings when comparing regional infill.
        </p>
        <p>
          For repeatable comparisons, print small coupons at several infill
          values with the same shells and material settings. Do not treat infill
          percentage as a predicted hardness or compression.
        </p>
        <a
          href="https://siraya.tech/blogs/news/foaming-tpu-filament-guide"
          target="_blank"
          rel="noreferrer"
        >
          Siraya’s temperature & flow guide ↗
        </a>
        <a
          href="https://help.prusa3d.com/article/modifiers_1767"
          target="_blank"
          rel="noreferrer"
        >
          How PrusaSlicer modifiers work ↗
        </a>
      </details>
    </>
  );
}
