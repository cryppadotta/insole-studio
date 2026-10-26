# Insole density and PrusaSlicer

The editor keeps **shape**, **local infill**, and **material foaming** separate.

An STL holds the closed exterior shape. It does not carry local infill percentages. The preferred export is a **PrusaSlicer 3MF** containing one printable insole and non-printing parameter modifiers. Each modifier changes settings where its volume intersects the insole. [Prusa's modifier guide](https://help.prusa3d.com/article/modifiers_1767).

## Configure the insole

1. In **Add your support**, enable **Custom arch/heel/pad infill** to give an existing support its own percentage. Its modifier follows the support's position, size and rotation.
2. In **Tune the cushion**, choose the base infill and Gyroid or Rectilinear pattern. Add heel, forefoot, or custom regions to tune other areas without changing the surface shape. Each region can be an ellipse or rectangle, with independent position, size, rotation and infill.
3. Choose the vertical extent: **Full thickness** includes both base and raised surface; **Base only** ends at the base-thickness plane; **Support above the base** starts above that plane.
4. Inspect the plan footprints and requested-infill colors. Custom regions have draggable centers. Colors are a settings preview, not a compression simulation; base-only regions may be visible on the underside rather than the top surface.

Overrides are absolute percentages, not summed contributions. Priority is arch → heel → pads in their current order → custom regions in their order. The last matching modifier wins. Move a custom region later in its list to increase its priority. A disabled pad also disables its linked density modifier. Turning off a density override restores inherited base infill.

## Export and slice

1. Choose **Export 3MF**, keep **PrusaSlicer 3MF** selected, and download the current foot or both feet.
2. Open/import the file in PrusaSlicer. The object list should show one printable insole and its parameter modifiers, labeled with their percentages and vertical scopes.
3. Select your printer and calibrated **Siraya Flex TPU Air 95A** filament settings. This design export does not supply or replace your printer, temperature, extrusion multiplier, layer, or shell profiles.
4. Slice and inspect the toolpaths, particularly inside the base and where modifiers overlap. At exactly 100% infill, the export selects Rectilinear because Gyroid does not support 100% in PrusaSlicer.
5. Save the resulting PrusaSlicer project after choosing the printer and material settings.

**Modifier ZIP** is the manual fallback. It contains the solid STL, aligned modifier STLs, settings JSON and a README. Load the solid first, then use **Add modifier → Load** for each region and enter its supplied infill setting. Modifier STLs are not extra printable parts; retain their coordinates. **STL only** deliberately exports shape without density settings.

## Why low infill can still feel solid

Infill changes the internal structure, while perimeters and top/bottom solid layers still form solid shells. Thin or sloping areas may contain mostly shell, leaving little room for sparse infill. For example, three top and three bottom layers at 0.2 mm nominally consume 1.2 mm of thickness before other shell rules. Inspect the slice rather than judging from the percentage alone. [Prusa's shell settings](https://help.prusa3d.com/article/layers-and-perimeters_1748).

Infill percentage is not the finished part's mass fraction, foam density, Shore hardness, or a predicted compression. Pattern, shells, layer height, support shape and the foamed material all affect the result.

## Siraya Flex TPU Air 95A

This filament also changes through active foaming. Siraya's current **95A-specific** guide describes temperature-dependent expansion and reduced starting flow. Calibrate temperature and flow together on your printer, then hold them constant while comparing infill regions. The editor does not attempt to vary nozzle temperature by region.

Siraya lists 230–270°C with temperature-dependent starting flow roughly 50–90%; these are calibration references, not a ready-to-print profile. Use the 95A section rather than the separate 85A table. Small test coupons using the same shells and material settings provide a repeatable way to compare several infill values before printing a full pair. [Siraya's foaming TPU guide](https://siraya.tech/blogs/news/foaming-tpu-filament-guide).

## Verification

The export was checked with the official **PrusaSlicer 2.9.4** CLI in an isolated settings directory: left/right solids were manifold, modifiers did not become printable parts, settings survived a 3MF roundtrip, and slicing succeeded. Coincident-modifier control slices verified last-modifier precedence. Modifiers below Z=0 did not lift the solid off the bed. Automated tests also cover region scopes, rotations, mirroring, persistence and unchanged shape geometry.

This is a design/settings 3MF, not G-code. Final printer and material selection still belongs in the slicer.
