import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const grades = [
  { grade: "85", foamMultiplier: "0.675" },
  { grade: "95", foamMultiplier: "0.65" },
] as const;
const sharedPrintName = "print:Insole Studio - TPU Air - 0.20mm MK4 0.4 START";
const compatibility =
  'nozzle_diameter[0]==0.4 and (printer_model=="MK4IS" or printer_model=="MK4S") and num_extruders==1';

function readDownload(grade: string, filename: string) {
  return readFileSync(
    new URL(
      `../public/downloads/siraya-tpu-air-${grade}a-${filename}`,
      import.meta.url,
    ),
    "utf8",
  );
}

function readSections(text: string) {
  const sections: Record<string, Record<string, string>> = {};
  let current: Record<string, string> | undefined;
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const heading = line.match(/^\[([^\]]+)\]$/);
    if (heading) {
      expect(sections[heading[1]]).toBeUndefined();
      current = sections[heading[1]] = {};
      continue;
    }
    const assignment = line.match(/^([^=]+?)\s*=\s*(.*)$/);
    expect(assignment, `Invalid INI line: ${line}`).not.toBeNull();
    expect(current).toBeDefined();
    expect(current![assignment![1]]).toBeUndefined();
    current![assignment![1]] = assignment![2];
  }
  return sections;
}

describe.each(grades)(
  "downloadable TPU Air $grade A calibration profiles",
  ({ grade, foamMultiplier }) => {
    const bundle = readDownload(grade, "prusa292-starting-profiles.ini");
    const readme = readDownload(grade, "README.txt");
    const sections = readSections(bundle);
    const filaments = Object.entries(sections)
      .filter(([name]) => name.startsWith("filament:"))
      .map(([name, values]) => ({ name, values }));
    const printing = sections[sharedPrintName];

    it("adds only new namespaced print and filament presets without importing a printer or hidden parent", () => {
      expect(Object.keys(sections)).toHaveLength(3);
      expect(filaments).toHaveLength(2);
      expect(printing).toBeDefined();
      for (const [name, values] of Object.entries(sections)) {
        expect(name).toMatch(/^(filament|print):Insole Studio - .+ START$/);
        expect(values.inherits).toBeUndefined();
        expect(values.compatible_printers_condition).toBe(compatibility);
      }
    });

    it("keeps each grade's temperature and starting flow paired, including the first layer", () => {
      const expected = [
        { name: "240C firm", temperature: "240", multiplier: "0.875" },
        { name: "250C foam", temperature: "250", multiplier: foamMultiplier },
      ];
      for (const item of expected) {
        const profile = filaments.find(({ name }) => name.includes(item.name))!;
        expect(profile.values.temperature).toBe(item.temperature);
        expect(profile.values.first_layer_temperature).toBe(item.temperature);
        expect(profile.values.extrusion_multiplier).toBe(item.multiplier);
      }
    });

    it("turns slicing retractions and wiping off using filament overrides", () => {
      for (const { values } of filaments) {
        for (const key of [
          "filament_retract_length",
          "filament_retract_speed",
          "filament_deretract_speed",
          "filament_retract_length_toolchange",
          "filament_retract_restart_extra",
          "filament_retract_restart_extra_toolchange",
          "filament_retract_layer_change",
          "filament_retract_before_wipe",
          "filament_wipe",
        ]) {
          expect(values[key], key).toBe("0");
        }
      }
    });

    it("uses bounded cooling, bed temperature and extrusion rather than inheriting a PLA material", () => {
      for (const { values } of filaments) {
        expect(values.filament_type).toBe("FLEX");
        expect(values.filament_diameter).toBe("1.75");
        expect(values.filament_max_volumetric_speed).toBe("2");
        expect(values.bed_temperature).toBe("40");
        expect(values.first_layer_bed_temperature).toBe("40");
        expect(values.min_fan_speed).toBe("100");
        expect(values.max_fan_speed).toBe("100");
        expect(values.disable_fan_first_layers).toBe("2");
        expect(values.full_fan_speed_layer).toBe("3");
        expect(values.filament_density).toBe("0");
      }
    });

    it("provides controlled print speeds and inspectable shell thickness", () => {
      expect(printing.layer_height).toBe("0.2");
      expect(printing.first_layer_height).toBe("0.2");
      expect(printing.first_layer_speed).toBe("15");
      expect(printing.max_print_speed).toBe("30");
      expect(printing.max_volumetric_speed).toBe("2");
      expect(printing.perimeters).toBe("2");
      expect(printing.top_solid_layers).toBe("3");
      expect(printing.bottom_solid_layers).toBe("3");
      expect(printing.top_solid_min_thickness).toBe("0.6");
      expect(printing.bottom_solid_min_thickness).toBe("0.6");
      expect(printing.fill_density).toBe("20%");
      expect(printing.fill_pattern).toBe("gyroid");
      expect(printing.support_material).toBe("0");
    });

    it("contains no machine scripts, external execution, network credentials or private paths", () => {
      for (const values of Object.values(sections)) {
        for (const key of Object.keys(values)) {
          expect(key).not.toMatch(
            /^(start_gcode|end_gcode|filament_start_gcode|filament_end_gcode|post_process|before_layer_gcode|layer_gcode|toolchange_gcode|between_objects_gcode|printer_settings_id|nozzle_diameter|nozzle_high_flow|bed_shape|max_print_height|print_host|printhost_.*|host_type|printer_model|machine_.*|physical_printer.*)$/,
          );
        }
      }
      expect(bundle).not.toMatch(
        /\/Users\/|[A-Z]:\\Users\\|\.local\b|\b(?:10|127|192\.168)\.\d|(?:api[_-]?key|password|token)\s*=/i,
      );
    });

    it("ships calibration and import instructions tied to the actual download", () => {
      expect(readme).toContain(
        `siraya-tpu-air-${grade}a-prusa292-starting-profiles.ini`,
      );
      for (const name of Object.keys(sections)) {
        expect(readme).toContain(name.split(":").slice(1).join(":"));
      }
      expect(readme).toContain("File > Import > Import Config Bundle");
      expect(readme).toContain("not official");
      expect(readme).toContain(
        `Use only for Flex TPU Air ${grade}A active-foaming filament`,
      );
      expect(readme).toContain(
        "Do not use these Air profiles for nonfoaming Flex TPU",
      );
      expect(readme).toContain(
        "Keep the official standard/high-flow nozzle choice and machine checks",
      );
      expect(readme).toContain(`multiplier ${foamMultiplier}`);
      for (const { name, values } of filaments) {
        expect(name).toContain(`TPU Air ${grade}A`);
        expect(values.filament_notes).toContain(
          `TPU Air ${grade}A active-foaming`,
        );
        expect(values.filament_notes).toContain("not infill density");
      }
      expect(readme).toContain(
        "Object and modifier infill values take precedence",
      );
      expect(readme).toContain("leave printer flow\nat 100%");
      expect(readme).toContain(
        "https://siraya.tech/blogs/news/foaming-tpu-filament-guide",
      );
      expect(readme).toContain(
        "https://siraya.tech/pages/siraya-tech-tpu-air-user-manual",
      );
    });
  },
);

describe("paired TPU Air grade downloads", () => {
  const bundles = grades.map(({ grade }) =>
    readSections(readDownload(grade, "prusa292-starting-profiles.ini")),
  );

  it("shares an identical slow print preset so importing both grades cannot replace its settings", () => {
    expect(bundles[0][sharedPrintName]).toEqual(bundles[1][sharedPrintName]);
    const filamentNames = bundles.flatMap((sections) =>
      Object.keys(sections).filter((name) => name.startsWith("filament:")),
    );
    expect(new Set(filamentNames).size).toBe(4);
  });

  it.each([
    ["MK4IS", 0.4, 1, true],
    ["MK4S", 0.4, 1, true],
    ["MK4IS", 0.6, 1, false],
    ["MK4S", 0.6, 1, false],
    ["MK4IS", 0.4, 2, false],
    ["MK4S", 0.4, 2, false],
    ["MK4", 0.4, 1, false],
    ["XL", 0.4, 1, false],
  ])(
    "limits compatibility for %s / %s mm / %s extruders",
    (model, diameter, extruders, expected) => {
      for (const sections of bundles) {
        for (const values of Object.values(sections)) {
          // Prusa's condition uses the same comparison/grouping semantics with
          // named logical operators; evaluating the static download catches an
          // ungrouped model OR that would bypass nozzle/extruder restrictions.
          const expression = values.compatible_printers_condition
            .replace(/\band\b/g, "&&")
            .replace(/\bor\b/g, "||");
          const compatible = new Function(
            "printer_model",
            "nozzle_diameter",
            "num_extruders",
            `return (${expression});`,
          );
          expect(compatible(model, [diameter], extruders)).toBe(expected);
        }
      }
    },
  );
});
