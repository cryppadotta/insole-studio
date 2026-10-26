import { describe, expect, it } from "vitest";
import type { BufferGeometry } from "three";
import {
  buildDensityModifiers,
  clampDensity,
  cloneDensity,
  createDensitySampler,
  defaultDensity,
  getDensityAt,
  getDensityRegions,
  makeDensityZone,
} from "../src/insole/density";
import {
  buildInsoleGeometry,
  clampParams,
  cloneParams,
  DEFAULT_PARAMS,
  makePad,
  surfaceHeight,
} from "../src/insole/model";

function checkClosedOutward(geometry: BufferGeometry) {
  const positions = geometry.getAttribute("position");
  const indices = geometry.getIndex()!;
  const edges = new Map<string, { count: number; orientation: number }>();
  let signedVolume = 0;
  for (const number of positions.array)
    expect(Number.isFinite(number)).toBe(true);
  for (let index = 0; index < indices.count; index += 3) {
    const ids = [0, 1, 2].map((n) => indices.getX(index + n));
    const [a, b, c] = ids.map((id) => [
      positions.getX(id),
      positions.getY(id),
      positions.getZ(id),
    ]);
    const ab = b.map((n, axis) => n - a[axis]);
    const ac = c.map((n, axis) => n - a[axis]);
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
    for (let edge = 0; edge < 3; edge++) {
      const from = ids[edge];
      const to = ids[(edge + 1) % 3];
      const key = `${Math.min(from, to)},${Math.max(from, to)}`;
      const tally = edges.get(key) ?? { count: 0, orientation: 0 };
      tally.count++;
      tally.orientation += from < to ? 1 : -1;
      edges.set(key, tally);
    }
  }
  for (const edge of edges.values())
    expect(edge).toEqual({ count: 2, orientation: 0 });
  expect(signedVolume).toBeGreaterThan(0);
  expect(positions.count - edges.size + indices.count / 3).toBe(2);
}

describe("slicer density settings", () => {
  it("creates independent defaults and deep clones without sharing editable state", () => {
    const first = defaultDensity();
    const second = defaultDensity();
    expect(first).toEqual({
      baseInfill: 20,
      pattern: "gyroid",
      arch: null,
      heel: null,
      pads: {},
      zones: [],
    });
    const pad = makePad();
    first.arch = { infill: 38, scope: "support" };
    first.pads[pad.id] = { infill: 12, scope: "full" };
    first.zones.push(makeDensityZone());
    const copy = cloneDensity(first);
    copy.arch!.infill = 90;
    copy.pads[pad.id].infill = 75;
    copy.zones[0].width = 100;
    expect(second.arch).toBeNull();
    expect(second.zones).toHaveLength(0);
    expect(first.arch.infill).toBe(38);
    expect(first.pads[pad.id].infill).toBe(12);
    expect(first.zones[0].width).toBe(50);
    expect(makeDensityZone().id).not.toBe(makeDensityZone().id);
  });

  it("normalizes percentages, dimensions and imports while removing orphaned pad overrides", () => {
    const density = clampDensity(
      {
        baseInfill: 500,
        pattern: "unknown",
        arch: { infill: -50, scope: "support" },
        heel: { infill: Infinity, scope: "bad" },
        pads: {
          first: { infill: 40, scope: "base" },
          orphan: { infill: 80, scope: "full" },
        },
        zones: [
          {
            id: "one",
            name: "Heel cushion",
            position: 4,
            offset: -900,
            width: 0,
            length: 900,
            rotation: 700,
            infill: -7,
            scope: "base",
            shape: "box",
          },
          { id: "one", name: " ", enabled: false, width: NaN, shape: "bad" },
        ],
      },
      ["first"],
    );
    expect(density.baseInfill).toBe(100);
    expect(density.pattern).toBe("gyroid");
    expect(density.arch).toEqual({ infill: 0, scope: "support" });
    expect(density.heel).toEqual({ infill: 20, scope: "full" });
    expect(density.pads).toEqual({ first: { infill: 40, scope: "base" } });
    expect(density.zones[0]).toMatchObject({
      position: 1,
      offset: -150,
      width: 5,
      length: 450,
      rotation: 180,
      infill: 0,
      shape: "box",
      scope: "base",
    });
    expect(density.zones[1]).toMatchObject({
      enabled: false,
      name: "Density zone 2",
      width: 50,
      shape: "ellipse",
    });
    expect(density.zones[1].id).not.toBe("one");
    expect(clampDensity(null)).toEqual(defaultDensity());
    expect(clampDensity({ baseInfill: NaN, zones: false })).toEqual(
      defaultDensity(),
    );
    const proto = clampDensity(
      JSON.parse('{"pads":{"__proto__":{"infill":60,"scope":"full"}}}'),
    );
    expect(Object.getPrototypeOf(proto.pads)).toBe(Object.prototype);
    expect(Object.hasOwn(proto.pads, "__proto__")).toBe(true);
  });

  it("keeps density independent from printable shape and clones model density deeply", () => {
    const params = cloneParams(DEFAULT_PARAMS);
    params.density.arch = { infill: 80, scope: "full" };
    params.density.pads[params.pads[0].id] = { infill: 7, scope: "base" };
    params.density.zones = [makeDensityZone()];
    const clone = cloneParams(params);
    clone.density.arch!.infill = 10;
    clone.density.pads[clone.pads[0].id].infill = 95;
    clone.density.zones[0].offset = 70;
    expect(params.density.arch.infill).toBe(80);
    expect(params.density.pads[params.pads[0].id].infill).toBe(7);
    expect(params.density.zones[0].offset).toBe(0);
    const plain = buildInsoleGeometry(DEFAULT_PARAMS, "right", 32);
    const varied = buildInsoleGeometry(params, "right", 32);
    expect(varied.getAttribute("position").array).toEqual(
      plain.getAttribute("position").array,
    );
    expect(varied.getIndex()!.array).toEqual(plain.getIndex()!.array);
    expect(
      surfaceHeight(
        params,
        params.archOffset,
        params.archPosition * params.length,
      ),
    ).toBe(
      surfaceHeight(
        DEFAULT_PARAMS,
        params.archOffset,
        params.archPosition * params.length,
      ),
    );
    plain.dispose();
    varied.dispose();
    expect(
      clampParams({ density: { ...params.density, baseInfill: -3 } }).density
        .baseInfill,
    ).toBe(0);
    expect(clampParams({}).density).toEqual(defaultDensity());
  });

  it("applies explicit last-region precedence and only enabled pad and zone modifiers", () => {
    const params = cloneParams(DEFAULT_PARAMS);
    params.archOffset = 0;
    params.archPosition = 0.14;
    params.pads = [
      { ...makePad(), offset: 0, position: 0.14 },
      { ...makePad(1), offset: 0, position: 0.14 },
      { ...makePad(2), offset: 0, position: 0.14, enabled: false },
    ];
    params.density = {
      ...defaultDensity(),
      arch: { infill: 30, scope: "full" },
      heel: { infill: 40, scope: "full" },
      pads: Object.fromEntries(
        params.pads.map((pad, index) => [
          pad.id,
          { infill: 50 + index * 10, scope: "full" },
        ]),
      ),
      zones: [
        { ...makeDensityZone(), position: 0.14, infill: 15 },
        { ...makeDensityZone(), position: 0.14, infill: 95, enabled: false },
      ],
    };
    const y = params.length * 0.14;
    expect(getDensityAt(params, 0, y, 1)).toBe(15);
    expect(getDensityRegions(params).map((region) => region.source)).toEqual([
      "arch",
      "heel",
      "pad",
      "pad",
      "zone",
    ]);
    expect(getDensityRegions(params).at(-1)).toMatchObject({
      id: `density-zone-${params.density.zones[0].id}`,
      sourceId: params.density.zones[0].id,
    });
    params.density.zones = [];
    expect(getDensityAt(params, 0, y, 1)).toBe(60);
    params.pads[1].enabled = false;
    expect(getDensityAt(params, 0, y, 1)).toBe(50);
    params.pads[0].enabled = false;
    expect(getDensityAt(params, 0, y, 1)).toBe(40);
    params.density.heel = null;
    expect(getDensityAt(params, 0, y, 1)).toBe(30);
    expect(getDensityAt(params, 1000, y, 1)).toBe(20);
  });

  it("scopes base and support to separate Z intervals and rotates both footprint shapes", () => {
    const params = cloneParams(DEFAULT_PARAMS);
    params.density.baseInfill = 22;
    params.density.zones = [
      {
        ...makeDensityZone(),
        scope: "base",
        position: 0.5,
        width: 20,
        length: 80,
        rotation: 90,
        infill: 8,
      },
      {
        ...makeDensityZone(),
        scope: "support",
        position: 0.5,
        width: 20,
        length: 80,
        rotation: 90,
        infill: 55,
      },
    ];
    const y = params.length / 2;
    expect(getDensityAt(params, 25, y, 1)).toBe(8);
    expect(getDensityAt(params, 25, y, params.baseThickness)).toBe(8);
    expect(getDensityAt(params, 25, y, params.baseThickness + 0.01)).toBe(55);
    expect(getDensityAt(params, 0, y + 25, 1)).toBe(22);
    expect(getDensityAt(params, 39, y + 9, 1)).toBe(22);
    params.density.zones[0].shape = "box";
    expect(getDensityAt(params, 39, y + 9, 1)).toBe(8);
    const sampler = createDensitySampler(params);
    expect(sampler(25, y, 1)).toBe(getDensityAt(params, 25, y, 1));
    expect(sampler(25, y, 2000)).toBe(22);
  });

  it("exports closed outward modifier volumes in millimetres with exact mirrored coordinates", () => {
    const params = cloneParams(DEFAULT_PARAMS);
    params.density.arch = { infill: 35, scope: "support" };
    params.density.heel = { infill: 8, scope: "base" };
    params.density.pads[params.pads[0].id] = { infill: 12, scope: "full" };
    params.density.zones = [
      {
        ...makeDensityZone(),
        shape: "box",
        position: 0.7,
        offset: -13,
        width: 80,
        length: 40,
        rotation: 31,
      },
    ];
    const right = buildDensityModifiers(params, "right");
    const left = buildDensityModifiers(params, "left");
    expect(right).toHaveLength(4);
    expect(buildDensityModifiers(DEFAULT_PARAMS, "right")).toHaveLength(0);
    for (let index = 0; index < right.length; index++) {
      const r = right[index],
        l = left[index];
      checkClosedOutward(r.geometry);
      checkClosedOutward(l.geometry);
      const rp = r.geometry.getAttribute("position"),
        lp = l.geometry.getAttribute("position");
      for (let vertex = 0; vertex < rp.count; vertex++) {
        expect(lp.getX(vertex)).toBe(-rp.getX(vertex));
        expect(lp.getY(vertex)).toBe(rp.getY(vertex));
        expect(lp.getZ(vertex)).toBe(rp.getZ(vertex));
      }
      expect(r.geometry.boundingBox!.min.z).toBeCloseTo(r.minZ, 5);
      expect(r.geometry.boundingBox!.max.z).toBeCloseTo(r.maxZ, 5);
      expect(r.geometry.userData.units).toBe("mm");
      r.geometry.dispose();
      l.geometry.dispose();
    }
    expect(right[0].minZ).toBe(params.baseThickness);
    expect(right[1].maxZ).toBe(params.baseThickness);
    expect(right[2].minZ).toBe(-0.5);
    expect(right[0].maxZ).toBeGreaterThan(
      surfaceHeight(
        params,
        params.archOffset,
        params.archPosition * params.length,
      ),
    );
  });
});
