import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { cloneParams, DEFAULT_PARAMS } from "../src/insole/model";
import { makeDensityZone } from "../src/insole/density";
import { airTemperatureSettings } from "../src/insole/temperature";
import { buildCompletePrintConfig } from "../src/insole/printConfig";
import { modifierBundle, prusaProject } from "../src/insole/prusa";

/** Existing saved temperatures remain editable project data, not print commands. */
function legacyTemperatureDesign() {
  const p = cloneParams(DEFAULT_PARAMS);
  p.density.temperature = 260;
  p.density.arch = {
    infill: 40,
    scope: "support",
    pattern: "cubic",
    temperature: 270,
  };
  p.density.zones.push({
    ...makeDensityZone(),
    name: "Forefoot cushion",
    infill: 12,
    pattern: "rectilinear",
    temperature: 240,
  });
  return p;
}

function expectInfillOnlyRegions(manifest: Record<string, any>) {
  expect(manifest.print_temperature_c).toBe(250);
  expect(manifest.temperature_scope).toBe("whole-insole");
  expect(manifest).not.toHaveProperty("temperaturePlan");
  expect(manifest.base).not.toHaveProperty("temperature_target_c");
  expect(manifest.modifiers[0]).toMatchObject({
    fill_density: "40%",
    pattern: "cubic",
    fill_pattern: "cubic",
  });
  expect(manifest.modifiers[1]).toMatchObject({
    fill_density: "12%",
    pattern: "rectilinear",
    fill_pattern: "rectilinear",
  });
  for (const modifier of manifest.modifiers) {
    for (const key of [
      "temperature",
      "temperature_target_c",
      "temperature_applied",
    ])
      expect(modifier).not.toHaveProperty(key);
  }
}

describe("fixed whole-insole foaming settings", () => {
  it.each([
    ["85a", 0.675],
    ["95a", 0.65],
  ] as const)(
    "pairs %s with 250°C and its grade-specific starting flow",
    (grade, multiplier) => {
      expect(airTemperatureSettings(grade)).toMatchObject({
        temperature: 250,
        multiplier,
        flowPercent: multiplier * 100,
      });
      const config = buildCompletePrintConfig(grade);
      expect(config).toContain("; temperature = 250\n");
      expect(config).toContain("; first_layer_temperature = 250\n");
      expect(config).toContain(`; extrusion_multiplier = ${multiplier}\n`);
      expect(config).toContain("; printer_model = MK4S\n");
      expect(config).toContain("; nozzle_diameter = 0.4\n");
      expect(config).toContain("M221 S100");
    },
  );
});

describe("infill regions with one export temperature", () => {
  it.each([
    ["85a", 0.675],
    ["95a", 0.65],
  ] as const)(
    "exports legacy mixed temperatures directly at 250°C for %s",
    (materialGrade, multiplier) => {
      const p = legacyTemperatureDesign();
      const before = JSON.stringify(p);
      const files = unzipSync(
        prusaProject(p, "right", "Regional infill", { materialGrade }),
      );
      const local = strFromU8(files["Metadata/Slic3r_PE_model.config"]);
      expect(local).toContain('key="fill_pattern" value="cubic"');
      expect(local).toContain('key="fill_pattern" value="rectilinear"');
      expect(local).toContain('key="fill_density" value="40%"');
      expect(local).toContain('key="fill_density" value="12%"');
      expect(local).not.toMatch(
        /key="(?:temperature|first_layer_temperature|extrusion_multiplier)"/,
      );
      expect(local).not.toMatch(/target (?:240|260|270)C|not applied/);
      const config = strFromU8(files["Metadata/Slic3r_PE.config"]);
      expect(config).toContain("; temperature = 250\n");
      expect(config).toContain("; first_layer_temperature = 250\n");
      expect(config).toContain(`; extrusion_multiplier = ${multiplier}\n`);
      const manifest = JSON.parse(
        strFromU8(files["Metadata/InsoleStudio-density.json"]),
      );
      expectInfillOnlyRegions(manifest);
      expect(manifest.material).toMatchObject({
        temperature: 250,
        multiplier,
        appliedToSlicer: true,
      });
      expect(JSON.stringify(p)).toBe(before);
    },
  );

  it("allows design-only exports of legacy mixed temperatures without embedding filament settings", () => {
    const p = legacyTemperatureDesign();
    const before = JSON.stringify(p);
    const files = unzipSync(
      prusaProject(p, "left", "Design only", {
        profileMode: "design",
        placement: "original",
      }),
    );
    expect(files).not.toHaveProperty("Metadata/Slic3r_PE.config");
    const manifest = JSON.parse(
      strFromU8(files["Metadata/InsoleStudio-density.json"]),
    );
    expectInfillOnlyRegions(manifest);
    expect(manifest.containsPrinterOrFilamentProfile).toBe(false);
    expect(JSON.stringify(p)).toBe(before);
  });

  it("keeps regional pattern settings in a manual bundle without presenting legacy temperatures as print targets", () => {
    const p = legacyTemperatureDesign();
    const before = JSON.stringify(p);
    const files = unzipSync(modifierBundle(p, "left"));
    const manifest = JSON.parse(strFromU8(files["settings.json"]));
    expectInfillOnlyRegions(manifest);
    expect(manifest.containsPrinterOrFilamentProfile).toBe(false);
    expect(JSON.stringify(p)).toBe(before);
  });

  it("uses rectilinear for a 100% cubic region without changing its saved choice", () => {
    const p = legacyTemperatureDesign();
    p.density.arch!.infill = 100;
    const files = unzipSync(prusaProject(p, "right"));
    const manifest = JSON.parse(
      strFromU8(files["Metadata/InsoleStudio-density.json"]),
    );
    expect(manifest.modifiers[0]).toMatchObject({
      pattern: "cubic",
      fill_pattern: "rectilinear",
    });
    expect(p.density.arch).toMatchObject({
      pattern: "cubic",
      temperature: 270,
    });
    expect(p.density.temperature).toBe(260);
  });
});
