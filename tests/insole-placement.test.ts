import { BufferGeometry, Float32BufferAttribute } from "three";
import { describe, expect, it } from "vitest";
import {
  buildInsoleGeometry,
  cloneParams,
  DEFAULT_PARAMS,
} from "../src/insole/model";
import {
  MK4S_BED,
  planBedPlacement,
  type BedPlacement,
} from "../src/insole/placement";

function rectangle(width: number, depth: number, angleDegrees = 0) {
  const angle = (angleDegrees * Math.PI) / 180;
  const cosine = Math.cos(angle),
    sine = Math.sin(angle);
  const points = [
    [0, 0],
    [width, 0],
    [width, depth],
    [0, depth],
  ].flatMap(([x, y]) => [
    x * cosine - y * sine + 1000,
    x * sine + y * cosine - 300,
    7,
  ]);
  return new BufferGeometry().setAttribute(
    "position",
    new Float32BufferAttribute(points, 3),
  );
}

function transformedBounds(geometry: BufferGeometry, placement: BedPlacement) {
  const matrix = placement.transform3mf.split(" ").map(Number);
  const position = geometry.getAttribute("position");
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  let maxZError = 0;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      y = position.getY(i),
      z = position.getZ(i);
    const transformedX =
      x * matrix[0] + y * matrix[3] + z * matrix[6] + matrix[9];
    const transformedY =
      x * matrix[1] + y * matrix[4] + z * matrix[7] + matrix[10];
    const transformedZ =
      x * matrix[2] + y * matrix[5] + z * matrix[8] + matrix[11];
    minX = Math.min(minX, transformedX);
    maxX = Math.max(maxX, transformedX);
    minY = Math.min(minY, transformedY);
    maxY = Math.max(maxY, transformedY);
    maxZError = Math.max(maxZError, Math.abs(z - transformedZ));
  }
  expect(maxZError).toBe(0);
  return { minX, maxX, minY, maxY };
}

function checkRigidCenteredPlacement(
  geometry: BufferGeometry,
  placement: BedPlacement,
) {
  const matrix = placement.transform3mf.split(" ").map(Number);
  expect(matrix).toHaveLength(12);
  expect(matrix.every(Number.isFinite)).toBe(true);
  expect(Math.hypot(matrix[0], matrix[1])).toBeCloseTo(1, 12);
  expect(Math.hypot(matrix[3], matrix[4])).toBeCloseTo(1, 12);
  expect(matrix[0] * matrix[3] + matrix[1] * matrix[4]).toBeCloseTo(0, 12);
  expect(matrix[0] * matrix[4] - matrix[1] * matrix[3]).toBeCloseTo(1, 12);
  const bounds = transformedBounds(geometry, placement);
  expect((bounds.minX + bounds.maxX) / 2).toBeCloseTo(MK4S_BED.width / 2, 8);
  expect((bounds.minY + bounds.maxY) / 2).toBeCloseTo(MK4S_BED.depth / 2, 8);
  for (const key of ["minX", "maxX", "minY", "maxY"] as const)
    expect(bounds[key]).toBeCloseTo(placement.bounds[key], 8);
  expect(bounds.maxX - bounds.minX).toBeCloseTo(placement.size.width, 8);
  expect(bounds.maxY - bounds.minY).toBeCloseTo(placement.size.depth, 8);
  const clearance = Math.min(
    bounds.minX,
    MK4S_BED.width - bounds.maxX,
    bounds.minY,
    MK4S_BED.depth - bounds.maxY,
  );
  expect(clearance).toBeCloseTo(placement.clearance, 8);
  if (placement.fits)
    expect(clearance).toBeGreaterThanOrEqual(
      placement.requiredClearance - 1e-8,
    );
}

/** Independent dense scan against every original vertex, not the hull implementation. */
function sampledBestClearance(geometry: BufferGeometry) {
  const position = geometry.getAttribute("position");
  let best = -Infinity;
  for (let degree = 0; degree < 180; degree += 0.25) {
    const angle = (degree * Math.PI) / 180;
    const cosine = Math.cos(angle),
      sine = Math.sin(angle);
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i) * cosine - position.getY(i) * sine;
      const y = position.getX(i) * sine + position.getY(i) * cosine;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    best = Math.max(
      best,
      Math.min((250 - (maxX - minX)) / 2, (210 - (maxY - minY)) / 2),
    );
  }
  return best;
}

describe("MK4S flat bed placement", () => {
  it("fits both default feet with a centered rigid rotation and unchanged geometry", () => {
    for (const side of ["right", "left"] as const) {
      const geometry = buildInsoleGeometry(DEFAULT_PARAMS, side, 160);
      const verticesBefore = geometry.getAttribute("position").array.slice();
      const indicesBefore = geometry.getIndex()!.array.slice();
      const boxBefore = geometry.boundingBox!.clone();
      const placement = planBedPlacement(geometry);
      expect(placement.fits).toBe(true);
      expect(placement.requiredClearance).toBe(3);
      expect(placement.rotationDegrees).toBeGreaterThan(30);
      expect(placement.rotationDegrees).toBeLessThan(150);
      checkRigidCenteredPlacement(geometry, placement);
      expect(geometry.getAttribute("position").array).toEqual(verticesBefore);
      expect(geometry.getIndex()!.array).toEqual(indicesBefore);
      expect(geometry.boundingBox).toEqual(boxBefore);
      geometry.dispose();
    }
  });

  it("uses the actual tapered footprint instead of rotating its enclosing rectangle", () => {
    const geometry = buildInsoleGeometry(DEFAULT_PARAMS, "right", 48);
    const placement = planBedPlacement(geometry);
    const enclosingRectangle = rectangle(
      DEFAULT_PARAMS.width,
      DEFAULT_PARAMS.length,
    );
    expect(placement.fits).toBe(true);
    expect(planBedPlacement(enclosingRectangle).fits).toBe(false);
    expect(placement.clearance).toBeGreaterThanOrEqual(
      sampledBestClearance(geometry) - 1e-8,
    );
    geometry.dispose();
    enclosingRectangle.dispose();
  });

  it("finds a narrow angular fit without a sampling or bounding-box false negative", () => {
    const geometry = rectangle(243.98, 203.98, 13.345);
    const placement = planBedPlacement(geometry);
    expect(placement.fits).toBe(true);
    expect(placement.rotationDegrees).toBeCloseTo(180 - 13.345, 3);
    expect(placement.clearance).toBeCloseTo(3.01, 3);
    checkRigidCenteredPlacement(geometry, placement);
    geometry.dispose();
  });

  it("reports the best unscaled placement when the 3 mm margin is impossible", () => {
    for (const [width, depth] of [
      [244.1, 204],
      [400, 400],
    ]) {
      const geometry = rectangle(width, depth);
      const placement = planBedPlacement(geometry);
      expect(placement.fits).toBe(false);
      expect(placement.clearance).toBeLessThan(3);
      expect(placement.clearance).toBeGreaterThanOrEqual(
        sampledBestClearance(geometry) - 1e-8,
      );
      checkRigidCenteredPlacement(geometry, placement);
      geometry.dispose();
    }
  });

  it("allows an explicit tighter edge margin without scaling or changing the best orientation", () => {
    const geometry = rectangle(244.1, 204);
    const standard = planBedPlacement(geometry);
    const tight = planBedPlacement(geometry, 0);
    expect(standard.fits).toBe(false);
    expect(tight.fits).toBe(true);
    expect(tight.requiredClearance).toBe(0);
    expect(tight.transform3mf).toBe(standard.transform3mf);
    expect(tight.clearance).toBe(standard.clearance);
    checkRigidCenteredPlacement(geometry, tight);
    for (const margin of [-1, 10.01, NaN, Infinity])
      expect(() => planBedPlacement(geometry, margin)).toThrow(/clearance/);
    geometry.dispose();
  });

  it("handles small, long narrow, wide and oversized insole designs on either foot", () => {
    const variants = [
      { length: 100, width: 40 },
      { length: 310, width: 40 },
      { length: 285, width: 125 },
      { length: 420, width: 180 },
    ];
    for (const variant of variants) {
      for (const side of ["left", "right"] as const) {
        const geometry = buildInsoleGeometry(
          { ...cloneParams(DEFAULT_PARAMS), ...variant },
          side,
          24,
        );
        const placement = planBedPlacement(geometry);
        checkRigidCenteredPlacement(geometry, placement);
        expect(placement.clearance).toBeGreaterThanOrEqual(
          sampledBestClearance(geometry) - 1e-8,
        );
        if (variant.length <= 100 || variant.width === 40)
          expect(placement.fits).toBe(true);
        if (variant.length === 420) expect(placement.fits).toBe(false);
        if (variant.length === 285) {
          expect(placement.fits).toBe(false);
          const tight = planBedPlacement(geometry, 0);
          expect(tight.fits).toBe(true);
          expect(tight.transform3mf).toBe(placement.transform3mf);
          checkRigidCenteredPlacement(geometry, tight);
        }
        geometry.dispose();
      }
    }
  });

  it("handles duplicate, collinear and point footprints deterministically", () => {
    for (const points of [
      [4, 5, 2, 4, 5, 2],
      [0, 0, 0, 0, 100, 0, 0, 50, 5],
    ]) {
      const geometry = new BufferGeometry().setAttribute(
        "position",
        new Float32BufferAttribute(points, 3),
      );
      const placement = planBedPlacement(geometry);
      expect(placement.fits).toBe(true);
      expect(planBedPlacement(geometry)).toEqual(placement);
      checkRigidCenteredPlacement(geometry, placement);
      geometry.dispose();
    }
  });

  it("rejects empty or non-finite geometry instead of serializing an invalid transform", () => {
    expect(() => planBedPlacement(new BufferGeometry())).toThrow(/vertices/);
    for (const points of [[], [NaN, 0, 0], [0, Infinity, 0], [0, 0, NaN]]) {
      const geometry = new BufferGeometry().setAttribute(
        "position",
        new Float32BufferAttribute(points, 3),
      );
      expect(() => planBedPlacement(geometry)).toThrow();
      geometry.dispose();
    }
  });
});
