import { strFromU8, unzipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { defaultDensity, makeDensityZone } from "../src/insole/density";
import {
  buildInsoleGeometry,
  cloneParams,
  DEFAULT_PARAMS,
} from "../src/insole/model";
import { modifierBundle, prusaProject } from "../src/insole/prusa";
import { MK4S_BED, planBedPlacement } from "../src/insole/placement";

function sample() {
  const p = cloneParams(DEFAULT_PARAMS);
  p.density = {
    ...defaultDensity(),
    baseInfill: 18,
    arch: { infill: 45, scope: "support" },
    heel: { infill: 10, scope: "full" },
    pads: { [p.pads[0].id]: { infill: 30, scope: "base" } },
    zones: [
      {
        ...makeDensityZone(),
        id: "test-zone",
        name: 'Heel <relief> & "soft"',
        infill: 8,
      },
    ],
  };
  return p;
}

function readVolumes(config: string) {
  return [
    ...config.matchAll(
      /<volume firstid="(\d+)" lastid="(\d+)">([\s\S]*?)<\/volume>/g,
    ),
  ].map((match) => ({
    first: Number(match[1]),
    last: Number(match[2]),
    metadata: match[3],
  }));
}

function readVertices(model: string) {
  return [
    ...model.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g),
  ].map((match) => match.slice(1).map(Number));
}

function buildTransform(model: string) {
  const value = model.match(/<item [^>]*transform="([^"]+)"/);
  expect(value).not.toBeNull();
  return value![1].split(/\s+/).map(Number);
}

function transformPoint(matrix: number[], [x, y, z]: number[]) {
  return [
    matrix[0] * x + matrix[3] * y + matrix[6] * z + matrix[9],
    matrix[1] * x + matrix[4] * y + matrix[7] * z + matrix[10],
    matrix[2] * x + matrix[5] * y + matrix[8] * z + matrix[11],
  ];
}

function boundsXY(points: number[][]) {
  return points.reduce(
    (bounds, [x, y]) => ({
      minX: Math.min(bounds.minX, x),
      maxX: Math.max(bounds.maxX, x),
      minY: Math.min(bounds.minY, y),
      maxY: Math.max(bounds.maxY, y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
}

describe("PrusaSlicer density exports", () => {
  it.each(["85a", "95a"] as const)(
    "keeps %s material notes with each export without applying a machine or filament preset",
    (materialGrade) => {
      const p = cloneParams(DEFAULT_PARAMS);
      const project = unzipSync(
        prusaProject(p, "right", "Material test", { materialGrade }),
      );
      const bundle = unzipSync(
        modifierBundle(p, "right", "Material test", { materialGrade }),
      );
      for (const [files, settingsPath, readmePath] of [
        [
          project,
          "Metadata/InsoleStudio-density.json",
          "Metadata/InsoleStudio-README.txt",
        ],
        [bundle, "settings.json", "README.txt"],
      ] as const) {
        const manifest = JSON.parse(strFromU8(files[settingsPath]));
        expect(manifest.material.grade).toBe(materialGrade);
        expect(manifest.material.name).toContain(materialGrade.toUpperCase());
        expect(manifest.material.profileDownload).toBe(
          `siraya-tpu-air-${materialGrade}-prusa292-starting-profiles.ini`,
        );
        expect(manifest.material.appliedToSlicer).toBe(false);
        expect(manifest.containsPrinterOrFilamentProfile).toBe(false);
        expect(files["Metadata/Slic3r_PE.config"]).toBeUndefined();
        const notes = strFromU8(files[readmePath]);
        expect(notes).toContain(
          `Siraya Flex TPU Air ${materialGrade.toUpperCase()}`,
        );
        expect(notes).toContain(
          materialGrade === "85a" ? "multiplier 0.675" : "multiplier 0.65",
        );
        expect(notes).toContain("not an applied filament preset");
      }
    },
  );
  let files: Record<string, Uint8Array>;
  let model: string;
  let config: string;
  beforeAll(() => {
    files = unzipSync(
      prusaProject(sample(), "right", 'Test <fit> & "density"'),
    );
    model = strFromU8(files["3D/3dmodel.model"]);
    config = strFromU8(files["Metadata/Slic3r_PE_model.config"]);
  });

  it("packages one millimeter model with object-level infill, without replacing printer or filament profiles", () => {
    expect(files["[Content_Types].xml"]).toBeDefined();
    expect(strFromU8(files["_rels/.rels"])).toContain(
      'Target="/3D/3dmodel.model"',
    );
    expect(model).toContain('unit="millimeter"');
    expect(model.match(/<object /g)).toHaveLength(1);
    expect(model.match(/<item /g)).toHaveLength(1);
    expect(config).toContain(
      '<metadata type="object" key="fill_density" value="18%"/>',
    );
    expect(config).toContain(
      '<metadata type="object" key="fill_pattern" value="gyroid"/>',
    );
    expect(files["Metadata/Slic3r_PE.config"]).toBeUndefined();
    expect(config).not.toMatch(
      /temperature|extrusion_multiplier|printer_model|filament_settings_id/,
    );
    expect(model).toContain("Test &lt;fit&gt; &amp; &quot;density&quot;");
    expect(config).toContain("Heel &lt;relief&gt; &amp; &quot;soft&quot;");
  });

  it("remains identifiable as a Prusa project without claiming a newer reader than the supported 2.9.0 baseline", () => {
    // Prusa's project detector scans only the first 1024 bytes for this marker.
    // When there is no global print config, a future marker makes older GUIs
    // show "Configuration was not loaded", even for supported model metadata.
    const application = strFromU8(
      files["3D/3dmodel.model"].slice(0, 1024),
    ).match(
      /<metadata name="Application">PrusaSlicer-(\d+)\.(\d+)\.(\d+)<\/metadata>/,
    );
    expect(application).not.toBeNull();
    const [major, minor, patch] = application!.slice(1).map(Number);
    expect(major).toBe(2);
    expect(minor).toBe(9);
    expect(patch).toBeLessThanOrEqual(0);
    expect(model).toContain(
      '<metadata name="Designer">Insole Studio</metadata>',
    );
    expect(files["Metadata/Slic3r_PE.config"]).toBeUndefined();
    expect(
      readVolumes(config).filter((volume) =>
        volume.metadata.includes('key="volume_type" value="ParameterModifier"'),
      ),
    ).toHaveLength(4);
  });

  it("marks regions as nonprinting parameter modifiers in increasing override priority", () => {
    const volumes = readVolumes(config);
    expect(volumes).toHaveLength(5);
    expect(volumes[0].metadata).toContain(
      'key="volume_type" value="ModelPart"',
    );
    expect(volumes[0].metadata).not.toContain('key="modifier"');
    const densities = [45, 10, 30, 8];
    for (let i = 1; i < volumes.length; i++) {
      expect(volumes[i].metadata).toContain(
        'key="volume_type" value="ParameterModifier"',
      );
      expect(volumes[i].metadata).toContain('key="modifier" value="1"');
      expect(volumes[i].metadata).toContain(
        `key="fill_density" value="${densities[i - 1]}%"`,
      );
    }
    expect(volumes[1].metadata).toContain("Arch support");
    expect(volumes[4].metadata).toContain("Heel &lt;relief&gt;");
  });

  it("assigns every triangle exactly once and keeps all indices within the shared vertex table", () => {
    const volumes = readVolumes(config);
    const vertices = [
      ...model.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g),
    ];
    const triangles = [
      ...model.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g),
    ];
    expect(volumes[0].first).toBe(0);
    for (let i = 1; i < volumes.length; i++) {
      expect(volumes[i].first).toBe(volumes[i - 1].last + 1);
      expect(volumes[i].last).toBeGreaterThan(volumes[i].first);
    }
    expect(volumes.at(-1)!.last).toBe(triangles.length - 1);
    for (const vertex of vertices)
      expect(vertex.slice(1).every((n) => Number.isFinite(Number(n)))).toBe(
        true,
      );
    for (const triangle of triangles) {
      for (const value of triangle.slice(1)) {
        expect(Number(value)).toBeGreaterThanOrEqual(0);
        expect(Number(value)).toBeLessThan(vertices.length);
      }
    }
  });

  it("exports valid 100% infill regions as rectilinear, including an all-solid base", () => {
    const p = sample();
    p.density.baseInfill = 100;
    p.density.arch!.infill = 100;
    const exported = unzipSync(prusaProject(p, "left"));
    const overrides = strFromU8(exported["Metadata/Slic3r_PE_model.config"]);
    expect(overrides).toContain(
      '<metadata type="object" key="fill_pattern" value="rectilinear"/>',
    );
    expect(readVolumes(overrides)[1].metadata).toContain(
      'key="fill_pattern" value="rectilinear"',
    );
    expect(readVolumes(overrides)[2].metadata).toContain(
      'key="fill_pattern" value="gyroid"',
    );
  });

  it("keeps a single printable part when no density overrides are requested", () => {
    const p = cloneParams(DEFAULT_PARAMS);
    p.density = defaultDensity();
    const exported = unzipSync(prusaProject(p, "left"));
    expect(
      readVolumes(strFromU8(exported["Metadata/Slic3r_PE_model.config"])),
    ).toHaveLength(1);
  });

  it.each(["left", "right"] as const)(
    "rigidly rotates and centers the %s solid with its modifiers on the MK4/S bed at 100% scale",
    (side) => {
      const p = sample();
      const files = unzipSync(prusaProject(p, side));
      const model = strFromU8(files["3D/3dmodel.model"]);
      const matrix = buildTransform(model);
      expect(matrix).toHaveLength(12);
      expect(matrix.every(Number.isFinite)).toBe(true);
      expect(Math.hypot(...matrix.slice(0, 3))).toBeCloseTo(1, 10);
      expect(Math.hypot(...matrix.slice(3, 6))).toBeCloseTo(1, 10);
      expect(matrix[0] * matrix[3] + matrix[1] * matrix[4]).toBeCloseTo(0, 10);
      expect(matrix[0] * matrix[4] - matrix[1] * matrix[3]).toBeCloseTo(1, 10);
      expect([
        matrix[2],
        matrix[5],
        matrix[6],
        matrix[7],
        matrix[8],
        matrix[11],
      ]).toEqual([0, 0, 0, 0, 1, 0]);
      expect(model.match(/transform=/g)).toHaveLength(1);

      const geometry = buildInsoleGeometry(p, side, 160);
      try {
        const expected = planBedPlacement(geometry);
        expect(matrix).toEqual(expected.transform3mf.split(/\s+/).map(Number));
        const count = geometry.getAttribute("position").count;
        const vertices = readVertices(model);
        const solid = vertices.slice(0, count);
        // The original mesh coordinates are preserved. Placement belongs only
        // to the common parent instance, so no modifier can rotate separately.
        const original = strFromU8(
          unzipSync(
            prusaProject(p, side, "Insole Studio", { placement: "original" }),
          )["3D/3dmodel.model"],
        );
        expect(vertices).toEqual(readVertices(original));
        const position = geometry.getAttribute("position");
        expect(solid).toEqual(
          Array.from({ length: count }, (_, i) => [
            position.getX(i) || 0,
            position.getY(i) || 0,
            position.getZ(i) || 0,
          ]),
        );
        const bounds = boundsXY(
          solid.map((point) => transformPoint(matrix, point)),
        );
        expect(bounds.minX).toBeGreaterThanOrEqual(
          MK4S_BED.requiredClearance - 1e-7,
        );
        expect(bounds.maxX).toBeLessThanOrEqual(
          MK4S_BED.width - MK4S_BED.requiredClearance + 1e-7,
        );
        expect(bounds.minY).toBeGreaterThanOrEqual(
          MK4S_BED.requiredClearance - 1e-7,
        );
        expect(bounds.maxY).toBeLessThanOrEqual(
          MK4S_BED.depth - MK4S_BED.requiredClearance + 1e-7,
        );
        expect(bounds.minX + bounds.maxX).toBeCloseTo(MK4S_BED.width, 7);
        expect(bounds.minY + bounds.maxY).toBeCloseTo(MK4S_BED.depth, 7);

        const manifest = JSON.parse(
          strFromU8(files["Metadata/InsoleStudio-density.json"]),
        );
        expect(manifest.placement).toMatchObject({
          mode: "mk4s",
          target: "Original Prusa MK4 / MK4S",
          bed: MK4S_BED,
          scale: 1,
          fits: true,
          requiredClearance: 3,
        });
        expect(manifest.placement.rotationDegrees).toBe(
          expected.rotationDegrees,
        );
        expect(manifest.placement.bounds).toEqual(expected.bounds);
        expect(manifest.containsPrinterOrFilamentProfile).toBe(false);
        const readme = strFromU8(files["Metadata/InsoleStudio-README.txt"]);
        expect(readme).toContain("250 x 210 mm MK4/S bed, at 100% scale");
        expect(readme).toContain("Each foot is fitted independently");
        expect(readme).toContain("all density modifiers move with the solid");
        expect(readme).toContain("Brim, skirt, and purge features need");
      } finally {
        geometry.dispose();
      }
    },
  );

  it("fits the actual printable footprint even when a setting modifier extends beyond the bed", () => {
    const p = cloneParams(DEFAULT_PARAMS);
    p.density.zones = [
      { ...makeDensityZone(), width: 300, length: 450, offset: 150 },
    ];
    const exported = unzipSync(prusaProject(p, "right"));
    const model = strFromU8(exported["3D/3dmodel.model"]);
    const manifest = JSON.parse(
      strFromU8(exported["Metadata/InsoleStudio-density.json"]),
    );
    const geometry = buildInsoleGeometry(p, "right", 160);
    try {
      expect(manifest.placement).toMatchObject(planBedPlacement(geometry));
      const matrix = buildTransform(model);
      const solidCount = geometry.getAttribute("position").count;
      const modifierBounds = boundsXY(
        readVertices(model)
          .slice(solidCount)
          .map((point) => transformPoint(matrix, point)),
      );
      expect(
        modifierBounds.minX < 0 ||
          modifierBounds.maxX > MK4S_BED.width ||
          modifierBounds.minY < 0 ||
          modifierBounds.maxY > MK4S_BED.depth,
      ).toBe(true);
      expect(manifest.placement.fits).toBe(true);
    } finally {
      geometry.dispose();
    }
  });

  it("refuses an impossible MK4/S placement without shrinking, while original coordinates remain available", () => {
    const p = cloneParams(DEFAULT_PARAMS);
    p.length = 420;
    p.width = 180;
    expect(() => prusaProject(p, "right")).toThrow(/cannot fit.*100% scale/);
    expect(() =>
      prusaProject(p, "left", "Large foot", { placement: "mk4s" }),
    ).toThrow(/original coordinates.*never shrinks/);
    const exported = unzipSync(
      prusaProject(p, "right", "Large foot", { placement: "original" }),
    );
    expect(strFromU8(exported["3D/3dmodel.model"])).toContain(
      '<build><item objectid="1" printable="1"/></build>',
    );
    const manifest = JSON.parse(
      strFromU8(exported["Metadata/InsoleStudio-density.json"]),
    );
    expect(manifest.placement).toEqual({ mode: "original", scale: 1 });
    expect(strFromU8(exported["Metadata/InsoleStudio-README.txt"])).toContain(
      "No bed placement is applied",
    );
  });

  it("allows a physically fitting insole with a smaller explicitly requested bed margin", () => {
    const p = cloneParams(DEFAULT_PARAMS);
    p.length = 285;
    p.width = 125;
    expect(() => prusaProject(p, "right")).toThrow(/3 mm edge clearance/);
    const exported = unzipSync(
      prusaProject(p, "right", "Close fit", {
        placement: "mk4s",
        clearance: 0,
      }),
    );
    const manifest = JSON.parse(
      strFromU8(exported["Metadata/InsoleStudio-density.json"]),
    );
    expect(manifest.placement.requiredClearance).toBe(0);
    expect(manifest.placement.clearance).toBeGreaterThan(0);
    expect(manifest.placement.clearance).toBeLessThan(3);
    expect(manifest.placement.scale).toBe(1);
    expect(manifest.placement.fits).toBe(true);
    expect(strFromU8(exported["Metadata/InsoleStudio-README.txt"])).toContain(
      "requested model-to-bed margin: 0 mm",
    );
  });

  it("exports the full heel lift and modifiers tall enough to cover it for either foot", () => {
    const p = cloneParams(DEFAULT_PARAMS);
    p.heelLift = 40;
    p.archHeight = 0;
    p.heelCupHeight = 0;
    p.toeSpring = 0;
    p.pads.forEach((pad) => (pad.enabled = false));
    p.density = { ...defaultDensity(), heel: { infill: 12, scope: "full" } };

    for (const side of ["left", "right"] as const) {
      const files = unzipSync(prusaProject(p, side));
      const model = strFromU8(files["3D/3dmodel.model"]);
      const volumes = readVolumes(
        strFromU8(files["Metadata/Slic3r_PE_model.config"]),
      );
      const z = [
        ...model.matchAll(/<vertex x="[^"]+" y="[^"]+" z="([^"]+)"\/>/g),
      ].map((match) => Number(match[1]));
      const triangles = [
        ...model.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g),
      ].map((match) => match.slice(1).map(Number));
      const bounds = volumes.map((volume) => {
        const heights = triangles
          .slice(volume.first, volume.last + 1)
          .flatMap((triangle) => triangle.map((vertex) => z[vertex]));
        return { min: Math.min(...heights), max: Math.max(...heights) };
      });
      expect(bounds).toHaveLength(2);
      expect(bounds[0].min).toBe(0);
      expect(bounds[0].max).toBeCloseTo(p.baseThickness + p.heelLift, 5);
      expect(bounds[1].min).toBe(-0.5);
      expect(bounds[1].max).toBeGreaterThan(bounds[0].max);
      expect(volumes[1].metadata).toContain('key="fill_density" value="12%"');
    }
  });

  it("provides an aligned binary STL for each modifier and a complete manual settings manifest", () => {
    const bundle = unzipSync(
      modifierBundle(sample(), "right", "../../unsafe-name"),
    );
    const manifest = JSON.parse(strFromU8(bundle["settings.json"]));
    expect(manifest.units).toBe("millimeter");
    expect(manifest.base.fill_density).toBe("18%");
    expect(manifest.containsPrinterOrFilamentProfile).toBe(false);
    expect(manifest.placement).toBeUndefined();
    expect(manifest.modifiers.map((m: { infill: number }) => m.infill)).toEqual(
      [45, 10, 30, 8],
    );
    expect(Object.keys(bundle).some((path) => path.includes(".."))).toBe(false);
    const paths = [
      manifest.solid,
      ...manifest.modifiers.map((m: { file: string }) => m.file),
    ];
    for (const path of paths) {
      const bytes = bundle[path];
      const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      const triangles = view.getUint32(80, true);
      expect(bytes.length).toBe(84 + triangles * 50);
      expect(triangles).toBeGreaterThan(0);
    }
    const readme = strFromU8(bundle["README.txt"]);
    expect(readme).toContain("Add modifier > Load");
    expect(readme).toContain("NONPRINTING");
    expect(readme).toContain("Later modifiers take priority");
    expect(readme).not.toContain("MK4 / MK4S BED PLACEMENT");
    for (const modifier of manifest.modifiers)
      expect(readme).toContain(modifier.file);
  });
});
