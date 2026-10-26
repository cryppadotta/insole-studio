import type { BufferGeometry } from "three";

/** Millimetres. The margin applies to the model; slicer skirts/brims need extra room. */
export const MK4S_BED = {
  width: 250,
  depth: 210,
  height: 220,
  requiredClearance: 3,
} as const;

export type PlacementMode = "mk4s" | "original";

export interface BedPlacement {
  rotationDegrees: number;
  translation: { x: number; y: number };
  size: { width: number; depth: number };
  /** Bounds after rotation and translation, in printer coordinates. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Minimum distance from the printable footprint to any XY bed edge. */
  clearance: number;
  fits: boolean;
  requiredClearance: number;
  /** 3MF row-vector affine transform: rotation and XY translation only. */
  transform3mf: string;
}

type Point = readonly [number, number];
type Extents = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  // Fixed support-point differences describe each extent between hull events.
  widthVector: Point;
  depthVector: Point;
};

const PI = Math.PI;
const TWO_PI = PI * 2;
const ANGLE_EPSILON = 1e-12;
const DISTANCE_EPSILON = 1e-9;

function modulo(value: number, period: number) {
  return ((value % period) + period) % period;
}

function cross(a: Point, b: Point, c: Point) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function footprintHull(geometry: BufferGeometry): Point[] {
  const positions = geometry.getAttribute("position");
  if (!positions || positions.itemSize < 3 || positions.count === 0)
    throw new Error("Cannot place geometry without printable vertices");
  const points: Point[] = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    if (![x, y, positions.getZ(i)].every(Number.isFinite))
      throw new Error("Cannot place non-finite geometry");
    points.push([x, y]);
  }
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const unique = points.filter(
    (point, i) =>
      i === 0 || point[0] !== points[i - 1][0] || point[1] !== points[i - 1][1],
  );
  if (unique.length <= 2) return unique;
  const lower: Point[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0)
      lower.pop();
    lower.push(point);
  }
  const upper: Point[] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const point = unique[i];
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0)
      upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function extentsAt(hull: Point[], angle: number): Extents {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  let left = hull[0],
    right = hull[0],
    bottom = hull[0],
    top = hull[0];
  for (const point of hull) {
    const x = point[0] * cosine - point[1] * sine;
    const y = point[0] * sine + point[1] * cosine;
    if (x < minX) {
      minX = x;
      left = point;
    }
    if (x > maxX) {
      maxX = x;
      right = point;
    }
    if (y < minY) {
      minY = y;
      bottom = point;
    }
    if (y > maxY) {
      maxY = y;
      top = point;
    }
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    widthVector: [right[0] - left[0], right[1] - left[1]],
    depthVector: [top[0] - bottom[0], top[1] - bottom[1]],
  };
}

function clearanceOf(extents: Extents) {
  return Math.min(
    (MK4S_BED.width - (extents.maxX - extents.minX)) / 2,
    (MK4S_BED.depth - (extents.maxY - extents.minY)) / 2,
  );
}

/**
 * Find the rigid, flat orientation with the greatest minimum XY edge clearance.
 *
 * Only the printable geometry belongs here: density modifier volumes may extend
 * outside the part and must not affect its bed fit. The convex hull preserves
 * every rotated footprint bound without approximating the insole as a rectangle.
 * Between hull-edge events, width and depth are sinusoids with fixed support
 * points. Their extrema and crossings, plus interval boundaries, include every
 * possible optimum. This avoids missing a very narrow fitting angular interval.
 * The input geometry and all Z coordinates remain unchanged, even if no fit exists.
 */
export function planBedPlacement(
  geometry: BufferGeometry,
  requiredClearance: number = MK4S_BED.requiredClearance,
): BedPlacement {
  if (
    !Number.isFinite(requiredClearance) ||
    requiredClearance < 0 ||
    requiredClearance > 10
  )
    throw new Error("Bed edge clearance must be between 0 and 10 mm");
  const hull = footprintHull(geometry);
  const events = [0, PI];
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i],
      b = hull[(i + 1) % hull.length];
    if (a[0] === b[0] && a[1] === b[1]) continue;
    const direction = Math.atan2(b[1] - a[1], b[0] - a[0]);
    events.push(modulo(-direction, PI), modulo(PI / 2 - direction, PI));
  }
  events.sort((a, b) => a - b);
  const boundaries = events.filter(
    (angle, i) => i === 0 || angle - events[i - 1] > ANGLE_EPSILON,
  );
  let bestAngle = 0;
  let bestExtents = extentsAt(hull, bestAngle);
  let bestClearance = clearanceOf(bestExtents);
  const consider = (angle: number) => {
    const extents = extentsAt(hull, angle);
    const clearance = clearanceOf(extents);
    if (
      clearance > bestClearance + DISTANCE_EPSILON ||
      (Math.abs(clearance - bestClearance) <= DISTANCE_EPSILON &&
        angle < bestAngle)
    ) {
      bestAngle = angle;
      bestExtents = extents;
      bestClearance = clearance;
    }
  };
  for (const boundary of boundaries) consider(boundary);
  for (let i = 1; i < boundaries.length; i++) {
    const start = boundaries[i - 1],
      end = boundaries[i];
    const { widthVector: w, depthVector: d } = extentsAt(
      hull,
      (start + end) / 2,
    );
    const considerInside = (angle: number) => {
      if (angle > start && angle < end) consider(angle);
    };
    // Stationary width/depth candidates; each derivative has period pi.
    considerInside(modulo(Math.atan2(-w[1], w[0]), PI));
    considerInside(modulo(Math.atan2(d[0], d[1]), PI));
    // Equal XY margins: width - depth = bed width - bed depth.
    const a = w[0] - d[1],
      b = -w[1] - d[0];
    const radius = Math.hypot(a, b);
    const target = MK4S_BED.width - MK4S_BED.depth;
    if (radius >= target) {
      const phase = Math.atan2(b, a);
      const offset = Math.acos(target / radius);
      considerInside(modulo(phase + offset, TWO_PI));
      considerInside(modulo(phase - offset, TWO_PI));
    }
  }
  const width = bestExtents.maxX - bestExtents.minX;
  const depth = bestExtents.maxY - bestExtents.minY;
  const translation = {
    x: MK4S_BED.width / 2 - (bestExtents.minX + bestExtents.maxX) / 2,
    y: MK4S_BED.depth / 2 - (bestExtents.minY + bestExtents.maxY) / 2,
  };
  const clean = (value: number) => (Math.abs(value) < 1e-14 ? 0 : value);
  const cosine = clean(Math.cos(bestAngle)),
    sine = clean(Math.sin(bestAngle));
  return {
    rotationDegrees: (bestAngle * 180) / PI,
    translation,
    size: { width, depth },
    bounds: {
      minX: bestExtents.minX + translation.x,
      maxX: bestExtents.maxX + translation.x,
      minY: bestExtents.minY + translation.y,
      maxY: bestExtents.maxY + translation.y,
    },
    clearance: bestClearance,
    fits: bestClearance >= requiredClearance - DISTANCE_EPSILON,
    requiredClearance,
    transform3mf: [
      cosine,
      sine,
      0,
      -sine,
      cosine,
      0,
      0,
      0,
      1,
      translation.x,
      translation.y,
      0,
    ]
      .map(clean)
      .join(" "),
  };
}
