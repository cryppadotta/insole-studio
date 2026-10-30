import { BufferGeometry, Float32BufferAttribute } from "three";
import {
  clampDensity,
  cloneDensity,
  defaultDensity,
  type DensityConfig,
} from "./density";

/** All dimensions are millimetres; longitudinal positions are heel-to-toe fractions. */
export interface MetPad {
  id: string;
  name: string;
  enabled: boolean;
  /** Missing on older projects means add; subtract makes a local relief cut. */
  operation?: "add" | "subtract";
  /** Support height or, for subtraction, depth below the completed top surface. */
  height: number;
  position: number;
  /** Canonical right-foot x coordinate: negative is medial. */
  offset: number;
  width: number;
  length: number;
  /** Counterclockwise rotation in the model's XY plane, in degrees. */
  rotation: number;
  /** Fraction of the elliptical radius occupied by the flat central plateau. */
  plateau: number;
  curve1: number;
  curve2: number;
}

export interface InsoleParams {
  length: number;
  width: number;
  heelWidth: number;
  archWidth: number;
  toeShape: number;
  baseThickness: number;
  archHeight: number;
  archPosition: number;
  archLength: number;
  archSpan: number;
  /** Canonical right-foot x coordinate: negative is medial. */
  archOffset: number;
  archRotation: number;
  archPlateau: number;
  archCurve1: number;
  archCurve2: number;
  heelCupHeight: number;
  /** Added heel-seat thickness, tapering smoothly into the midfoot. */
  heelLift: number;
  toeSpring: number;
  pads: MetPad[];
  density: DensityConfig;
}

export type NumericParamKey = Exclude<keyof InsoleParams, "pads" | "density">;
export type NumericPadKey = Exclude<
  keyof MetPad,
  "id" | "name" | "enabled" | "operation"
>;

/** A relief may thin the base, but always leaves a closed printable floor. */
export const MIN_INSOLE_THICKNESS = 0.8;

export const NUMERIC_PARAM_KEYS: readonly NumericParamKey[] = [
  "length",
  "width",
  "heelWidth",
  "archWidth",
  "toeShape",
  "baseThickness",
  "archHeight",
  "archPosition",
  "archLength",
  "archSpan",
  "archOffset",
  "archRotation",
  "archPlateau",
  "archCurve1",
  "archCurve2",
  "heelCupHeight",
  "heelLift",
  "toeSpring",
];

const DEFAULT_PAD: Omit<MetPad, "id" | "name"> = {
  enabled: true,
  operation: "add",
  height: 3,
  position: 0.66,
  offset: -3,
  width: 46,
  length: 58,
  rotation: 0,
  plateau: 0.3,
  curve1: 0.9,
  curve2: 0.35,
};

let padSequence = 0;

/** A new editable support with a unique identity, independent of other pads. */
export function makePad(index = 0): MetPad {
  const ordinal = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  const id =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `met-pad-${Date.now().toString(36)}-${++padSequence}`;
  return { ...DEFAULT_PAD, id, name: `Met pad ${ordinal + 1}` };
}

/** A movable relief using the same smooth footprint and slope controls. */
export function makeNegativePad(index = 0): MetPad {
  const ordinal = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  return {
    ...makePad(ordinal),
    name: `Negative pad ${ordinal + 1}`,
    operation: "subtract",
    height: 2,
  };
}

export const DEFAULT_PARAMS: InsoleParams = {
  length: 270,
  width: 98,
  heelWidth: 64,
  archWidth: 60,
  toeShape: 0.45,
  baseThickness: 3,
  archHeight: 12,
  archPosition: 0.43,
  archLength: 145,
  archSpan: 65,
  archOffset: -22,
  archRotation: 0,
  archPlateau: 0.12,
  archCurve1: 0.9,
  archCurve2: 0.35,
  heelCupHeight: 8,
  heelLift: 0,
  toeSpring: 2,
  pads: [{ ...DEFAULT_PAD, id: "met-pad-1", name: "Met pad 1" }],
  density: defaultDensity(),
};

export const PARAM_LIMITS: Record<NumericParamKey, readonly [number, number]> =
  {
    length: [100, 420],
    width: [40, 180],
    heelWidth: [20, 150],
    archWidth: [15, 170],
    toeShape: [0, 1],
    baseThickness: [MIN_INSOLE_THICKNESS, 20],
    archHeight: [0, 70],
    archPosition: [0.05, 0.95],
    archLength: [20, 350],
    archSpan: [10, 180],
    archOffset: [-100, 100],
    archRotation: [-180, 180],
    archPlateau: [0, 0.9],
    archCurve1: [0, 1],
    archCurve2: [0, 1],
    heelCupHeight: [0, 50],
    heelLift: [0, 40],
    toeSpring: [0, 40],
  };

export const PAD_LIMITS: Record<NumericPadKey, readonly [number, number]> = {
  height: [0, 45],
  position: [0, 1],
  offset: [-100, 100],
  width: [8, 180],
  length: [8, 240],
  rotation: [-180, 180],
  plateau: [0, 0.9],
  curve1: [0, 1],
  curve2: [0, 1],
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Clone mutable supports as well as the surrounding parameter object. */
export function cloneParams(params: InsoleParams): InsoleParams {
  return {
    ...params,
    pads: params.pads.map((pad) => ({ ...pad })),
    density: cloneDensity(params.density),
  };
}

/** Make imported drafts and direct numeric edits safe before meshing. */
export function clampParams(input: Partial<InsoleParams>): InsoleParams {
  const result = cloneParams(DEFAULT_PARAMS);
  for (const key of NUMERIC_PARAM_KEYS) {
    const value = input[key];
    const [min, max] = PARAM_LIMITS[key];
    result[key] = clamp(
      typeof value === "number" && Number.isFinite(value)
        ? value
        : DEFAULT_PARAMS[key],
      min,
      max,
    );
  }
  result.heelWidth = Math.min(result.heelWidth, result.width * 0.94);
  result.archWidth = Math.min(result.archWidth, result.width * 0.96);
  if (Array.isArray(input.pads)) {
    const ids = new Set<string>();
    result.pads = input.pads.map((value, index) => {
      const raw = value && typeof value === "object" ? value : {};
      const supplied = raw as Partial<MetPad>;
      const fallback = { ...DEFAULT_PAD, id: "", name: `Met pad ${index + 1}` };
      const id =
        typeof supplied.id === "string" &&
        supplied.id.trim() &&
        !ids.has(supplied.id)
          ? supplied.id
          : makePad(index).id;
      ids.add(id);
      const pad: MetPad = {
        ...fallback,
        id,
        name:
          typeof supplied.name === "string" && supplied.name.trim()
            ? supplied.name
            : fallback.name,
        enabled:
          typeof supplied.enabled === "boolean" ? supplied.enabled : true,
        operation: supplied.operation === "subtract" ? "subtract" : "add",
      };
      for (const key of Object.keys(PAD_LIMITS) as NumericPadKey[]) {
        const value = supplied[key];
        const [min, max] = PAD_LIMITS[key];
        pad[key] = clamp(
          typeof value === "number" && Number.isFinite(value)
            ? value
            : fallback[key],
          min,
          max,
        );
      }
      return pad;
    });
  }
  result.density = clampDensity(
    input.density,
    result.pads
      .filter((pad) => pad.operation !== "subtract")
      .map((pad) => pad.id),
  );
  return result;
}

/**
 * A broad, editable C2 support cross-section. The Bézier control heights shape
 * the shoulder and the outside slope; the plateau keeps the center from peaking.
 */
export function supportProfile(
  radius: number,
  plateau: number,
  curve1: number,
  curve2: number,
): number {
  if (!Number.isFinite(radius)) return 0;
  const flat = clamp(Number.isFinite(plateau) ? plateau : 0, 0, 0.9);
  if (radius <= flat) return 1;
  if (radius >= 1) return 0;
  const t = (radius - flat) / (1 - flat);
  // Quintic easing guarantees a flat tangent and curvature at both boundaries,
  // even when a user moves the Bézier controls to their most extreme settings.
  const u = t * t * t * (10 - 15 * t + 6 * t * t);
  const v = 1 - u;
  const c1 = clamp(Number.isFinite(curve1) ? curve1 : 0.9, 0, 1);
  const c2 = clamp(Number.isFinite(curve2) ? curve2 : 0.35, 0, 1);
  return clamp(v * v * v + 3 * v * v * u * c1 + 3 * v * u * u * c2, 0, 1);
}

function supportRadius(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  width: number,
  length: number,
  rotation: number,
) {
  const angle = (rotation * Math.PI) / 180;
  const cosine = Math.cos(angle),
    sine = Math.sin(angle);
  const dx = x - centerX,
    dy = y - centerY;
  const localX = dx * cosine + dy * sine;
  const localY = -dx * sine + dy * cosine;
  return Math.hypot(localX / (width / 2), localY / (length / 2));
}

function smoothstep(start: number, end: number, value: number) {
  const u = clamp((value - start) / (end - start), 0, 1);
  return u * u * (3 - 2 * u);
}

function mix(a: number, b: number, u: number) {
  return a + (b - a) * u;
}

function profile(p: InsoleParams, value: number) {
  const t = clamp(Number.isFinite(value) ? value : 0, 0, 1);
  let span: number;
  if (t < 0.14) {
    // Elliptical heel, with a horizontal tangent at its widest station.
    span = p.heelWidth * Math.sqrt(Math.max(0, 1 - ((t - 0.14) / 0.14) ** 2));
  } else if (t < 0.43) {
    span = mix(p.heelWidth, p.archWidth, smoothstep(0.14, 0.43, t));
  } else if (t < 0.72) {
    span = mix(p.archWidth, p.width, smoothstep(0.43, 0.72, t));
  } else {
    // A changing exponent rounds or broadens the toe without an angular tip.
    const toe = (t - 0.72) / 0.28;
    span =
      p.width * Math.sqrt(Math.max(0, 1 - toe ** (1.7 + p.toeShape * 2.1)));
  }
  // Move the arch laterally and the toe medially. Keeping the center inside
  // the unused width guarantees that `width` remains the maximum envelope.
  const bias =
    0.52 * Math.exp(-1 * ((t - 0.43) / 0.19) ** 2) * smoothstep(0, 0.2, t) -
    0.38 * smoothstep(0.67, 1, t);
  const center = ((p.width - span) / 2) * bias;
  return { left: center - span / 2, right: center + span / 2 };
}

/** Right-foot x extents at t = 0 (heel) through t = 1 (toe). */
export function outlineAt(p: InsoleParams, t: number) {
  return profile(clampParams(p), t);
}

/** A closed perimeter without a repeated end vertex, counterclockwise in XY. */
export function outlinePoints(
  params: InsoleParams,
  side: "left" | "right" = "right",
  samples = 100,
): { x: number; y: number }[] {
  const p = clampParams(params);
  const count = clamp(
    Math.round(Number.isFinite(samples) ? samples : 100),
    12,
    500,
  );
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= count; i++) {
    const t = (1 - Math.cos((Math.PI * i) / count)) / 2;
    points.push({ x: profile(p, t).right, y: t * p.length });
  }
  for (let i = count - 1; i > 0; i--) {
    const t = (1 - Math.cos((Math.PI * i) / count)) / 2;
    points.push({ x: profile(p, t).left, y: t * p.length });
  }
  if (side === "left")
    return points.map(({ x, y }) => ({ x: -x, y })).reverse();
  return points;
}

function height(p: InsoleParams, x: number, y: number) {
  const t = clamp(y / p.length, 0, 1);
  const edge = profile(p, t);
  const halfWidth = (edge.right - edge.left) / 2;
  const center = (edge.right + edge.left) / 2;
  const u = halfWidth > 1e-8 ? clamp((x - center) / halfWidth, -1, 1) : 0;
  const arch =
    p.archHeight *
    supportProfile(
      supportRadius(
        x,
        y,
        p.archOffset,
        p.archPosition * p.length,
        p.archSpan,
        p.archLength,
        p.archRotation,
      ),
      p.archPlateau,
      p.archCurve1,
      p.archCurve2,
    );
  const rearRim = Math.exp(-1 * ((t - 0.012) / 0.065) ** 2);
  const sideRim =
    Math.exp(-1 * ((1 - Math.abs(u)) / 0.2) ** 2) *
    Math.exp(-1 * ((t - 0.14) / 0.145) ** 4);
  const cup = p.heelCupHeight * (1 - (1 - rearRim) * (1 - sideRim));
  // Arch and pads share a height datum above the structural base. Take their
  // upper envelope so intersections and duplicate pads never stack height.
  let support = arch;
  let cutDepth = 0;
  for (const pad of p.pads) {
    if (!pad.enabled) continue;
    const contribution =
      pad.height *
      supportProfile(
        supportRadius(
          x,
          y,
          pad.offset,
          pad.position * p.length,
          pad.width,
          pad.length,
          pad.rotation,
        ),
        pad.plateau,
        pad.curve1,
        pad.curve2,
      );
    if (pad.operation === "subtract")
      cutDepth = Math.max(cutDepth, contribution);
    else support = Math.max(support, contribution);
  }
  const toe = p.toeSpring * smoothstep(0.72, 1, t) ** 2;
  // Raise the whole heel seat through 15% of the foot length. Cubic smoothstep
  // tapers this added thickness to zero at 60%, with zero slope at both joins.
  // The bottom remains on the print bed; the heel cup rim is added separately.
  const heelLift = p.heelLift * (1 - smoothstep(0.15, 0.6, t));
  // Reliefs cut the completed surface, including structural lifts and supports.
  // Their deepest envelope avoids stacking cuts when relief footprints overlap.
  return Math.max(
    MIN_INSOLE_THICKNESS,
    p.baseThickness + cup + support + toe + heelLift - cutDepth,
  );
}

/** Top z in mm in canonical right-foot coordinates; mirror x for the left. */
export function surfaceHeight(p: InsoleParams, x: number, y: number) {
  const params = clampParams(p);
  return height(params, Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0);
}

/**
 * Closed solid with a flat print bed at z=0. Endpoint fans use one vertex each,
 * avoiding the collapsed quads and duplicate tip vertices common in strip meshes.
 */
export function buildInsoleGeometry(
  params: InsoleParams,
  side: "left" | "right",
  resolution = 128,
): BufferGeometry {
  const p = clampParams(params);
  const requestedRows = clamp(
    Math.round(Number.isFinite(resolution) ? resolution : 128),
    24,
    192,
  );
  // Small supports must survive both preview and export. Keep the usual mesh
  // for ordinary dimensions; refine only when a support is smaller than its
  // grid spacing. Six intervals across the smallest footprint also resolve a
  // broad plateau between grid vertices. Cosine-spaced rows have their largest
  // longitudinal gap at the middle: length * pi / (2 * row count).
  const footprints = p.pads
    .filter((pad) => pad.enabled && pad.height > 0)
    .map((pad) => Math.min(pad.width, pad.length));
  if (p.archHeight > 0) footprints.push(Math.min(p.archSpan, p.archLength));
  const pitch = footprints.length ? Math.min(...footprints) / 6 : Infinity;
  const rows = Math.min(
    512,
    Math.max(requestedRows, Math.ceil((p.length * Math.PI) / (2 * pitch))),
  );
  const columns = Math.min(
    256,
    Math.max(
      8,
      Math.round(requestedRows / 8) * 2,
      Math.ceil(p.width / pitch / 2) * 2,
    ),
  );
  const positions: number[] = [];
  const indices: number[] = [];
  const topRows: number[][] = [];
  const mirror = side === "left" ? -1 : 1;
  let minimumThickness = Infinity;
  const addTop = (x: number, y: number) => {
    const z = height(p, x, y);
    minimumThickness = Math.min(minimumThickness, z);
    const index = positions.length / 3;
    positions.push(x * mirror, y, z);
    return index;
  };
  const heel = addTop(profile(p, 0).left, 0);
  for (let row = 1; row < rows; row++) {
    const t = (1 - Math.cos((Math.PI * row) / rows)) / 2;
    const edge = profile(p, t);
    const ring: number[] = [];
    for (let col = 0; col <= columns; col++) {
      ring.push(
        addTop(mix(edge.left, edge.right, col / columns), t * p.length),
      );
    }
    topRows.push(ring);
  }
  const toe = addTop(profile(p, 1).left, p.length);
  const topCount = positions.length / 3;
  for (let i = 0; i < topCount; i++) {
    positions.push(positions[i * 3], positions[i * 3 + 1], 0);
  }
  const triangle = (a: number, b: number, c: number) => {
    if (side === "left") indices.push(a, c, b);
    else indices.push(a, b, c);
  };
  const face = (a: number, b: number, c: number) => {
    triangle(a, b, c);
    triangle(c + topCount, b + topCount, a + topCount);
  };
  const first = topRows[0];
  const last = topRows[topRows.length - 1];
  for (let col = 0; col < columns; col++) {
    face(heel, first[col + 1], first[col]);
    face(last[col], last[col + 1], toe);
  }
  for (let row = 0; row < topRows.length - 1; row++) {
    const a = topRows[row];
    const b = topRows[row + 1];
    for (let col = 0; col < columns; col++) {
      face(a[col], a[col + 1], b[col]);
      face(a[col + 1], b[col + 1], b[col]);
    }
  }
  const perimeter = [
    heel,
    ...topRows.map((ring) => ring[columns]),
    toe,
    ...topRows.map((ring) => ring[0]).reverse(),
  ];
  for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i];
    const b = perimeter[(i + 1) % perimeter.length];
    triangle(a, a + topCount, b);
    triangle(b, a + topCount, b + topCount);
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
    params: p,
    minThickness: minimumThickness,
    sampleRows: rows,
    sampleColumns: columns,
  };
  return geometry;
}

export function geometryStats(geometry: BufferGeometry) {
  const positions = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const count = index ? index.count : positions.count;
  let volume = 0;
  for (let i = 0; i < count; i += 3) {
    const a = index ? index.getX(i) : i;
    const b = index ? index.getX(i + 1) : i + 1;
    const c = index ? index.getX(i + 2) : i + 2;
    volume +=
      positions.getX(a) *
        (positions.getY(b) * positions.getZ(c) -
          positions.getZ(b) * positions.getY(c)) +
      positions.getY(a) *
        (positions.getZ(b) * positions.getX(c) -
          positions.getX(b) * positions.getZ(c)) +
      positions.getZ(a) *
        (positions.getX(b) * positions.getY(c) -
          positions.getY(b) * positions.getX(c));
  }
  return {
    volumeCm3: Math.abs(volume / 6) / 1000,
    triangles: count / 3,
    minThickness: Number(geometry.userData.minThickness ?? 0),
  };
}

/** Binary STL coordinates are millimetres. STL itself has no embedded unit field. */
export function binarySTL(geometry: BufferGeometry): ArrayBuffer {
  const positions = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const triangles = (index ? index.count : positions.count) / 3;
  const buffer = new ArrayBuffer(84 + triangles * 50);
  const view = new DataView(buffer);
  const header = "SOLE | parametric insole | coordinates in millimetres";
  for (let i = 0; i < header.length; i++)
    view.setUint8(i, header.charCodeAt(i));
  view.setUint32(80, triangles, true);
  let offset = 84;
  for (let i = 0; i < triangles; i++) {
    const points = [0, 1, 2].map((n) => {
      const vertex = index ? index.getX(i * 3 + n) : i * 3 + n;
      return [
        positions.getX(vertex),
        positions.getY(vertex),
        positions.getZ(vertex),
      ];
    });
    const [a, b, c] = points;
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const magnitude = Math.hypot(...normal) || 1;
    for (const value of normal) {
      view.setFloat32(offset, value / magnitude, true);
      offset += 4;
    }
    for (const point of points) {
      for (const value of point) {
        view.setFloat32(offset, value, true);
        offset += 4;
      }
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return buffer;
}
