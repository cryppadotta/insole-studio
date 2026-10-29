import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCompletePrintConfig } from "../src/insole/printConfig";
import type { MaterialGrade } from "../src/insole/materials";

function nativeConfig(grade: MaterialGrade) {
  const text = buildCompletePrintConfig(grade);
  // Native 3MF config uses the legacy G-code-comment config reader.
  const lines = text.split("\n").filter((line) => line.includes(" = "));
  expect(lines.every((line) => /^; [a-z0-9_]+ = /.test(line))).toBe(true);
  const entries = lines.map((line) => {
    const separator = line.indexOf(" = ");
    return [line.slice(2, separator), line.slice(separator + 3)] as const;
  });
  expect(new Set(entries.map(([key]) => key)).size).toBe(entries.length);
  return Object.fromEntries(entries);
}

function publicPreset(grade: MaterialGrade, name: string) {
  const text = readFileSync(
    new URL(
      `../public/downloads/siraya-tpu-air-${grade}-prusa292-starting-profiles.ini`,
      import.meta.url,
    ),
    "utf8",
  );
  const lines = text.split(`[${name}]\n`)[1].split(/\n\[/)[0];
  return Object.fromEntries(
    lines
      .split("\n")
      .filter((line) => line.includes(" = ") && !/^[#;]/.test(line))
      .map((line) => {
        const separator = line.indexOf(" = ");
        return [line.slice(0, separator), line.slice(separator + 3)];
      }),
  );
}

describe("complete PrusaSlicer project configurations", () => {
  it.each(["85a", "95a"] as const)(
    "resolves the entire MK4S standard 0.4 mm machine and %s material",
    (grade) => {
      const c = nativeConfig(grade);
      expect(Object.keys(c).length).toBeGreaterThan(350);
      expect(c).toMatchObject({
        printer_settings_id: "Original Prusa MK4S 0.4 nozzle",
        printer_model: "MK4S",
        printer_variant: "0.4",
        printer_technology: "FFF",
        nozzle_diameter: "0.4",
        nozzle_high_flow: "0",
        bed_shape: "0x0,250x0,250x210,0x210",
        max_print_height: "220",
        gcode_flavor: "marlin2",
        use_relative_e_distances: "1",
        machine_limits_usage: "emit_to_gcode",
        temperature: "250",
        first_layer_temperature: "250",
        bed_temperature: "40",
        first_layer_bed_temperature: "40",
        filament_type: "FLEX",
        filament_diameter: "1.75",
        extrusion_multiplier: grade === "85a" ? "0.675" : "0.65",
        filament_max_volumetric_speed: "2",
        max_volumetric_speed: "2",
        filament_retract_length: "0",
        filament_retract_layer_change: "0",
        filament_wipe: "0",
        layer_height: "0.2",
        first_layer_height: "0.2",
        perimeters: "2",
        top_solid_min_thickness: "0.6",
        bottom_solid_min_thickness: "0.6",
        print_settings_id: "Insole Studio - TPU Air - 0.20mm MK4 0.4 START",
        filament_settings_id: `"Insole Studio - Siraya TPU Air ${grade.toUpperCase()} - 250C foam START"`,
      });
    },
  );

  it.each(["85a", "95a"] as const)(
    "matches every setting in the existing %s public foam and print presets",
    (grade) => {
      const c = nativeConfig(grade);
      const print = publicPreset(
        grade,
        "print:Insole Studio - TPU Air - 0.20mm MK4 0.4 START",
      );
      const filament = publicPreset(
        grade,
        `filament:Insole Studio - Siraya TPU Air ${grade.toUpperCase()} - 250C foam START`,
      );
      for (const [key, value] of Object.entries({ ...print, ...filament })) {
        if (key === "compatible_printers_condition") continue;
        const actual = key === "filament_notes" ? JSON.parse(c[key]) : c[key];
        expect(actual, key).toBe(value);
      }
    },
  );

  it("retains the full official machine checks, leveling, purge and shutdown scripts", () => {
    const c = nativeConfig("85a");
    const seed = readFileSync(
      new URL(
        "../src/insole/profiles/mk4s-standard-0.4-prusa292.ini",
        import.meta.url,
      ),
      "utf8",
    );
    for (const key of [
      "start_gcode",
      "end_gcode",
      "before_layer_gcode",
      "layer_gcode",
    ]) {
      const line = seed
        .split("\n")
        .find((line) => line.startsWith(`${key} = `));
      expect(c[key]).toBe(line!.slice(key.length + 3));
    }
    const start = c.start_gcode.replaceAll("\\n", "\n");
    expect(start).toContain("M862.1 P[nozzle_diameter]");
    expect(start).toContain("F{(nozzle_high_flow[0] ? 1 : 0)}");
    expect(start).toContain('M862.3 P "[printer_model]"');
    expect(start).toContain('M862.6 P"Input shaper"');
    expect(start).toContain("G28 ; home all without mesh bed level");
    expect(start).toContain("G29 P1 ; invalidate mbl & probe print area");
    expect(start).toContain("M109 S{first_layer_temperature[0]}");
    expect(start).toContain("M221 S100");
    expect(start).toContain("G0 E7 X15 Z0.2 F500 ; purge");
    expect(c.end_gcode).toContain("M104 S0");
    expect(c.end_gcode).toContain("M140 S0");
    expect(c.end_gcode).toContain("M84 X Y E");
  });

  it.each(["85a", "95a"] as const)(
    "contains no private connection, filesystem path, or external command for %s",
    (grade) => {
      const c = nativeConfig(grade);
      for (const key of [
        "physical_printer_settings_id",
        "print_host",
        "printhost_apikey",
        "printhost_cafile",
        "bed_custom_model",
        "bed_custom_texture",
        "post_process",
      ]) {
        expect(c[key], key).toBe("");
      }
      expect(buildCompletePrintConfig(grade)).not.toMatch(
        /\/Users\/|\/home\/|[A-Z]:\\|localhost|127\.0\.0\.1|192\.168\.|10\.0\.0\./i,
      );
      expect(c).not.toHaveProperty("inherits");
    },
  );
});
