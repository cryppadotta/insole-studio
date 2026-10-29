import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { cloneParams, DEFAULT_PARAMS } from "../src/insole/model";
import { makeDensityZone } from "../src/insole/density";
import {
  airTemperatureSettings,
  regionalTemperaturePlan,
} from "../src/insole/temperature";
import { buildCompletePrintConfig } from "../src/insole/printConfig";
import { modifierBundle, prusaProject } from "../src/insole/prusa";

describe("foaming temperature settings", () => {
  it.each([
    ["85a", 240, 0.875],
    ["85a", 250, 0.675],
    ["85a", 260, 0.575],
    ["85a", 270, 0.525],
    ["95a", 240, 0.875],
    ["95a", 250, 0.65],
    ["95a", 260, 0.525],
    ["95a", 270, 0.525],
  ] as const)(
    "pairs %s at %d C with the manufacturer's starting flow",
    (grade, temperature, multiplier) => {
      expect(airTemperatureSettings(grade, temperature)).toMatchObject({
        temperature,
        multiplier,
        interpolated: false,
      });
      const config = buildCompletePrintConfig(grade, temperature);
      expect(config).toContain(`; temperature = ${temperature}\n`);
      expect(config).toContain(`; first_layer_temperature = ${temperature}\n`);
      expect(config).toContain(`; extrusion_multiplier = ${multiplier}\n`);
      expect(config).toContain("; printer_model = MK4S\n");
      expect(config).toContain("M221 S100");
    },
  );

  it("marks interpolated starting flows and rejects out-of-range temperatures", () => {
    expect(airTemperatureSettings("85a", 255)).toEqual({
      temperature: 255,
      multiplier: 0.625,
      flowPercent: 62.5,
      interpolated: true,
    });
    expect(airTemperatureSettings("85a", 230).multiplier).toBe(0.875);
    expect(buildCompletePrintConfig("85a", 255)).toContain(
      "linearly interpolated",
    );
    for (const invalid of [229, 271, 255.5, NaN, Infinity]) {
      expect(() => airTemperatureSettings("85a", invalid)).toThrow(
        /230 and 270/,
      );
    }
  });
});

describe("regional temperature export contract", () => {
  function design() {
    const p = cloneParams(DEFAULT_PARAMS);
    p.density.arch = {
      infill: 40,
      scope: "support",
      pattern: "cubic",
      temperature: 270,
    };
    p.density.zones.push({
      ...makeDensityZone(),
      name: "Forefoot cushion",
      pattern: "rectilinear",
      temperature: 240,
    });
    return p;
  }

  it("blocks silent loss of mixed temperatures from a normal 3MF export", () => {
    const p = design();
    expect(regionalTemperaturePlan(p)).toMatchObject({
      mixed: true,
      wholeInsoleTemperature: 250,
      regionalTemperaturesApplied: false,
    });
    expect(() => prusaProject(p, "right")).toThrow(
      /modifiers cannot apply regional temperatures/,
    );
    expect(() =>
      prusaProject(p, "right", "test", { profileMode: "design" }),
    ).toThrow(/modifiers cannot apply regional temperatures/);
  });

  it("applies regional patterns but preserves temperatures as explicitly unapplied targets", () => {
    const files = unzipSync(
      prusaProject(design(), "right", "Regional settings", {
        materialGrade: "85a",
        regionalTemperatureMode: "targets-only",
      }),
    );
    const local = strFromU8(files["Metadata/Slic3r_PE_model.config"]);
    expect(local).toContain('key="fill_pattern" value="cubic"');
    expect(local).toContain('key="fill_pattern" value="rectilinear"');
    expect(local).not.toMatch(
      /key="(?:temperature|first_layer_temperature|extrusion_multiplier)"/,
    );
    const config = strFromU8(files["Metadata/Slic3r_PE.config"]);
    expect(config).toContain("; temperature = 250\n");
    expect(config).toContain("; extrusion_multiplier = 0.675\n");
    const manifest = JSON.parse(
      strFromU8(files["Metadata/InsoleStudio-density.json"]),
    );
    expect(manifest.temperaturePlan).toMatchObject({
      mixed: true,
      regionalTemperaturesApplied: false,
      wholeInsoleTemperatureApplied: true,
    });
    expect(manifest.modifiers[0]).toMatchObject({
      pattern: "cubic",
      temperature: 270,
      temperature_target_c: 270,
      temperature_applied: false,
    });
    expect(manifest.modifiers[1]).toMatchObject({
      pattern: "rectilinear",
      temperature: 240,
      temperature_applied: false,
    });
    expect(strFromU8(files["Metadata/InsoleStudio-README.txt"])).toContain(
      "Do not assume saved regional targets will print",
    );
  });

  it("uses the actual whole-insole temperature when all targets agree", () => {
    const p = design();
    p.density.temperature = 260;
    p.density.arch!.temperature = 260;
    p.density.zones[0].temperature = 260;
    const files = unzipSync(
      prusaProject(p, "left", "Uniform 260", { materialGrade: "85a" }),
    );
    const config = strFromU8(files["Metadata/Slic3r_PE.config"]);
    expect(config).toContain("; temperature = 260\n");
    expect(config).toContain("; extrusion_multiplier = 0.575\n");
    expect(regionalTemperaturePlan(p).mixed).toBe(false);
    const notes = strFromU8(files["Metadata/InsoleStudio-README.txt"]);
    expect(notes).toContain("one whole-insole temperature of 260 C");
  });

  it("retains targets and per-region patterns in a manual modifier bundle", () => {
    const files = unzipSync(modifierBundle(design(), "left"));
    const manifest = JSON.parse(strFromU8(files["settings.json"]));
    expect(manifest.temperaturePlan).toMatchObject({
      mixed: true,
      wholeInsoleTemperatureApplied: false,
      regionalTemperaturesApplied: false,
    });
    expect(manifest.modifiers[0]).toMatchObject({
      fill_pattern: "cubic",
      temperature_target_c: 270,
    });
    expect(strFromU8(files["README.txt"])).toContain(
      "cannot apply nozzle temperature",
    );
  });

  it("uses rectilinear for a 100% cubic region without changing its saved choice", () => {
    const p = cloneParams(DEFAULT_PARAMS);
    p.density.arch = {
      infill: 100,
      scope: "full",
      pattern: "cubic",
      temperature: 250,
    };
    const files = unzipSync(prusaProject(p, "right"));
    const manifest = JSON.parse(
      strFromU8(files["Metadata/InsoleStudio-density.json"]),
    );
    expect(manifest.modifiers[0]).toMatchObject({
      pattern: "cubic",
      fill_pattern: "rectilinear",
    });
    expect(p.density.arch.pattern).toBe("cubic");
  });
});
