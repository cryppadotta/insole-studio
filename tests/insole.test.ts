import { describe, expect, it } from "vitest";
import {
  binarySTL,
  buildInsoleGeometry,
  clampParams,
  cloneParams,
  DEFAULT_PARAMS,
  geometryStats,
  makePad,
  outlineAt,
  outlinePoints,
  PAD_LIMITS,
  PARAM_LIMITS,
  supportProfile,
  surfaceHeight,
  type InsoleParams,
  type MetPad,
} from "../src/insole/model";

function checkSolid(p: InsoleParams, side: "left" | "right") {
  const geometry = buildInsoleGeometry(p, side, 64);
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex()!;
  const edges = new Map<string, { count: number; orientation: number }>();
  let signedVolume = 0;
  for (const n of position.array) expect(Number.isFinite(n)).toBe(true);
  for (let i = 0; i < index.count; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const [a, b, c] = ids.map((id) => [
      position.getX(id),
      position.getY(id),
      position.getZ(id),
    ]);
    const ab = b.map((n, k) => n - a[k]);
    const ac = c.map((n, k) => n - a[k]);
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    expect(Math.hypot(...cross)).toBeGreaterThan(1e-7);
    signedVolume +=
      a[0] * (b[1] * c[2] - b[2] * c[1]) +
      a[1] * (b[2] * c[0] - b[0] * c[2]) +
      a[2] * (b[0] * c[1] - b[1] * c[0]);
    for (let j = 0; j < 3; j++) {
      const start = ids[j],
        end = ids[(j + 1) % 3];
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
  expect(signedVolume).toBeGreaterThan(0);
  // A connected genus-zero shell has Euler characteristic 2.
  expect(position.count - edges.size + index.count / 3).toBe(2);
  geometry.dispose();
}

describe("parametric insole solid", () => {
  it("makes a closed, oriented, nondegenerate printable shell for both feet and parameter extremes", () => {
    const low = clampParams({
      ...Object.fromEntries(
        Object.entries(PARAM_LIMITS).map(([key, value]) => [key, value[0]]),
      ),
      pads: [
        {
          ...makePad(),
          ...Object.fromEntries(
            Object.entries(PAD_LIMITS).map(([key, value]) => [key, value[0]]),
          ),
        },
      ],
    });
    const high = clampParams({
      ...Object.fromEntries(
        Object.entries(PARAM_LIMITS).map(([key, value]) => [key, value[1]]),
      ),
      pads: [
        {
          ...makePad(),
          ...Object.fromEntries(
            Object.entries(PAD_LIMITS).map(([key, value]) => [key, value[1]]),
          ),
        },
      ],
    });
    for (const params of [DEFAULT_PARAMS, low, high]) {
      for (const side of ["left", "right"] as const) checkSolid(params, side);
    }
  });

  it("keeps millimetre dimensions, a flat base, and reflected left/right surfaces", () => {
    const right = buildInsoleGeometry(DEFAULT_PARAMS, "right");
    const left = buildInsoleGeometry(DEFAULT_PARAMS, "left");
    const r = right.getAttribute("position"),
      l = left.getAttribute("position");
    for (let i = 0; i < r.count; i++) {
      expect(l.getX(i)).toBeCloseTo(-r.getX(i), 5);
      expect(l.getY(i)).toBe(r.getY(i));
      expect(l.getZ(i)).toBe(r.getZ(i));
    }
    const box = right.boundingBox!;
    expect(box.max.y - box.min.y).toBeCloseTo(DEFAULT_PARAMS.length, 5);
    expect(box.max.x - box.min.x).toBeCloseTo(DEFAULT_PARAMS.width, 1);
    expect(box.min.z).toBe(0);
    const stats = geometryStats(right);
    expect(stats.volumeCm3).toBeGreaterThan(70);
    expect(stats.volumeCm3).toBeLessThan(220);
    expect(stats.minThickness).toBeGreaterThanOrEqual(
      DEFAULT_PARAMS.baseThickness,
    );
    expect(geometryStats(left).volumeCm3).toBeCloseTo(stats.volumeCm3, 6);
    right.dispose();
    left.dispose();
  });

  it("keeps the full footprint inside its declared shoe-fit envelope", () => {
    for (const width of [65, 130]) {
      for (const toeShape of [0, 1]) {
        const p = clampParams({
          ...DEFAULT_PARAMS,
          width,
          toeShape,
          heelWidth: 90,
          archWidth: 100,
        });
        for (let i = 0; i <= 500; i++) {
          const edge = outlineAt(p, i / 500);
          expect(edge.left).toBeGreaterThanOrEqual(-width / 2);
          expect(edge.right).toBeLessThanOrEqual(width / 2);
          if (i > 0 && i < 500) expect(edge.right).toBeGreaterThan(edge.left);
        }
        const forefoot = outlineAt(p, 0.72);
        expect(forefoot.left).toBe(-width / 2);
        expect(forefoot.right).toBe(width / 2);
      }
    }
  });

  it("changes the outline and local surface at the intended editable landmarks", () => {
    const p = DEFAULT_PARAMS;
    expect(
      outlineAt({ ...p, width: 115 }, 0.72).right -
        outlineAt({ ...p, width: 115 }, 0.72).left,
    ).toBeCloseTo(115);
    expect(
      outlineAt({ ...p, archWidth: 45 }, 0.43).right -
        outlineAt({ ...p, archWidth: 45 }, 0.43).left,
    ).toBeCloseTo(45);
    expect(
      outlineAt({ ...p, toeShape: 1 }, 0.93).right -
        outlineAt({ ...p, toeShape: 1 }, 0.93).left,
    ).toBeGreaterThan(
      outlineAt({ ...p, toeShape: 0 }, 0.93).right -
        outlineAt({ ...p, toeShape: 0 }, 0.93).left,
    );
    const arch = outlineAt(p, p.archPosition);
    const archX = arch.left + (arch.right - arch.left) * 0.12;
    expect(
      surfaceHeight({ ...p, archHeight: 20 }, archX, p.archPosition * p.length),
    ).toBeGreaterThan(
      surfaceHeight({ ...p, archHeight: 0 }, archX, p.archPosition * p.length) +
        19,
    );
    const pad = p.pads[0];
    const bump = surfaceHeight(p, pad.offset, pad.position * p.length);
    const foundation = surfaceHeight(
      { ...p, archHeight: 0, pads: [] },
      pad.offset,
      pad.position * p.length,
    );
    expect(bump - foundation).toBeCloseTo(
      Math.max(
        pad.height,
        surfaceHeight({ ...p, pads: [] }, pad.offset, pad.position * p.length) -
          foundation,
      ),
    );
    expect(surfaceHeight({ ...p, heelCupHeight: 15 }, 0, 0)).toBeGreaterThan(
      surfaceHeight({ ...p, heelCupHeight: 0 }, 0, 0) + 14,
    );
    expect(
      surfaceHeight({ ...p, toeSpring: 8 }, outlineAt(p, 1).left, p.length) -
        surfaceHeight({ ...p, toeSpring: 0 }, outlineAt(p, 1).left, p.length),
    ).toBeCloseTo(8);
  });

  it("exports a complete binary STL with finite unit normals and millimetre coordinates", () => {
    const geometry = buildInsoleGeometry(DEFAULT_PARAMS, "right", 32);
    const stl = binarySTL(geometry);
    const view = new DataView(stl);
    const triangles = view.getUint32(80, true);
    expect(triangles).toBe(geometryStats(geometry).triangles);
    expect(stl.byteLength).toBe(84 + triangles * 50);
    let maxY = 0;
    for (let i = 0; i < triangles; i++) {
      const offset = 84 + i * 50;
      const normal = [0, 4, 8].map((n) => view.getFloat32(offset + n, true));
      expect(Math.hypot(...normal)).toBeCloseTo(1, 5);
      for (let j = 0; j < 3; j++)
        maxY = Math.max(maxY, view.getFloat32(offset + 16 + j * 12, true));
      expect(view.getUint16(offset + 48, true)).toBe(0);
    }
    expect(maxY).toBe(270);
    geometry.dispose();
  });

  it("clamps imported values and provides finite smooth closed outlines", () => {
    const p = clampParams({
      length: Infinity,
      width: 65,
      heelWidth: 90,
      archWidth: 100,
      baseThickness: -4,
      pads: [{ ...makePad(), height: NaN, width: -500, rotation: Infinity }],
    });
    expect(p.length).toBe(DEFAULT_PARAMS.length);
    expect(p.baseThickness).toBe(0.8);
    expect(p.pads[0].height).toBe(DEFAULT_PARAMS.pads[0].height);
    expect(p.pads[0].width).toBe(PAD_LIMITS.width[0]);
    expect(p.pads[0].rotation).toBe(0);
    expect(p.heelWidth).toBeLessThan(p.width);
    expect(p.archWidth).toBeLessThan(p.width);
    const points = outlinePoints(p);
    expect(points).toHaveLength(200);
    expect(new Set(points.map(({ x, y }) => `${x},${y}`)).size).toBe(
      points.length,
    );
    expect(
      points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)),
    ).toBe(true);
    const area =
      points.reduce((sum, a, i) => {
        const b = points[(i + 1) % points.length];
        return sum + a.x * b.y - b.x * a.y;
      }, 0) / 2;
    expect(area).toBeGreaterThan(8000);
  });
});

describe("heel lift", () => {
  it("adds its full height across the heel seat independently of the cup rim", () => {
    const p = clampParams({ ...DEFAULT_PARAMS, heelLift: 7.5 });
    const withoutLift = { ...p, heelLift: 0 };
    for (const t of [0, 0.04, 0.1, 0.15]) {
      const edge = outlineAt(p, t);
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        const x = edge.left + (edge.right - edge.left) * fraction;
        expect(
          surfaceHeight(p, x, t * p.length) -
            surfaceHeight(withoutLift, x, t * p.length),
        ).toBeCloseTo(7.5, 10);
      }
    }
    // A heel lift raises the center even with the rim entirely disabled.
    expect(
      surfaceHeight(
        { ...p, archHeight: 0, heelCupHeight: 0, pads: [] },
        0,
        0.1 * p.length,
      ),
    ).toBeCloseTo(p.baseThickness + 7.5, 10);
  });

  it("defaults older parameters to zero, preserves their shape, and clamps edits", () => {
    expect(DEFAULT_PARAMS.heelLift).toBe(0);
    const older = { ...DEFAULT_PARAMS } as Partial<InsoleParams>;
    delete older.heelLift;
    expect(clampParams(older).heelLift).toBe(0);
    expect(clampParams({ heelLift: -5 }).heelLift).toBe(0);
    expect(clampParams({ heelLift: 500 }).heelLift).toBe(40);
    expect(clampParams({ heelLift: NaN }).heelLift).toBe(0);
    const current = buildInsoleGeometry(DEFAULT_PARAMS, "right", 32);
    const restored = buildInsoleGeometry(clampParams(older), "right", 32);
    expect(restored.getAttribute("position").array).toEqual(
      current.getAttribute("position").array,
    );
    expect(restored.getIndex()!.array).toEqual(current.getIndex()!.array);
    current.dispose();
    restored.dispose();
  });

  it("tapers smoothly and monotonically before the forefoot without changing toe lift", () => {
    const p = clampParams({
      heelLift: 40,
      archHeight: 0,
      heelCupHeight: 0,
      toeSpring: 0,
      pads: [],
    });
    const addedHeight = (t: number) =>
      surfaceHeight(p, 0, t * p.length) - p.baseThickness;
    let previous = p.heelLift;
    for (let step = 0; step <= 600; step++) {
      const value = addedHeight(step / 600);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(previous + 1e-12);
      previous = value;
    }
    expect(addedHeight(0.375)).toBeCloseTo(20, 10);
    const epsilon = 1e-5;
    for (const boundary of [0.15, 0.6]) {
      const near = addedHeight(boundary - epsilon);
      const far = addedHeight(boundary + epsilon);
      expect(Math.abs(near - far)).toBeLessThan(1e-6);
      expect(Math.abs((near - far) / (2 * epsilon))).toBeLessThan(0.01);
    }
    for (const t of [0.6, 0.72, 0.8, 1]) {
      expect(addedHeight(t)).toBe(0);
      const toeOnly = { ...p, heelLift: 0, toeSpring: 30 };
      const combined = { ...p, toeSpring: 30 };
      expect(surfaceHeight(combined, 0, t * p.length)).toBe(
        surfaceHeight(toeOnly, 0, t * p.length),
      );
    }
    expect(surfaceHeight({ ...p, toeSpring: 30 }, 0, 0.1 * p.length)).toBe(
      surfaceHeight(p, 0, 0.1 * p.length),
    );
  });

  it("exports thicker, mirrored, watertight solids with a flat print-bed face", () => {
    const p = clampParams({ heelLift: 20 });
    const base = buildInsoleGeometry({ ...p, heelLift: 0 }, "right", 64);
    const right = buildInsoleGeometry(p, "right", 64);
    const left = buildInsoleGeometry(p, "left", 64);
    const r = right.getAttribute("position"),
      l = left.getAttribute("position");
    expect(geometryStats(right).volumeCm3).toBeGreaterThan(
      geometryStats(base).volumeCm3 + 50,
    );
    expect(geometryStats(left).volumeCm3).toBeCloseTo(
      geometryStats(right).volumeCm3,
      6,
    );
    for (let i = 0; i < r.count; i++) {
      expect(l.getX(i)).toBe(-r.getX(i));
      expect(l.getY(i)).toBe(r.getY(i));
      expect(l.getZ(i)).toBe(r.getZ(i));
      if (i >= r.count / 2) expect(r.getZ(i)).toBe(0);
    }
    for (const geometry of [right, left]) {
      // STL duplicates triangle vertices. Weld its exact exported float32
      // coordinates to check that every exported edge is paired and oriented.
      const view = new DataView(binarySTL(geometry));
      const edges = new Map<string, { count: number; orientation: number }>();
      const triangles = view.getUint32(80, true);
      for (let i = 0; i < triangles; i++) {
        const offset = 84 + i * 50;
        const points = [0, 1, 2].map((corner) =>
          [0, 4, 8]
            .map((axis) => {
              const value = view.getFloat32(
                offset + 12 + corner * 12 + axis,
                true,
              );
              expect(Number.isFinite(value)).toBe(true);
              return value;
            })
            .join(","),
        );
        for (let j = 0; j < 3; j++) {
          const a = points[j],
            b = points[(j + 1) % 3];
          const key = [a, b].sort().join("|");
          const edge = edges.get(key) ?? { count: 0, orientation: 0 };
          edge.count++;
          edge.orientation += a < b ? 1 : -1;
          edges.set(key, edge);
        }
      }
      for (const edge of edges.values()) {
        expect(edge.count).toBe(2);
        expect(edge.orientation).toBe(0);
      }
    }
    for (const side of ["left", "right"] as const) checkSolid(p, side);
    base.dispose();
    right.dispose();
    left.dispose();
  });
});

describe("editable support profiles", () => {
  const bare = () =>
    clampParams({ archHeight: 0, heelCupHeight: 0, toeSpring: 0, pads: [] });

  it("keeps a broad flat center and joins its surrounding surface smoothly", () => {
    for (const radius of [0, 0.1, 0.2, 0.3]) {
      expect(supportProfile(radius, 0.3, 0.9, 0.35)).toBe(1);
    }
    expect(supportProfile(0.5, 0.3, 0.9, 0.35)).toBeGreaterThan(0.9);
    expect(supportProfile(1, 0.3, 0.9, 0.35)).toBe(0);
    expect(supportProfile(2, 0.3, 0.9, 0.35)).toBe(0);
    expect(1 - supportProfile(0.301, 0.3, 0, 1)).toBeLessThan(1e-7);
    expect(supportProfile(0.999, 0.3, 0, 1)).toBeLessThan(1e-7);
    for (const curve1 of [0, 0.5, 1]) {
      for (const curve2 of [0, 0.5, 1]) {
        let previous = 1;
        for (let step = 0; step <= 100; step++) {
          const value = supportProfile(step / 100, 0.3, curve1, curve2);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(previous + 1e-12);
          previous = value;
        }
      }
    }
    expect(supportProfile(0.65, 0.3, 1, 1)).toBeGreaterThan(
      supportProfile(0.65, 0.3, 0, 0) + 0.5,
    );
  });

  it("merges any number of enabled pads without stacking their heights", () => {
    const p = bare();
    const first: MetPad = { ...makePad(), offset: 0, position: 0.5, height: 6 };
    const second: MetPad = {
      ...makePad(1),
      offset: 0,
      position: 0.5,
      height: 9,
    };
    const disabled: MetPad = {
      ...makePad(2),
      offset: 0,
      position: 0.5,
      height: 45,
      enabled: false,
    };
    const withPads = { ...p, pads: [first, second, disabled] };
    expect(
      surfaceHeight(withPads, 0, p.length / 2) - p.baseThickness,
    ).toBeCloseTo(9);
    expect(withPads.pads[2].height).toBe(45);
    const many = Array.from({ length: 160 }, (_, index) => ({
      ...makePad(index),
      height: 0.1,
      offset: 0,
      position: 0.5,
    }));
    expect(clampParams({ ...p, pads: many }).pads).toHaveLength(160);
    expect(
      surfaceHeight({ ...p, pads: many }, 0, p.length / 2) - p.baseThickness,
    ).toBeCloseTo(0.1);
  });

  it("rotates elongated pads around their center and moves them in both axes", () => {
    const p = bare();
    const pad = {
      ...makePad(),
      height: 10,
      offset: 0,
      position: 0.5,
      width: 20,
      length: 80,
      plateau: 0,
    };
    const plain = { ...p, pads: [pad] };
    const rotated = { ...p, pads: [{ ...pad, rotation: 90 }] };
    expect(surfaceHeight(plain, 15, p.length / 2)).toBe(p.baseThickness);
    expect(surfaceHeight(rotated, 15, p.length / 2)).toBeGreaterThan(
      p.baseThickness + 5,
    );
    expect(surfaceHeight(rotated, 0, p.length / 2)).toBeCloseTo(
      p.baseThickness + pad.height,
    );
    const moved = { ...p, pads: [{ ...pad, offset: 20, position: 0.7 }] };
    expect(surfaceHeight(moved, 20, p.length * 0.7)).toBeCloseTo(
      p.baseThickness + pad.height,
    );
    expect(surfaceHeight(moved, 0, p.length / 2)).toBe(p.baseThickness);
  });

  it("gives the arch independent length, span, position, rotation, and slope", () => {
    const p = {
      ...bare(),
      archHeight: 12,
      archOffset: 0,
      archPosition: 0.5,
      archSpan: 20,
      archLength: 100,
      archPlateau: 0,
    };
    const y = p.length / 2;
    expect(surfaceHeight(p, 0, y)).toBeCloseTo(p.baseThickness + 12);
    expect(surfaceHeight(p, 15, y)).toBe(p.baseThickness);
    expect(surfaceHeight({ ...p, archRotation: 90 }, 15, y)).toBeGreaterThan(
      p.baseThickness + 10,
    );
    expect(surfaceHeight({ ...p, archLength: 20 }, 0, y + 20)).toBe(
      p.baseThickness,
    );
    expect(surfaceHeight(p, 0, y + 20)).toBeGreaterThan(p.baseThickness + 8);
    const moved = { ...p, archOffset: -20, archPosition: 0.7 };
    expect(surfaceHeight(moved, -20, p.length * 0.7)).toBeCloseTo(
      p.baseThickness + 12,
    );
    expect(
      surfaceHeight({ ...p, archCurve1: 1, archCurve2: 1 }, 0, y + 30),
    ).toBeGreaterThan(
      surfaceHeight({ ...p, archCurve1: 0, archCurve2: 0 }, 0, y + 30) + 5,
    );
  });

  it("clones pad state and repairs missing or duplicate identities without sharing defaults", () => {
    const first = makePad(),
      second = makePad();
    expect(first.id).not.toBe(second.id);
    const copy = cloneParams(DEFAULT_PARAMS);
    copy.pads[0].height = 40;
    copy.pads.push(second);
    expect(DEFAULT_PARAMS.pads).toHaveLength(1);
    expect(DEFAULT_PARAMS.pads[0].height).toBe(3);
    const clean = clampParams({ pads: [first, { ...first }] });
    expect(clean.pads[0].id).toBe(first.id);
    expect(clean.pads[1].id).not.toBe(first.id);
    clean.pads[0].height = 15;
    expect(first.height).toBe(3);
  });

  it("resolves an 8 mm pad on the largest outline without refining ordinary designs", () => {
    const ordinary = buildInsoleGeometry(DEFAULT_PARAMS, "right");
    expect(ordinary.userData.sampleRows).toBe(128);
    expect(ordinary.userData.sampleColumns).toBe(32);
    ordinary.dispose();
    const p = clampParams({
      ...bare(),
      length: 420,
      width: 180,
      pads: [
        {
          ...makePad(),
          width: 8,
          length: 8,
          height: 12,
          offset: 2.7,
          position: 0.615,
        },
      ],
    });
    for (const resolution of [128, 160]) {
      const broad = buildInsoleGeometry(p, "right", resolution);
      expect(broad.boundingBox!.max.z).toBeCloseTo(p.baseThickness + 12, 4);
      expect(broad.userData.sampleRows).toBeLessThanOrEqual(512);
      expect(broad.userData.sampleColumns).toBeLessThanOrEqual(256);
      expect(broad.userData.sampleRows).toBeGreaterThan(300);
      broad.dispose();
      const rounded = buildInsoleGeometry(
        { ...p, pads: [{ ...p.pads[0], plateau: 0 }] },
        "right",
        resolution,
      );
      expect(rounded.boundingBox!.max.z - p.baseThickness).toBeGreaterThan(
        12 * 0.95,
      );
      rounded.dispose();
    }
  });

  it("retains a positive closed printable shell when large supports overlap", () => {
    const p = clampParams({
      length: 100,
      width: 40,
      baseThickness: 0.8,
      archHeight: 70,
      archLength: 350,
      archSpan: 180,
      archRotation: 179,
      archOffset: 0,
      archPosition: 0.5,
      archPlateau: 0.9,
      heelCupHeight: 50,
      toeSpring: 40,
      pads: [0, 30, 90, -135].map((rotation, index) => ({
        ...makePad(index),
        height: 45,
        width: 180,
        length: 240,
        offset: 0,
        position: 0.5,
        rotation,
        plateau: 0.9,
      })),
    });
    for (const side of ["left", "right"] as const) checkSolid(p, side);
    const geometry = buildInsoleGeometry(p, "right", 64);
    expect(geometryStats(geometry).minThickness).toBeGreaterThanOrEqual(0.8);
    expect(geometry.boundingBox!.max.z).toBeGreaterThan(70);
    expect(geometry.boundingBox!.max.z).toBeLessThanOrEqual(
      p.baseThickness + p.archHeight + p.heelCupHeight + p.toeSpring + 1e-5,
    );
    geometry.dispose();
  });
});
