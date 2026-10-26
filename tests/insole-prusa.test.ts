import { strFromU8, unzipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { defaultDensity, makeDensityZone } from "../src/insole/density";
import { cloneParams, DEFAULT_PARAMS } from "../src/insole/model";
import { modifierBundle, prusaProject } from "../src/insole/prusa";

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

describe("PrusaSlicer density exports", () => {
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

  it("provides an aligned binary STL for each modifier and a complete manual settings manifest", () => {
    const bundle = unzipSync(
      modifierBundle(sample(), "right", "../../unsafe-name"),
    );
    const manifest = JSON.parse(strFromU8(bundle["settings.json"]));
    expect(manifest.units).toBe("millimeter");
    expect(manifest.base.fill_density).toBe("18%");
    expect(manifest.containsPrinterOrFilamentProfile).toBe(false);
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
    for (const modifier of manifest.modifiers)
      expect(readme).toContain(modifier.file);
  });
});
