import { describe, expect, it } from "vitest";
import {
  binarySTL,
  buildInsoleGeometry,
  clampParams,
  makePad,
  outlineAt,
  surfaceHeight,
  type InsoleParams,
} from "../src/insole/model";

function overlappingSupports(): InsoleParams {
  return clampParams({
    baseThickness: 4.5,
    heelLift: 6,
    heelCupHeight: 8,
    toeSpring: 5,
    archHeight: 8,
    archOffset: -18,
    archPosition: 0.4,
    archSpan: 62,
    archLength: 150,
    archRotation: 15,
    archPlateau: 0.18,
    pads: [
      {
        ...makePad(),
        height: 5.5,
        offset: 15,
        position: 0.64,
        width: 42,
        length: 76,
        rotation: 35,
        plateau: 0.25,
      },
      {
        ...makePad(1),
        height: 9,
        offset: -8,
        position: 0.58,
        width: 36,
        length: 62,
        rotation: -30,
        plateau: 0.1,
      },
      {
        ...makePad(2),
        height: 2,
        offset: 20,
        position: 0.83,
        width: 30,
        length: 40,
        rotation: 70,
      },
    ],
  });
}

function sampleFoot(p: InsoleParams) {
  const points: [number, number][] = [];
  for (let row = 0; row <= 32; row++) {
    const t = row / 32;
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

describe("independent overlapping support heights", () => {
  it("keeps a 1 mm pad over a 0.5 mm arch at 1 mm above the base", () => {
    const p = clampParams({
      baseThickness: 3,
      archHeight: 0.5,
      archOffset: 0,
      archPosition: 0.5,
      heelLift: 0,
      heelCupHeight: 0,
      toeSpring: 0,
      pads: [{ ...makePad(), height: 1, offset: 0, position: 0.5 }],
    });

    expect(surfaceHeight(p, 0, p.length / 2)).toBe(p.baseThickness + 1);
  });

  it("uses the pointwise highest isolated support across rotated slopes and structural lifts", () => {
    const p = overlappingSupports();
    const structural = { ...p, archHeight: 0, pads: [] };
    const isolated = [
      { ...p, pads: [] },
      ...p.pads.map((pad) => ({ ...p, archHeight: 0, pads: [pad] })),
    ];
    const winners = new Set<number>();
    let slopeSamples = 0;

    for (const [x, y] of sampleFoot(p)) {
      const base = surfaceHeight(structural, x, y);
      const heights = isolated.map((support) => surfaceHeight(support, x, y));
      const highest = Math.max(base, ...heights);
      expect(surfaceHeight(p, x, y)).toBeCloseTo(highest, 10);
      expect(highest).toBeGreaterThanOrEqual(base);

      const winner = heights.indexOf(highest);
      if (highest > base + 0.01) winners.add(winner);
      const peaks = [p.archHeight, ...p.pads.map((pad) => pad.height)];
      if (
        heights.some(
          (value, index) =>
            value > base + 0.01 && value < base + peaks[index] - 0.01,
        )
      ) {
        slopeSamples++;
      }
    }

    // Exercise each support and its sloped shoulder, not only empty regions.
    expect(winners).toEqual(new Set([0, 1, 2, 3]));
    expect(slopeSamples).toBeGreaterThan(30);
    expect(surfaceHeight(structural, 0, 0.1 * p.length)).toBeGreaterThan(
      p.baseThickness + p.heelLift,
    );
    expect(surfaceHeight(structural, 0, p.length)).toBeCloseTo(
      p.baseThickness + p.toeSpring,
      10,
    );
  });

  it("ignores pad order, duplicates, disabled pads and zero-height pads", () => {
    const p = overlappingSupports();
    const variants = [
      { ...p, pads: [...p.pads].reverse() },
      { ...p, pads: [...p.pads, { ...p.pads[1], id: "duplicate-pad" }] },
      {
        ...p,
        pads: [
          ...p.pads,
          { ...p.pads[1], id: "disabled-pad", height: 45, enabled: false },
          { ...p.pads[0], id: "zero-pad", height: 0 },
        ],
      },
    ];

    for (const [x, y] of sampleFoot(p)) {
      const expected = surfaceHeight(p, x, y);
      for (const variant of variants) {
        expect(surfaceHeight(variant, x, y)).toBe(expected);
      }
    }
  });

  it("cannot lower the surface when a shorter support is added", () => {
    const p = overlappingSupports();
    const smaller = {
      ...p.pads[1],
      id: "smaller-pad",
      height: p.pads[1].height / 2,
    };
    const withSmaller = { ...p, pads: [...p.pads, smaller] };

    for (const [x, y] of sampleFoot(p)) {
      expect(surfaceHeight(withSmaller, x, y)).toBe(surfaceHeight(p, x, y));
    }
  });

  it("exports the same non-stacking surface in the mirrored mesh and binary STL", () => {
    const p = overlappingSupports();
    const structural = { ...p, archHeight: 0, pads: [] };
    const isolated = [
      { ...p, pads: [] },
      ...p.pads.map((pad) => ({ ...p, archHeight: 0, pads: [pad] })),
    ];

    for (const side of ["right", "left"] as const) {
      const mesh = buildInsoleGeometry(p, side, 32);
      const positions = mesh.getAttribute("position");
      const indices = mesh.getIndex()!;
      const stl = new DataView(binarySTL(mesh));

      expect(stl.getUint32(80, true)).toBe(indices.count / 3);
      expect(stl.byteLength).toBe(84 + (indices.count / 3) * 50);
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const z = positions.getZ(vertex);
        if (z === 0) continue;
        const x = positions.getX(vertex) * (side === "left" ? -1 : 1);
        const y = positions.getY(vertex);
        const expected = Math.max(
          surfaceHeight(structural, x, y),
          ...isolated.map((support) => surfaceHeight(support, x, y)),
        );
        // Mesh coordinates are float32; the analytic profiles use doubles.
        expect(z).toBeCloseTo(expected, 4);
      }

      for (let triangle = 0; triangle < indices.count / 3; triangle++) {
        for (let corner = 0; corner < 3; corner++) {
          const vertex = indices.getX(triangle * 3 + corner);
          const offset = 84 + triangle * 50 + 12 + corner * 12;
          expect(stl.getFloat32(offset, true)).toBe(positions.getX(vertex));
          expect(stl.getFloat32(offset + 4, true)).toBe(positions.getY(vertex));
          expect(stl.getFloat32(offset + 8, true)).toBe(positions.getZ(vertex));
        }
      }
      mesh.dispose();
    }
  });
});
