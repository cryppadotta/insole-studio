import { strToU8, zipSync } from "fflate";
import type { BufferGeometry } from "three";
import { buildDensityModifiers, type DensityModifier } from "./density";
import {
  binarySTL,
  buildInsoleGeometry,
  clampParams,
  type InsoleParams,
} from "./model";

type Foot = "left" | "right";

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
      name: `${modifier.name} · ${modifier.infill}% · ${modifier.scope}`,
      geometry: modifier.geometry,
      modifier,
    })),
  ];
}

function disposeVolumes(volumes: ExportVolume[]) {
  for (const volume of volumes) volume.geometry.dispose();
}

/**
 * A design 3MF with PrusaSlicer 2.9.x volume metadata. Each modifier is a
 * nonprinting ParameterModifier, rather than an extra printable part.
 *
 * Format: PrusaSlicer src/libslic3r/Format/3mf.cpp (_add_model_config_file_to_archive).
 * Its PrintApply.cpp chains modifiers in stored order: the last override wins.
 * No full print configuration is embedded, so printer, filament, shell, and
 * temperature choices remain with the user's existing slicer profile.
 */
export function prusaProject(
  params: InsoleParams,
  side: Foot,
  name = "Insole Studio",
): Uint8Array {
  const p = clampParams(params);
  const volumes = exportVolumes(p, side, name);
  try {
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
            fillPattern(modifier.infill, p.density.pattern),
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
<metadata name="Description">Insole Studio density design. PrusaSlicer 2.9.x modifier metadata; select your own printer and calibrated filament profile.</metadata>
<resources><object id="1" type="model"><mesh>
<vertices>${vertices.join("\n")}</vertices>
<triangles>${triangles.join("\n")}</triangles>
</mesh></object></resources>
<build><item objectid="1" printable="1"/></build>
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
        "[Content_Types].xml": strToU8(CONTENT_TYPES),
        "_rels/.rels": strToU8(RELATIONSHIPS),
        "3D/3dmodel.model": strToU8(model),
        "Metadata/Slic3r_PE_model.config": strToU8(config),
        "Metadata/InsoleStudio-density.json": strToU8(
          JSON.stringify(densityManifest(p, side, volumes), null, 2),
        ),
        "Metadata/InsoleStudio-README.txt": strToU8(
          instructions(p, side, volumes),
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

function densityManifest(p: InsoleParams, side: Foot, volumes: ExportVolume[]) {
  return {
    format: "insole-studio-density-v1",
    units: "millimeter",
    side,
    solid: `insole-${side}-mm.stl`,
    base: {
      fill_density: `${p.density.baseInfill}%`,
      fill_pattern: fillPattern(p.density.baseInfill, p.density.pattern),
    },
    precedence:
      "Later modifiers override earlier ones in overlaps. Custom zones follow arch, heel, and pads.",
    containsPrinterOrFilamentProfile: false,
    modifiers: volumes.slice(1).map((volume, index) => {
      const { geometry: _geometry, ...region } = volume.modifier!;
      return {
        ...region,
        file: modifierFilename(volume, index + 1),
        priority: index + 1,
        fill_density: `${region.infill}%`,
        fill_pattern: fillPattern(region.infill, p.density.pattern),
        volume_type: "ParameterModifier",
      };
    }),
  };
}

function instructions(p: InsoleParams, side: Foot, volumes: ExportVolume[]) {
  const manifest = densityManifest(p, side, volumes);
  return `INSOLE STUDIO — ${side.toUpperCase()} INSOLE DENSITY DESIGN

The insole is the one printable solid. All region meshes are NONPRINTING setting modifiers.
Infill percentage is a slicer setting, not a measurement of material density, Shore hardness, or compression.

PREFERRED: PRUSASLICER 2.9.x 3MF
1. Use the separate PrusaSlicer 3MF download from Insole Studio and import/open it in PrusaSlicer 2.9.x.
2. This design file contains per-object/region infill overrides, without a printer or filament preset.
   Keep/select your own printer and calibrated Siraya Tech Flex TPU Air filament profile.
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
- No printer, temperatures, extrusion multiplier, foaming ratio, speeds, or G-code are supplied.
  Calibrate the active foaming material on your printer before comparing physical softness.

Official modifier workflow: https://help.prusa3d.com/article/modifiers_1767
Format baseline: https://github.com/prusa3d/PrusaSlicer/blob/version_2.9.0/src/libslic3r/Format/3mf.cpp
`;
}

/** A transparent, manually importable alternative for slicers that skip 3MF settings. */
export function modifierBundle(
  params: InsoleParams,
  side: Foot,
  name = "Insole Studio",
): Uint8Array {
  const p = clampParams(params);
  const volumes = exportVolumes(p, side, name);
  try {
    const files: Record<string, Uint8Array> = {
      [`insole-${side}-mm.stl`]: new Uint8Array(binarySTL(volumes[0].geometry)),
      "settings.json": strToU8(
        JSON.stringify(densityManifest(p, side, volumes), null, 2),
      ),
      "README.txt": strToU8(instructions(p, side, volumes)),
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
