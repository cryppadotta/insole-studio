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

1. Choose **Export 3MF**, keep **PrusaSlicer 3MF** and **Complete MK4S project** selected. Choose **Siraya Flex TPU Air 85A or 95A** to match the spool. Download the current foot or both feet; a pair produces two files intended for separate plates.
2. Use **File → Open Project** in PrusaSlicer **2.9.2 or later in the 2.9.x series**, and load the project settings. The object list should show one printable insole and its parameter modifiers, labeled with their percentages and vertical scopes. Importing only geometry does not load the embedded presets.
3. Check the selected **MK4S standard 0.4 mm nozzle** printer, the **0.20 mm** print preset and matching **Air 85A/95A 250°C foam START** filament preset. The complete project supplies printer, temperatures, extrusion multiplier, layers, shells and machine start/end G-code. It uses 2 perimeters and 0.6 mm top/bottom shells. These are calibration starting points; test temperature and flow on a small sample before a full insole.
4. Slice and inspect the toolpaths, particularly inside the base and where modifiers overlap. At exactly 100% infill, the export selects Rectilinear because Gyroid does not support 100% in PrusaSlicer.
5. Save the resulting PrusaSlicer project after tuning and confirming the printer and material settings.

The default complete 3MF export automatically rotates and centers each foot at **100% scale** on its included **250 × 210 mm MK4S bed**. **Bed edge clearance** starts at **3 mm** and can be adjusted from 0–10 mm between the printable insole's exterior and bed edges. Its density modifiers move with it. Verify the printer/nozzle choice and any skirt or brim before slicing. The MK4S's published build area is 250 × 210 × 220 mm. [Official MK4S specifications](https://www.prusa3d.com/product/original-prusa-mk4s-3d-printer-5/).

If the insole cannot fit with the chosen clearance, automatic export is blocked with feedback; it never scales the design down. For a tight fit, lower the clearance and inspect the skirt or brim in PrusaSlicer. To keep your own calibrated presets or use another printer, choose **Design only · use my presets**. That mode includes geometry and local infill overrides without global printer, print or filament profiles; the selected material is recorded as a note. For a different bed or manual placement, also choose **Original coordinates · manual placement**, then rotate and position the whole parent insole in PrusaSlicer so its modifiers follow together. Keep 100% scale and do not move modifier parts independently. Complete MK4S projects always use MK4S placement and fit checking. Exporting both feet produces two independent files, not a guarantee that the pair fits one plate.

The separate downloadable TPU calibration bundles supply print and filament presets for stock **MK4 Input Shaper / MK4S, single extruder, 0.4 mm nozzle** configurations and keep your own printer preset. They are separate from the complete 3MF's included MK4S standard 0.4 mm machine profile. A high-flow nozzle or another printer requires matching calibrated settings.

**Modifier ZIP** is the manual fallback. It contains the solid STL, aligned modifier STLs, settings JSON and a README. Load the solid first, then use **Add modifier → Load** for each region and enter its supplied infill setting. Modifier STLs are not extra printable parts; retain their coordinates. **STL only** deliberately exports shape without density settings.

### Inspect the density modifier volumes

Switch PrusaSlicer to **Expert** mode. In the right-hand **Object list**, expand the insole to reveal its model part and modifier children. The modifier names include the requested percentage and scope. Select a modifier to inspect its translucent volume on the bed, and select its **Infill** settings to view **Fill density** and **Fill pattern**. These volumes are non-printing settings regions, so they do not appear as additional printed objects in the sliced preview.

If no modifier children appear, confirm that the design actually has enabled local overrides in **Tune the cushion**, and export **PrusaSlicer 3MF** rather than **STL only**.

### PrusaSlicer 2.9.2 compatibility

An earlier export incorrectly used `PrusaSlicer-2.9.4` as its format compatibility marker. PrusaSlicer 2.9.2 displays **“Configuration was not loaded”** when it sees a newer marker in a design file without a global print profile. This warning was triggered by the marker, not unsupported infill modifiers. New exports target the existing **2.9.0 metadata format** and identify **Insole Studio** as the designer. Download a fresh 3MF from the updated site; upgrading PrusaSlicer is not required for this fix. [PrusaSlicer 2.9.2 loading logic](https://github.com/prusa3d/PrusaSlicer/blob/version_2.9.2/src/slic3r/GUI/Plater.cpp#L1410).

## Why low infill can still feel solid

Infill changes the internal structure, while perimeters and top/bottom solid layers still form solid shells. Thin or sloping areas may contain mostly shell, leaving little room for sparse infill. For example, three top and three bottom layers at 0.2 mm nominally consume 1.2 mm of thickness before other shell rules. Inspect the slice rather than judging from the percentage alone. [Prusa's shell settings](https://help.prusa3d.com/article/layers-and-perimeters_1748).

Infill percentage is not the finished part's mass fraction, foam density, Shore hardness, or a predicted compression. Pattern, shells, layer height, support shape and the foamed material all affect the result.

## Siraya Flex TPU Air 95A

This filament also changes through active foaming. Siraya's current **95A-specific** guide describes temperature-dependent expansion and reduced starting flow. Calibrate temperature and flow together on your printer, then hold them constant while comparing infill regions. The editor does not attempt to vary nozzle temperature by region.

Siraya lists 230–270°C with temperature-dependent starting flow roughly 50–90%; these are calibration references, not a ready-to-print profile. Use the 95A section rather than the separate 85A table. Small test coupons using the same shells and material settings provide a repeatable way to compare several infill values before printing a full pair. [Siraya's foaming TPU guide](https://siraya.tech/blogs/news/foaming-tpu-filament-guide).

## Verification

The corrected export was checked with the installed **PrusaSlicer 2.9.2** CLI in an isolated settings directory. A sample with 18% base infill and four modifiers (45% arch/support, 10% heel/full, 30% pad/base, and 8% rotated custom/full) remained manifold with one printable part. Every modifier type, order and infill setting survived a native 3MF roundtrip, and a complete diagnostic slice succeeded. The diagnostic G-code used generic test settings and is not a calibrated printer/material profile.

The desktop UI was also checked end to end: create a 270 mm insole in the browser, set a 20% base plus 45% arch, 35% pad, 12% heel and 40% forefoot modifiers, download its 3MF, and open it in the running **2.9.2** app. No newer-version warning appeared. All four modifiers were listed, selecting the forefoot's **Infill** row showed **40%**, and slicing on the MK4 bed succeeded after rotation and centering. Preview inside the base showed the different infill spacing. This checks model/settings transfer, not a calibrated TPU print profile.

Earlier checks with official **PrusaSlicer 2.9.4** verified both feet, coincident-modifier precedence, and modifiers below Z=0 without lifting the solid off the bed. Automated tests also cover the supported compatibility marker, region scopes, rotations, mirroring, persistence and unchanged shape geometry.

The 3MF remains an editable project, not G-code. Complete mode supplies starting printer, print and filament settings; design-only mode leaves global preset selection to the slicer. Inspect and slice in PrusaSlicer before printing.
