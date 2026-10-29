import { strToU8, zipSync } from "fflate";
import type { BufferGeometry } from "three";
import { buildDensityModifiers, type DensityModifier } from "./density";
import {
  binarySTL,
  buildInsoleGeometry,
  clampParams,
  type InsoleParams,
} from "./model";
import { MK4S_BED, planBedPlacement, type PlacementMode } from "./placement";
import {
  DEFAULT_MATERIAL_GRADE,
  TPU_AIR_MATERIALS,
  type MaterialGrade,
} from "./materials";
import { buildCompletePrintConfig } from "./printConfig";
import { airTemperatureSettings, regionalTemperaturePlan } from "./temperature";
import printerProfileLicense from "./profiles/PrusaSlicer-AGPL-3.0.txt?raw";

type Foot = "left" | "right";
export type PrusaProfileMode = "complete" | "design";

export interface PrusaProjectOptions {
  /** Rotate and center the complete insole on an MK4/S bed at its original size. */
  placement?: PlacementMode;
  /** Requested XY model-to-bed margin, from 0 to 10 mm. Default: 3 mm. */
  clearance?: number;
  /** Complete MK4S project by default; design mode omits global slicer presets. */
  profileMode?: PrusaProfileMode;
  /** Applied in complete projects, and recorded as a reminder in design exports. */
  materialGrade?: MaterialGrade;
  /** Explicitly export infill at one temperature while retaining unapplied regional targets. */
  regionalTemperatureMode?: "uniform" | "targets-only";
}

type ProjectPlacement =
  | { mode: "original"; scale: 1 }
  | ({
      mode: "mk4s";
      scale: 1;
      target: "Original Prusa MK4 / MK4S";
      bed: typeof MK4S_BED;
    } & ReturnType<typeof planBedPlacement>);

/** PrusaSlicer does not support gyroid at exactly 100% infill. */
function fillPattern(
  infill: number,
  pattern: InsoleParams["density"]["pattern"],
) {
  return infill === 100 ? "rectilinear" : pattern;
}

function xml(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
    .replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[character]!,
    );
}

function metadata(
  type: "object" | "volume",
  key: string,
  value: string | number,
) {
  return `<metadata type="${type}" key="${key}" value="${xml(String(value))}"/>`;
}

interface ExportVolume {
  name: string;
  geometry: BufferGeometry;
  modifier?: DensityModifier;
}

const HEADER = '<?xml version="1.0" encoding="UTF-8"?>';
// This is the oldest supported reader contract, not the installed slicer version.
// A newer Application version plus an intentionally absent global print config
// triggers a misleading "Configuration was not loaded" warning in older 2.9.x GUIs.
const PRUSA_3MF_COMPATIBILITY_VERSION = "2.9.0";
const CONTENT_TYPES = `${HEADER}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
<Default Extension="config" ContentType="application/xml"/>
<Default Extension="txt" ContentType="text/plain"/>
<Default Extension="json" ContentType="application/json"/>
</Types>`;
const RELATIONSHIPS = `${HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

function exportVolumes(
  p: InsoleParams,
  side: Foot,
  name: string,
): ExportVolume[] {
  return [
    {
      name: `${name} · ${side} insole`,
      geometry: buildInsoleGeometry(p, side, 160),
    },
    ...buildDensityModifiers(p, side).map((modifier) => ({
      name: `${modifier.name} · ${modifier.infill}% · ${modifier.scope} · ${fillPattern(modifier.infill, modifier.pattern)} · target ${modifier.temperature}C (not applied)`,
      geometry: modifier.geometry,
      modifier,
    })),
  ];
}

function disposeVolumes(volumes: ExportVolume[]) {
  for (const volume of volumes) volume.geometry.dispose();
}

/**
 * A 3MF with PrusaSlicer 2.9.x volume metadata. Each modifier is a
 * nonprinting ParameterModifier, rather than an extra printable part.
 *
 * Format: PrusaSlicer src/libslic3r/Format/3mf.cpp (_add_model_config_file_to_archive).
 * Its PrintApply.cpp chains modifiers in stored order: the last override wins.
 * Complete mode includes a resolved MK4S standard 0.4 mm configuration.
 * Design mode contains only the solid and local infill settings.
 */
export function prusaProject(
  params: InsoleParams,
  side: Foot,
  name = "Insole Studio",
  options: PrusaProjectOptions = {},
): Uint8Array {
  const profileMode = options.profileMode ?? "complete";
  const materialGrade =
    options.materialGrade ??
    (profileMode === "complete" ? DEFAULT_MATERIAL_GRADE : undefined);
  if (profileMode === "complete" && options.placement === "original") {
    throw new Error(
      "Complete MK4S projects require MK4S bed placement. Choose design only to use original coordinates with your own printer presets.",
    );
  }
  const p = clampParams(params);
  if (
    regionalTemperaturePlan(p).mixed &&
    options.regionalTemperatureMode !== "targets-only"
  ) {
    throw new Error(
      `PrusaSlicer modifiers cannot apply regional temperatures. This design has targets that differ from the whole-insole ${p.density.temperature}°C setting. Save the editable design, or explicitly export infill at one whole-insole temperature with regional targets saved as notes.`,
    );
  }
  const volumes = exportVolumes(p, side, name);
  try {
    // Only the printable solid determines fit. Modifiers intentionally extend
    // outside it, but every volume shares the same rigid build-item transform.
    const placement: ProjectPlacement =
      (options.placement ?? "mk4s") === "original"
        ? { mode: "original", scale: 1 }
        : {
            mode: "mk4s",
            target: "Original Prusa MK4 / MK4S",
            bed: MK4S_BED,
            scale: 1,
            ...planBedPlacement(volumes[0].geometry, options.clearance),
          };
    if (placement.mode === "mk4s" && !placement.fits) {
      throw new Error(
        `This insole cannot fit the Prusa MK4/S 250 × 210 mm bed at 100% scale with ${placement.requiredClearance} mm edge clearance. Its best rotated footprint is ${placement.size.width.toFixed(1)} × ${placement.size.depth.toFixed(1)} mm. Choose original coordinates for a larger printer, or adjust the insole dimensions; the export never shrinks your design.`,
      );
    }
    const buildTransform =
      placement.mode === "mk4s" ? ` transform="${placement.transform3mf}"` : "";
    const vertices: string[] = [];
    const triangles: string[] = [];
    const settings: string[] = [];
    let vertexOffset = 0;
    for (const volume of volumes) {
      const geometry = volume.geometry;
      const position = geometry.getAttribute("position");
      const index = geometry.getIndex();
      for (let i = 0; i < position.count; i++) {
        const coordinate = [
          position.getX(i),
          position.getY(i),
          position.getZ(i),
        ];
        if (!coordinate.every(Number.isFinite))
          throw new Error("Cannot export non-finite geometry");
        vertices.push(
          `<vertex x="${coordinate[0]}" y="${coordinate[1]}" z="${coordinate[2]}"/>`,
        );
      }
      const first = triangles.length;
      const count = index ? index.count : position.count;
      for (let i = 0; i < count; i += 3) {
        const a = vertexOffset + (index ? index.getX(i) : i);
        const b = vertexOffset + (index ? index.getX(i + 1) : i + 1);
        const c = vertexOffset + (index ? index.getX(i + 2) : i + 2);
        triangles.push(`<triangle v1="${a}" v2="${b}" v3="${c}"/>`);
      }
      vertexOffset += position.count;
      const modifier = volume.modifier;
      settings.push(
        `<volume firstid="${first}" lastid="${triangles.length - 1}">`,
        metadata("volume", "name", volume.name),
        metadata(
          "volume",
          "volume_type",
          modifier ? "ParameterModifier" : "ModelPart",
        ),
      );
      if (modifier) {
        settings.push(
          metadata("volume", "modifier", "1"),
          metadata("volume", "fill_density", `${modifier.infill}%`),
          metadata(
            "volume",
            "fill_pattern",
            fillPattern(modifier.infill, modifier.pattern),
          ),
        );
      }
      settings.push("</volume>");
    }

    // Keep the compatibility marker at the supported format baseline. It also
    // selects the legacy volume-aware reader in PrusaSlicer 3 previews.
    // Designer identifies the actual producer of this design/settings file.
    const model = `${HEADER}
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">
<metadata name="slic3rpe:Version3mf">1</metadata>
<metadata name="Application">PrusaSlicer-${PRUSA_3MF_COMPATIBILITY_VERSION}</metadata>
<metadata name="Designer">Insole Studio</metadata>
<metadata name="Title">${xml(`${name} · ${side} insole`)}</metadata>
<metadata name="Description">${profileMode === "complete" ? "Insole Studio complete MK4S standard 0.4 mm project with TPU Air starting settings." : "Insole Studio density design; select your own printer and calibrated filament profile."}</metadata>
<resources><object id="1" type="model"><mesh>
<vertices>${vertices.join("\n")}</vertices>
<triangles>${triangles.join("\n")}</triangles>
</mesh></object></resources>
<build><item objectid="1" printable="1"${buildTransform}/></build>
</model>`;
    const config = `${HEADER}
<config><object id="1" instances_count="1">
${metadata("object", "name", `${name} · ${side} insole`)}
${metadata("object", "fill_density", `${p.density.baseInfill}%`)}
${metadata("object", "fill_pattern", fillPattern(p.density.baseInfill, p.density.pattern))}
${settings.join("\n")}
</object></config>`;
    return zipSync(
      {
        "[Content_Types].xml": strToU8(
          profileMode === "complete"
            ? CONTENT_TYPES.replace(
                "</Types>",
                '<Override PartName="/Metadata/Slic3r_PE.config" ContentType="text/plain"/>\n</Types>',
              )
            : CONTENT_TYPES,
        ),
        "_rels/.rels": strToU8(RELATIONSHIPS),
        "3D/3dmodel.model": strToU8(model),
        "Metadata/Slic3r_PE_model.config": strToU8(config),
        ...(profileMode === "complete"
          ? {
              "Metadata/Slic3r_PE.config": strToU8(
                buildCompletePrintConfig(materialGrade!, p.density.temperature),
              ),
              "Metadata/PrusaSlicer-AGPL-3.0.txt": strToU8(
                printerProfileLicense,
              ),
            }
          : {}),
        "Metadata/InsoleStudio-density.json": strToU8(
          JSON.stringify(
            densityManifest(
              p,
              side,
              volumes,
              placement,
              materialGrade,
              profileMode,
            ),
            null,
            2,
          ),
        ),
        "Metadata/InsoleStudio-README.txt": strToU8(
          instructions(p, side, volumes, placement, materialGrade, profileMode),
        ),
      },
      { level: 6 },
    );
  } finally {
    disposeVolumes(volumes);
  }
}

function slug(value: string) {
  return (
    value
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "region"
  );
}

function modifierFilename(volume: ExportVolume, index: number) {
  return `modifiers/${String(index).padStart(2, "0")}-${slug(volume.modifier!.name)}-${volume.modifier!.infill}pct.stl`;
}

function densityManifest(
  p: InsoleParams,
  side: Foot,
  volumes: ExportVolume[],
  placement?: ProjectPlacement,
  materialGrade?: MaterialGrade,
  profileMode: PrusaProfileMode = "design",
) {
  return {
    format: "insole-studio-density-v1",
    units: "millimeter",
    side,
    solid: `insole-${side}-mm.stl`,
    base: {
      fill_density: `${p.density.baseInfill}%`,
      fill_pattern: fillPattern(p.density.baseInfill, p.density.pattern),
      temperature_target_c: p.density.temperature,
    },
    temperaturePlan: {
      ...regionalTemperaturePlan(p),
      wholeInsoleTemperatureApplied: profileMode === "complete",
      limitation:
        "PrusaSlicer modifiers apply infill and pattern, not nozzle temperature. Regional temperatures are saved targets only. The complete project uses one whole-insole temperature with matched starting flow.",
    },
    precedence:
      "Later modifiers override earlier ones in overlaps. Custom zones follow arch, heel, and pads.",
    containsPrinterOrFilamentProfile: profileMode === "complete",
    profileMode,
    ...(materialGrade
      ? {
          material: {
            grade: materialGrade,
            name: TPU_AIR_MATERIALS[materialGrade].label,
            profileDownload: TPU_AIR_MATERIALS[materialGrade].profileFilename,
            source: TPU_AIR_MATERIALS[materialGrade].guideUrl,
            appliedToSlicer: profileMode === "complete",
            ...airTemperatureSettings(materialGrade, p.density.temperature),
          },
        }
      : {}),
    ...(placement ? { placement } : {}),
    modifiers: volumes.slice(1).map((volume, index) => {
      const { geometry: _geometry, ...region } = volume.modifier!;
      return {
        ...region,
        file: modifierFilename(volume, index + 1),
        priority: index + 1,
        fill_density: `${region.infill}%`,
        fill_pattern: fillPattern(region.infill, region.pattern),
        temperature_target_c: region.temperature,
        temperature_applied: false,
        volume_type: "ParameterModifier",
      };
    }),
  };
}

function instructions(
  p: InsoleParams,
  side: Foot,
  volumes: ExportVolume[],
  placement?: ProjectPlacement,
  materialGrade?: MaterialGrade,
  profileMode: PrusaProfileMode = "design",
) {
  const manifest = densityManifest(p, side, volumes);
  const thermal = materialGrade
    ? airTemperatureSettings(materialGrade, p.density.temperature)
    : null;
  const placementInstructions = placement
    ? placement.mode === "mk4s"
      ? `\nMK4 / MK4S BED PLACEMENT\nThis ${side} insole is rotated ${placement.rotationDegrees.toFixed(2)} degrees around Z and centered on the\n250 x 210 mm MK4/S bed, at 100% scale. Its printable footprint is\n${placement.size.width.toFixed(2)} x ${placement.size.depth.toFixed(2)} mm, with ${placement.clearance.toFixed(2)} mm minimum XY edge clearance\n(requested model-to-bed margin: ${placement.requiredClearance} mm).\nThe one parent build item carries the transformation; all density modifiers move with the solid.\nEach foot is fitted independently. The other foot is a separate project, not a second insole on this bed.\nKeep this whole-parent placement when opening the project. Brim, skirt, and purge features need\nadditional space: check your selected printer and sliced Preview before printing.\n${profileMode === "complete" ? "The complete project includes the MK4S standard 0.4 mm printer and selected TPU Air starting presets." : "The target is placement information only; no printer or filament preset is embedded."}\n`
      : `\nORIGINAL COORDINATES\nThis ${side} insole retains its original design coordinates at 100% scale. No bed placement is applied.\nRotate and position the whole parent insole on your selected printer bed; its density modifiers\nmust move with it. Each foot is a separate project.\n`
    : "";
  return `INSOLE STUDIO — ${side.toUpperCase()} INSOLE DENSITY DESIGN

The insole is the one printable solid. All region meshes are NONPRINTING setting modifiers.
Infill percentage is a slicer setting, not a measurement of material density, Shore hardness, or compression.
${placementInstructions}
${materialGrade ? `\nMATERIAL CHOICE\n${TPU_AIR_MATERIALS[materialGrade].label} (active foaming).\n${profileMode === "complete" ? `The complete project applies one whole-insole temperature of ${thermal!.temperature} C and starting extrusion multiplier ${thermal!.multiplier}, alongside the MK4S standard 0.4 mm machine and 0.20 mm print presets.` : `This is a material reminder, not an applied filament preset. Import the matching ${TPU_AIR_MATERIALS[materialGrade].profileFilename} bundle and select your calibrated preset in PrusaSlicer.`}\n${thermal!.interpolated ? "Starting flow is interpolated between the manufacturer's grade-specific guide points." : "Starting flow is a midpoint of the manufacturer's grade-specific guide range."}\nReference starting extrusion multiplier ${thermal!.multiplier} at ${thermal!.temperature} C.\nLeave printer flow at 100%. Recalibrate for your spool; do not use Air settings for non-foaming TPU.\nThe separate downloadable preset bundle still contains its named 240 C and 250 C starters.\nManufacturer guide: ${TPU_AIR_MATERIALS[materialGrade].guideUrl}\n` : ""}

TEMPERATURE TARGETS
Whole-insole target: ${p.density.temperature} C (default 250 C).
${profileMode === "complete" ? "The complete project applies this one temperature to the entire insole." : "This design-only export does not apply a filament temperature; select your calibrated profile."}
Regional temperature targets are saved in the accompanying JSON only. PrusaSlicer 2.9.x
modifier volumes cannot apply nozzle temperature or extrusion multiplier. Infill and
pattern settings DO apply per region. No per-region temperature keys or temperature-changing
G-code are included. Different temperature targets require a separate experimental printing
workflow, not just opening this 3MF. Our sequential cylinder method does not transfer to a
single connected insole. Do not assume saved regional targets will print at those temperatures.
${manifest.modifiers.map((region) => `- ${region.name}: target ${region.temperature} C (not applied)`).join("\n")}

PREFERRED: PRUSASLICER 2.9.x 3MF
1. Use the separate PrusaSlicer 3MF download from Insole Studio and import/open it in PrusaSlicer 2.9.x.
2. ${profileMode === "complete" ? "Choose Open as project to load the included MK4S standard 0.4 mm printer, selected TPU Air filament, and 0.20 mm print settings. Loading geometry only skips those presets. Verify that your physical nozzle is the standard 0.4 mm type and inspect Preview before printing." : "This design file contains per-object/region infill overrides, without a printer or filament preset. Keep/select your own printer and calibrated Siraya Tech Flex TPU Air filament profile."}
3. Switch to Expert mode and expand the insole in the right-hand Object list. It should contain
   one model part followed by setting modifiers. Select a modifier to see its translucent volume
   on the bed; expand the modifier and select its Infill child row to inspect Fill density and Fill pattern.
   Confirm every region has a modifier icon, its intended Fill density, and its position.
   If regions appear as printable parts, stop and use the manual workflow below.
4. Slice, then inspect Preview at multiple layer heights to confirm the requested infill regions.
   PrusaSlicer 3 previews and other slicers may interpret this 2.9.x format differently.

MANUAL STL MODIFIER WORKFLOW (use the STL modifier ZIP download; its settings.json lists every value)
1. Enable Expert mode. Import insole-${side}-mm.stl as the single printable model, using millimeters.
2. Right-click the insole in the Object list. Add settings > Infill; set Fill density to ${manifest.base.fill_density}
   and Fill pattern to ${manifest.base.fill_pattern} at the object level.
3. In the numbered order below, right-click the same insole > Add modifier > Load.
   Select that region's STL. Add it as a modifier, never as a standalone printable object.
   These meshes use the same original coordinate system as the insole: retain their relative positions.
   Do not center, place on bed, rotate, or scale modifiers individually.
4. For each modifier, right-click it (or its gear icon) > Infill, then set Fill density and Fill pattern:
${manifest.modifiers.length ? manifest.modifiers.map((region) => `   ${region.priority}. ${region.file}: ${region.fill_density}, ${region.fill_pattern}; ${region.scope} scope`).join("\n") : "   No local overrides. The object-level infill applies everywhere."}
5. Inspect alignment and slice Preview before printing. Later modifiers take priority in overlaps.
   Full scope affects the entire height in the footprint; base scope extends up to z=${p.baseThickness} mm;
   support scope starts above z=${p.baseThickness} mm. Only intersection with the insole is affected.
6. Select File > Save Project as to retain the modifier setup as your own .3mf project.

WHAT IS AND IS NOT CONTROLLED
- 100% regions use rectilinear (PrusaSlicer does not support gyroid at 100%).
- Perimeters and top/bottom solid layers remain controlled by your slicer profile. Thin areas may
  contain only solid skin, so lower sparse infill may have little effect there. Inspect Preview.
- Infill boundaries are discrete. The modifier regions do not blend densities continuously.
- ${profileMode === "complete" ? "The included printer, temperature, extrusion multiplier, speeds and shell settings are calibration starting values. No sliced G-code is supplied; slice and inspect the result in PrusaSlicer. Save a new project after making calibration changes." : "No printer, temperatures, extrusion multiplier, foaming ratio, speeds, or G-code are supplied."}
  Calibrate the active foaming material on your printer before comparing physical softness.

Official modifier workflow: https://help.prusa3d.com/article/modifiers_1767
Format baseline: https://github.com/prusa3d/PrusaSlicer/blob/version_2.9.0/src/libslic3r/Format/3mf.cpp
${profileMode === "complete" ? "\nPRINTER PROFILE SOURCE AND LICENSE\nThe machine configuration derives from Prusa Research's PrusaSlicer 2.9.2 profiles.\nInsole Studio adds the TPU Air starting presets and removes local connection and bed-file paths.\nThe upstream AGPL-3.0 license is included as Metadata/PrusaSlicer-AGPL-3.0.txt.\nFull configuration source and modification notes: https://github.com/cryppadotta/insole-studio/tree/main/src/insole/profiles\nUpstream source: https://github.com/prusa3d/PrusaSlicer/tree/version_2.9.2/resources/profiles\n" : ""}
`;
}

/** A transparent, manually importable alternative for slicers that skip 3MF settings. */
export function modifierBundle(
  params: InsoleParams,
  side: Foot,
  name = "Insole Studio",
  options: Pick<PrusaProjectOptions, "materialGrade"> = {},
): Uint8Array {
  const p = clampParams(params);
  const volumes = exportVolumes(p, side, name);
  try {
    const files: Record<string, Uint8Array> = {
      [`insole-${side}-mm.stl`]: new Uint8Array(binarySTL(volumes[0].geometry)),
      "settings.json": strToU8(
        JSON.stringify(
          densityManifest(p, side, volumes, undefined, options.materialGrade),
          null,
          2,
        ),
      ),
      "README.txt": strToU8(
        instructions(p, side, volumes, undefined, options.materialGrade),
      ),
    };
    volumes.slice(1).forEach((volume, index) => {
      files[modifierFilename(volume, index + 1)] = new Uint8Array(
        binarySTL(volume.geometry),
      );
    });
    return zipSync(files, { level: 6 });
  } finally {
    disposeVolumes(volumes);
  }
}
