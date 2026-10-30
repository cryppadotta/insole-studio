import { BufferGeometry, Float32BufferAttribute } from "three";
import type { InsoleParams } from "./model";

/** Infill is a slicer percentage, rather than a material density or hardness. */
export type DensityScope = "full" | "base" | "support";
export type DensityPattern = "gyroid" | "cubic" | "rectilinear";

export const DEFAULT_PRINT_TEMPERATURE = 250;
export const TEMPERATURE_LIMITS = [230, 270] as const;

export function isDensityPattern(value: unknown): value is DensityPattern {
  return value === "gyroid" || value === "cubic" || value === "rectilinear";
}

export interface DensityOverride {
  infill: number;
  pattern: DensityPattern;
  temperature: number;
  scope: DensityScope;
}

export interface DensityZone extends DensityOverride {
  id: string;
  name: string;
  enabled: boolean;
  shape: "ellipse" | "box";
  /** Heel-to-toe fraction. */
  position: number;
  /** Millimetres in canonical right-foot coordinates; negative is medial. */
  offset: number;
  width: number;
  length: number;
  /** Counterclockwise degrees in the model's XY plane. */
  rotation: number;
}

export interface DensityConfig {
  baseInfill: number;
  pattern: DensityPattern;
  temperature: number;
  arch: DensityOverride | null;
  heel: DensityOverride | null;
  pads: Record<string, DensityOverride>;
  zones: DensityZone[];
}

export const DENSITY_ZONE_LIMITS = {
  infill: [0, 100],
  position: [0, 1],
  offset: [-150, 150],
  width: [5, 300],
  length: [5, 450],
  rotation: [-180, 180],
} as const;

export function defaultDensity(): DensityConfig {
  return {
    baseInfill: 20,
    pattern: "gyroid",
    temperature: DEFAULT_PRINT_TEMPERATURE,
    arch: null,
    heel: null,
    pads: {},
    zones: [],
  };
}

/** Every editable object is independent, including overrides and custom zones. */
export function cloneDensity(
  input: DensityConfig = defaultDensity(),
): DensityConfig {
  return {
    ...input,
    arch: input.arch ? { ...input.arch } : null,
    heel: input.heel ? { ...input.heel } : null,
    pads: Object.fromEntries(
      Object.entries(input.pads).map(([id, override]) => [id, { ...override }]),
    ),
    zones: input.zones.map((zone) => ({ ...zone })),
  };
}

let zoneSequence = 0;

const DEFAULT_ZONE: Omit<DensityZone, "id" | "name"> = {
  enabled: true,
  shape: "ellipse",
  infill: 12,
  pattern: "gyroid",
  temperature: DEFAULT_PRINT_TEMPERATURE,
  scope: "full",
  position: 0.25,
  offset: 0,
  width: 50,
  length: 65,
  rotation: 0,
};

export function makeDensityZone(index = 0): DensityZone {
  const ordinal = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  const id =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `density-zone-${Date.now().toString(36)}-${++zoneSequence}`;
  return {
    ...DEFAULT_ZONE,
    id,
    name: `Density zone ${ordinal + 1}`,
  };
}

function record(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function finite(
  input: unknown,
  fallback: number,
  limits: readonly [number, number],
) {
  const value =
    typeof input === "number" && Number.isFinite(input) ? input : fallback;
  return Math.min(limits[1], Math.max(limits[0], value));
}

function scope(input: unknown): DensityScope {
  return input === "base" || input === "support" ? input : "full";
}

/** PrusaSlicer stores nozzle temperatures as integer degrees. */
function printTemperature(input: unknown, fallback: number): number {
  return Math.round(finite(input, fallback, TEMPERATURE_LIMITS));
}

function override(
  input: unknown,
  basePattern: DensityPattern,
  baseTemperature: number,
): DensityOverride | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = record(input);
  return {
    infill: finite(raw.infill, 20, [0, 100]),
    pattern: isDensityPattern(raw.pattern) ? raw.pattern : basePattern,
    temperature: printTemperature(raw.temperature, baseTemperature),
    scope: scope(raw.scope),
  };
}

/** Normalize legacy projects and imported edits without mutating their objects. */
export function clampDensity(input: unknown, padIds?: string[]): DensityConfig {
  const raw = record(input);
  const basePattern = isDensityPattern(raw.pattern) ? raw.pattern : "gyroid";
  const baseTemperature = printTemperature(
    raw.temperature,
    DEFAULT_PRINT_TEMPERATURE,
  );
  const validPads = padIds ? new Set(padIds) : null;
  const pads: Record<string, DensityOverride> = {};
  for (const [id, value] of Object.entries(record(raw.pads))) {
    const clean = override(value, basePattern, baseTemperature);
    if (id.trim() && clean && (!validPads || validPads.has(id))) {
      Object.defineProperty(pads, id, {
        value: clean,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  const ids = new Set<string>();
  const zones = Array.isArray(raw.zones)
    ? raw.zones.map((inputZone, index): DensityZone => {
        const zone = record(inputZone);
        const fallback = { ...DEFAULT_ZONE, name: `Density zone ${index + 1}` };
        const id =
          typeof zone.id === "string" && zone.id.trim() && !ids.has(zone.id)
            ? zone.id
            : makeDensityZone(index).id;
        ids.add(id);
        return {
          id,
          name:
            typeof zone.name === "string" && zone.name.trim()
              ? zone.name
              : fallback.name,
          enabled: typeof zone.enabled === "boolean" ? zone.enabled : true,
          shape: zone.shape === "box" ? "box" : "ellipse",
          infill: finite(
            zone.infill,
            fallback.infill,
            DENSITY_ZONE_LIMITS.infill,
          ),
          pattern: isDensityPattern(zone.pattern) ? zone.pattern : basePattern,
          temperature: printTemperature(zone.temperature, baseTemperature),
          scope: scope(zone.scope),
          position: finite(
            zone.position,
            fallback.position,
            DENSITY_ZONE_LIMITS.position,
          ),
          offset: finite(
            zone.offset,
            fallback.offset,
            DENSITY_ZONE_LIMITS.offset,
          ),
          width: finite(zone.width, fallback.width, DENSITY_ZONE_LIMITS.width),
          length: finite(
            zone.length,
            fallback.length,
            DENSITY_ZONE_LIMITS.length,
          ),
          rotation: finite(
            zone.rotation,
            fallback.rotation,
            DENSITY_ZONE_LIMITS.rotation,
          ),
        };
      })
    : [];
  return {
    baseInfill: finite(raw.baseInfill, 20, [0, 100]),
    pattern: basePattern,
    temperature: baseTemperature,
    arch: override(raw.arch, basePattern, baseTemperature),
    heel: override(raw.heel, basePattern, baseTemperature),
    pads,
    zones,
  };
}

/** Modifier volumes intersect the existing solid; they never add printed material. */
export interface DensityRegion extends DensityOverride {
  id: string;
  name: string;
  source: "arch" | "heel" | "pad" | "zone";
  /** Original editable pad/zone id, when this region belongs to one. */
  sourceId?: string;
  shape: "ellipse" | "box";
  position: number;
  offset: number;
  width: number;
  length: number;
  rotation: number;
  minZ: number;
  maxZ: number;
}

/**
 * Canonical right-foot footprints in increasing precedence. Explicit custom
 * zones come last, so an overlapping zone can tune a support's infill.
 */
export function getDensityRegions(p: InsoleParams): DensityRegion[] {
  const density = p.density ?? defaultDensity();
  // A conservative upper bound covers every support even when many overlap.
  // Modifier portions outside the insole are discarded by PrusaSlicer.
  const top =
    p.baseThickness +
    p.heelLift +
    p.archHeight +
    p.heelCupHeight +
    p.toeSpring +
    p.pads.reduce(
      (sum, pad) =>
        sum + (pad.enabled && pad.operation !== "subtract" ? pad.height : 0),
      0,
    ) +
    1;
  const regions: DensityRegion[] = [];
  const add = (
    identity: Pick<DensityRegion, "id" | "name" | "source" | "sourceId">,
    footprint: Pick<
      DensityRegion,
      "shape" | "position" | "offset" | "width" | "length" | "rotation"
    >,
    value: DensityOverride | null | undefined,
  ) => {
    if (!value) return;
    regions.push({
      ...identity,
      ...footprint,
      ...value,
      minZ: value.scope === "support" ? p.baseThickness : -0.5,
      maxZ: value.scope === "base" ? p.baseThickness : top,
    });
  };
  add(
    { id: "density-arch", name: "Arch support", source: "arch" },
    {
      shape: "ellipse",
      position: p.archPosition,
      offset: p.archOffset,
      width: p.archSpan,
      length: p.archLength,
      rotation: p.archRotation,
    },
    density.arch,
  );
  add(
    { id: "density-heel", name: "Heel", source: "heel" },
    {
      shape: "ellipse",
      position: 0.14,
      offset: 0,
      width: p.heelWidth,
      length: p.length * 0.28,
      rotation: 0,
    },
    density.heel,
  );
  for (const pad of p.pads) {
    // Cutters remove geometry. They never request a material override, even
    // when an older editing state still has a density entry for their id.
    if (pad.operation === "subtract") continue;
    add(
      {
        id: `density-pad-${pad.id}`,
        name: pad.name,
        source: "pad",
        sourceId: pad.id,
      },
      {
        shape: "ellipse",
        position: pad.position,
        offset: pad.offset,
        width: pad.width,
        length: pad.length,
        rotation: pad.rotation,
      },
      pad.enabled ? density.pads[pad.id] : null,
    );
  }
  for (const zone of density.zones) {
    if (zone.enabled)
      add(
        {
          id: `density-zone-${zone.id}`,
          name: zone.name,
          source: "zone",
          sourceId: zone.id,
        },
        {
          shape: zone.shape,
          position: zone.position,
          offset: zone.offset,
          width: zone.width,
          length: zone.length,
          rotation: zone.rotation,
        },
        {
          infill: zone.infill,
          pattern: zone.pattern,
          temperature: zone.temperature,
          scope: zone.scope,
        },
      );
  }
  return regions;
}

function regionTest(region: DensityRegion, footLength: number) {
  const angle = (region.rotation * Math.PI) / 180;
  const cosine = Math.cos(angle),
    sine = Math.sin(angle);
  const halfWidth = region.width / 2,
    halfLength = region.length / 2;
  const centerY = region.position * footLength;
  return (x: number, y: number, z: number) => {
    // The plane belongs to the base. Support changes begin above that plane.
    if (
      z > region.maxZ ||
      (region.scope === "support" ? z <= region.minZ : z < region.minZ)
    )
      return false;
    const dx = x - region.offset,
      dy = y - centerY;
    const localX = (dx * cosine + dy * sine) / halfWidth;
    const localY = (-dx * sine + dy * cosine) / halfLength;
    return region.shape === "box"
      ? Math.abs(localX) <= 1 && Math.abs(localY) <= 1
      : localX * localX + localY * localY <= 1;
  };
}

/**
 * Infill request at a material point in canonical right-foot coordinates.
 * This is a slicer-setting preview, not a compression or foam simulation.
 */
export function getDensityAt(
  p: InsoleParams,
  x: number,
  y: number,
  z: number,
): number {
  return createDensitySampler(p)(x, y, z);
}

/** Prepare once per parameter change before coloring thousands of mesh vertices. */
export function createDensitySampler(
  p: InsoleParams,
): (x: number, y: number, z: number) => number {
  const regions = getDensityRegions(p).map((region) => ({
    infill: region.infill,
    contains: regionTest(region, p.length),
  }));
  const base = p.density?.baseInfill ?? 20;
  return (x, y, z) => {
    let infill = base;
    for (const region of regions) {
      if (region.contains(x, y, z)) infill = region.infill;
    }
    return infill;
  };
}

function extrusion(
  region: DensityRegion,
  footLength: number,
  side: "left" | "right",
) {
  const footprint =
    region.shape === "ellipse"
      ? Array.from({ length: 96 }, (_, index) => {
          const angle = (index * 2 * Math.PI) / 96;
          return {
            x: (Math.cos(angle) * region.width) / 2,
            y: (Math.sin(angle) * region.length) / 2,
          };
        })
      : [
          { x: -region.width / 2, y: -region.length / 2 },
          { x: region.width / 2, y: -region.length / 2 },
          { x: region.width / 2, y: region.length / 2 },
          { x: -region.width / 2, y: region.length / 2 },
        ];
  const angle = (region.rotation * Math.PI) / 180;
  const mirror = side === "left" ? -1 : 1;
  const points = footprint.map(({ x, y }) => ({
    x: (region.offset + x * Math.cos(angle) - y * Math.sin(angle)) * mirror,
    y: region.position * footLength + x * Math.sin(angle) + y * Math.cos(angle),
  }));
  const positions: number[] = [];
  const indices: number[] = [];
  for (const z of [region.minZ, region.maxZ]) {
    for (const point of points) positions.push(point.x, point.y, z);
  }
  const count = points.length;
  const triangle = (a: number, b: number, c: number) => {
    if (side === "left") indices.push(a, c, b);
    else indices.push(a, b, c);
  };
  for (let i = 1; i < count - 1; i++) {
    triangle(0, i + 1, i);
    triangle(count, count + i, count + i + 1);
  }
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    triangle(i, next, i + count);
    triangle(next, next + count, i + count);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    units: "mm",
    side,
    modifier: true,
    densityRegion: { ...region },
  };
  return geometry;
}

export interface DensityModifier extends DensityRegion {
  geometry: BufferGeometry;
}

/** Closed PrusaSlicer modifier meshes; callers own and dispose the geometries. */
export function buildDensityModifiers(
  p: InsoleParams,
  side: "left" | "right",
): DensityModifier[] {
  return getDensityRegions(p).map((region) => ({
    ...region,
    geometry: extrusion(region, p.length, side),
  }));
}
