import { describe, expect, it } from "vitest";
import {
  buildInsoleGeometry,
  clampParams,
  DEFAULT_PARAMS,
  geometryStats,
  makeNegativePad,
  makePad,
  MIN_INSOLE_THICKNESS,
  outlineAt,
  supportProfile,
  surfaceHeight,
  type InsoleParams,
} from "../src/insole/model";

function flatBase(): InsoleParams {
  return clampParams({
    baseThickness: 6,
    archHeight: 0,
    heelCupHeight: 0,
    heelLift: 0,
    toeSpring: 0,
    pads: [],
  });
}

function sampleFoot(p: InsoleParams) {
  const points: [number, number][] = [];
  for (let row = 0; row <= 24; row++) {
    const t = row / 24;
    const edge = outlineAt(p, t);
    for (let col = 0; col <= 8; col++) {
      points.push([
        edge.left + ((edge.right - edge.left) * col) / 8,
        t * p.length,
      ]);
    }
  }
  return points;
}

describe("negative shaping pads", () => {
  it("makes independent reliefs and normalizes legacy or invalid operations", () => {
    const cut = makeNegativePad(1);
    expect(cut).toMatchObject({
      operation: "subtract",
      name: "Negative pad 2",
      height: 2,
      width: 46,
      length: 58,
    });
    expect(makeNegativePad().id).not.toBe(cut.id);
    const legacy = { ...makePad(), operation: undefined };
    const invalid = { ...makePad(1), operation: "invalid" as "add" };
    const p = clampParams({ pads: [legacy, invalid, { ...cut, height: -20 }] });
    expect(p.pads.map((pad) => pad.operation)).toEqual([
      "add",
      "add",
      "subtract",
    ]);
    expect(p.pads[2].height).toBe(0);
  });

  it("cuts the specified depth from the finished surface and follows the editable slope", () => {
    const p = clampParams({
      baseThickness: 4,
      archHeight: 8,
      heelLift: 6,
      heelCupHeight: 8,
      archPosition: 0.4,
      archOffset: -12,
      pads: [{ ...makePad(), height: 10, position: 0.4, offset: -12 }],
    });
    const cut = {
      ...makeNegativePad(),
      position: 0.4,
      offset: -12,
      height: 2,
      width: 40,
      rotation: 0,
    };
    const shaped = { ...p, pads: [...p.pads, cut] };
    const y = cut.position * p.length;
    expect(surfaceHeight(shaped, cut.offset, y)).toBeCloseTo(
      surfaceHeight(p, cut.offset, y) - 2,
      10,
    );
    const x = cut.offset + 12;
    expect(surfaceHeight(p, x, y) - surfaceHeight(shaped, x, y)).toBeCloseTo(
      cut.height * supportProfile(0.6, cut.plateau, cut.curve1, cut.curve2),
      10,
    );
    expect(surfaceHeight(shaped, cut.offset + 25, y)).toBe(
      surfaceHeight(p, cut.offset + 25, y),
    );
  });

  it("leaves a 0.8 mm structural floor even for cuts deeper than the base", () => {
    const p = flatBase();
    const cut = {
      ...makeNegativePad(),
      position: 0.5,
      offset: 0,
      height: 45,
      width: 180,
      length: 240,
      plateau: 0.9,
    };
    const shaped = { ...p, pads: [cut] };
    expect(surfaceHeight(shaped, 0, p.length / 2)).toBe(MIN_INSOLE_THICKNESS);
    for (const [x, y] of sampleFoot(shaped)) {
      expect(surfaceHeight(shaped, x, y)).toBeGreaterThanOrEqual(
        MIN_INSOLE_THICKNESS,
      );
    }
  });

  it("never adds material, ignores disabled cuts, and uses the deepest overlap without stacking", () => {
    const first = {
      ...makeNegativePad(),
      position: 0.43,
      offset: -18,
      height: 4,
      width: 80,
      length: 110,
      rotation: 25,
    };
    const second = {
      ...makeNegativePad(1),
      position: 0.5,
      offset: 8,
      height: 2,
      width: 50,
      length: 100,
      rotation: -20,
    };
    const p = clampParams(DEFAULT_PARAMS);
    const a = { ...p, pads: [...p.pads, first] };
    const b = { ...p, pads: [...p.pads, second] };
    const combined = { ...p, pads: [...p.pads, first, second] };
    const variants = [
      { ...combined, pads: [...combined.pads].reverse() },
      {
        ...combined,
        pads: [...combined.pads, { ...first, id: "duplicate-cut" }],
      },
    ];
    const inactive = {
      ...p,
      pads: [...p.pads, { ...first, enabled: false }, { ...second, height: 0 }],
    };
    let changedSamples = 0;
    for (const [x, y] of sampleFoot(p)) {
      const original = surfaceHeight(p, x, y);
      const actual = surfaceHeight(combined, x, y);
      expect(actual).toBeLessThanOrEqual(original);
      expect(actual).toBe(
        Math.min(surfaceHeight(a, x, y), surfaceHeight(b, x, y)),
      );
      for (const variant of variants) {
        expect(surfaceHeight(variant, x, y)).toBe(actual);
      }
      expect(surfaceHeight(inactive, x, y)).toBe(original);
      if (actual < original - 0.01) changedSamples++;
    }
    expect(changedSamples).toBeGreaterThan(20);
  });

  it("moves and rotates the relief footprint in the same XY coordinates as positive pads", () => {
    const p = flatBase();
    const cut = {
      ...makeNegativePad(),
      position: 0.6,
      offset: 7,
      height: 3,
      width: 12,
      length: 72,
      rotation: 0,
    };
    const unrotated = { ...p, pads: [cut] };
    const rotated = { ...p, pads: [{ ...cut, rotation: 90 }] };
    const y = cut.position * p.length;
    expect(surfaceHeight(unrotated, cut.offset, y)).toBe(3);
    expect(surfaceHeight(unrotated, cut.offset + 20, y)).toBe(6);
    expect(surfaceHeight(rotated, cut.offset + 20, y)).toBeLessThan(6);
    expect(surfaceHeight(unrotated, cut.offset, y + 20)).toBeLessThan(6);
    expect(surfaceHeight(rotated, cut.offset, y + 20)).toBe(6);
    const moved = { ...p, pads: [{ ...cut, offset: -20, position: 0.3 }] };
    expect(surfaceHeight(moved, -20, p.length * 0.3)).toBe(3);
    expect(surfaceHeight(moved, cut.offset, y)).toBe(6);
  });

  it("keeps old positive pads identical to explicit additive pads", () => {
    const legacy = {
      ...DEFAULT_PARAMS,
      pads: DEFAULT_PARAMS.pads.map((pad) => ({
        ...pad,
        operation: undefined,
      })),
    };
    const explicit = {
      ...legacy,
      pads: legacy.pads.map((pad) => ({ ...pad, operation: "add" as const })),
    };
    for (const [x, y] of sampleFoot(legacy)) {
      expect(surfaceHeight(legacy, x, y)).toBe(surfaceHeight(explicit, x, y));
    }
    const a = buildInsoleGeometry(legacy, "right", 32);
    const b = buildInsoleGeometry(explicit, "right", 32);
    expect(a.getAttribute("position").array).toEqual(
      b.getAttribute("position").array,
    );
    expect(a.getIndex()!.array).toEqual(b.getIndex()!.array);
    a.dispose();
    b.dispose();
  });

  it("refines the mesh for a small negative footprint", () => {
    const p = flatBase();
    const geometry = buildInsoleGeometry(
      {
        ...p,
        pads: [{ ...makeNegativePad(), width: 8, length: 12 }],
      },
      "right",
      24,
    );
    expect(geometry.userData.sampleRows).toBeGreaterThan(24);
    expect(geometry.userData.sampleColumns).toBeGreaterThan(8);
    geometry.dispose();
  });

  it("keeps mirrored, watertight solids with a flat bottom through deep reliefs", () => {
    const p = clampParams({
      ...DEFAULT_PARAMS,
      pads: [
        ...DEFAULT_PARAMS.pads,
        {
          ...makeNegativePad(),
          offset: 0,
          position: 0.55,
          height: 45,
          width: 100,
          length: 120,
          plateau: 0.6,
          rotation: 30,
        },
      ],
    });
    const right = buildInsoleGeometry(p, "right", 32);
    const left = buildInsoleGeometry(p, "left", 32);
    const r = right.getAttribute("position");
    const l = left.getAttribute("position");
    expect(geometryStats(right).volumeCm3).toBeCloseTo(
      geometryStats(left).volumeCm3,
      6,
    );
    for (let vertex = 0; vertex < r.count; vertex++) {
      expect(l.getX(vertex)).toBe(-r.getX(vertex));
      expect(l.getY(vertex)).toBe(r.getY(vertex));
      expect(l.getZ(vertex)).toBe(r.getZ(vertex));
    }
    for (const mesh of [right, left]) {
      const position = mesh.getAttribute("position");
      const index = mesh.getIndex()!;
      const topCount = position.count / 2;
      const edges = new Map<string, { count: number; orientation: number }>();
      let signedVolume = 0;
      for (let vertex = 0; vertex < topCount; vertex++) {
        expect(position.getZ(vertex)).toBeGreaterThanOrEqual(
          MIN_INSOLE_THICKNESS - 1e-6,
        );
        expect(position.getZ(vertex + topCount)).toBe(0);
        const canonicalX = position.getX(vertex) * (mesh === left ? -1 : 1);
        expect(position.getZ(vertex)).toBeCloseTo(
          surfaceHeight(p, canonicalX, position.getY(vertex)),
          4,
        );
      }
      for (let triangle = 0; triangle < index.count; triangle += 3) {
        const ids = [
          index.getX(triangle),
          index.getX(triangle + 1),
          index.getX(triangle + 2),
        ];
        const [a, b, c] = ids.map((id) => [
          position.getX(id),
          position.getY(id),
          position.getZ(id),
        ]);
        const ab = b.map((value, axis) => value - a[axis]);
        const ac = c.map((value, axis) => value - a[axis]);
        expect(
          Math.hypot(
            ab[1] * ac[2] - ab[2] * ac[1],
            ab[2] * ac[0] - ab[0] * ac[2],
            ab[0] * ac[1] - ab[1] * ac[0],
          ),
        ).toBeGreaterThan(1e-7);
        signedVolume +=
          a[0] * (b[1] * c[2] - b[2] * c[1]) +
          a[1] * (b[2] * c[0] - b[0] * c[2]) +
          a[2] * (b[0] * c[1] - b[1] * c[0]);
        for (let corner = 0; corner < 3; corner++) {
          const start = ids[corner],
            end = ids[(corner + 1) % 3];
          const key = `${Math.min(start, end)},${Math.max(start, end)}`;
          const edge = edges.get(key) ?? { count: 0, orientation: 0 };
          edge.count++;
          edge.orientation += start < end ? 1 : -1;
          edges.set(key, edge);
        }
      }
      for (const edge of edges.values()) {
        expect(edge.count).toBe(2);
        expect(edge.orientation).toBe(0);
      }
      expect(position.count - edges.size + index.count / 3).toBe(2);
      expect(signedVolume).toBeGreaterThan(0);
      mesh.dispose();
    }
  });
});
