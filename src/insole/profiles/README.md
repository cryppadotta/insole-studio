# Complete project configuration snapshots

These assets let the static website write a self-contained PrusaSlicer 2.9.2
project without relying on presets installed on the receiving computer.

`mk4s-standard-0.4-prusa292.ini` is a full 366-key configuration serialized by
PrusaSlicer 2.9.2, with resolved Original Prusa MK4S **standard-flow 0.4 mm**
machine settings and the existing Insole Studio TPU Air starting settings.
It contains no physical printer connection, credentials, personal filesystem
paths, or post-processing commands. The custom bed model/texture fields are
empty so the exported project does not rely on files on its author's computer.

Machine provenance: official `PrusaResearch.ini`, vendor configuration version
**2.2.7**, bundled with PrusaSlicer 2.9.2. The resolved preset is
`Original Prusa MK4S 0.4 nozzle` (including inherited presets), with
`printer_model = MK4S`, `printer_variant = 0.4`, `nozzle_high_flow = 0`,
250 × 210 mm bed, and 220 mm maximum height. Its `start_gcode`, `end_gcode`,
`before_layer_gcode`, and `layer_gcode` were compared byte for byte to the
resolved official preset and match. Machine limits, homing, nozzle/model
checks, mesh leveling, purge, and shutdown are retained.

Official versioned profile sources (both have the hash below):
<https://github.com/prusa3d/PrusaSlicer/blob/version_2.9.2/resources/profiles/PrusaResearch.ini>
<https://github.com/prusa3d/PrusaSlicer-settings-prusa-fff/blob/main/PrusaResearch/2.2.7.ini>

Bundled official profile SHA-256:
`79b588aedd3dc198b03aaf2e2a0d747186425f1e121c0ef6deea772cba3f927f`

## Upstream license and changes

The Prusa Research configuration and G-code portions come from the official
PrusaSlicer 2.9.2 source distribution, which is distributed under the GNU
Affero General Public License, version 3. The upstream license is included
verbatim in [PrusaSlicer-AGPL-3.0.txt](./PrusaSlicer-AGPL-3.0.txt).
It applies to those upstream portions and their modified profile snapshot;
their upstream license is retained separately from any license for original
Insole Studio material.

Upstream license source:
<https://github.com/prusa3d/PrusaSlicer/blob/version_2.9.2/LICENSE>

Insole Studio changes, 2026-10-29: resolved inherited machine settings into one
portable configuration, removed machine-specific connection and filesystem
references, selected text G-code output, set descriptive preset names, and
overlaid the separately documented Insole Studio material/print starting
values. The full editable modified snapshot is included alongside this
notice. Machine startup, shutdown, and layer G-code remain unchanged.

## Studio preset overlays

Intentional differences from the official machine defaults are ordinary text
G-code output (`binary_gcode = 0`) and default print/filament preset names that
point to the selected Insole Studio settings. The machine scripts are unchanged.

`tpu-air-85a-250c.ini` and `tpu-air-95a-250c.ini` are snapshots of the **250°C
foam** filament section and shared print section of the matching public
`public/downloads/siraya-tpu-air-*-prusa292-starting-profiles.ini` bundles.
Tests compare those snapshots with the public bundles to prevent drift. The
builder overlays them onto the resolved configuration, sets all three preset
names, and emits native `; key = serialized-value` lines for
`Metadata/Slic3r_PE.config`. Escaped newlines in machine scripts remain escaped.

These are calibration starting points, not manufacturer-certified presets.
Both use a 40°C bed, a 2 mm³/s volumetric limit, and filament retraction disabled.
Air 85A uses a 0.675 extrusion multiplier; Air 95A uses 0.65. The regular flow
command remains M221 S100 because the material multiplier is applied by the
slicer. Density-region settings are carried separately in the project and
override the global infill defaults.

Material reference:
<https://siraya.tech/blogs/news/foaming-tpu-filament-guide>
