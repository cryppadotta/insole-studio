INSOLE STUDIO - SIRAYA TECH FLEX TPU AIR 85A
Calibration starting profiles, version 1
PrusaSlicer 2.9.2 | Original Prusa MK4 Input Shaper or MK4S | 0.4 mm nozzle

WHAT IS IN THE INI DOWNLOAD

File: siraya-tpu-air-85a-prusa292-starting-profiles.ini

Two new Filament presets:
  Insole Studio - Siraya TPU Air 85A - 240C firm START
    Nozzle 240 C for first and later layers; extrusion multiplier 0.875 (87.5%).
  Insole Studio - Siraya TPU Air 85A - 250C foam START
    Nozzle 250 C for first and later layers; extrusion multiplier 0.675 (67.5%).

One new Print Settings preset:
  Insole Studio - TPU Air - 0.20mm MK4 0.4 START

These are Insole Studio starting points for calibration. They are not official
Siraya or Prusa profiles, manufacturer certified settings, or physically tested
compression predictions. Use only for Flex TPU Air 85A active-foaming filament.
For Flex TPU Air 95A, use the separate 95A download and calibrate again.
Do not use these Air profiles for nonfoaming Flex TPU or Roamr TPU Air HR.

IMPORT AND SELECT

1. Select your existing official Original Prusa MK4 Input Shaper or MK4S
   0.4 nozzle printer preset that matches the actual machine and nozzle.
   This bundle adds no printer preset and changes no machine
   limits, start/end G-code, network settings, or existing named presets.
   Keep the official standard/high-flow nozzle choice and machine checks.
2. In PrusaSlicer, choose File > Import > Import Config Bundle.
3. Open the downloaded INI. Three presets are added under the names above.
4. Select the Insole Studio Print Settings preset, then select ONE of the two
   Filament presets. Keep your correct official printer selected.
   The print preset is shared with the 95A bundle; importing both bundles
   uses that same shared print preset and adds separate grade-named filaments.
5. Print a small calibration sample before a full insole. Start at 240 C for the
   firmer mode or compare the separate 250 C sample for more foaming. Calibrate
   extrusion multiplier at each temperature; inspect clean, bonded walls with
   neither gaps nor bulges. Save your measured settings under a new local name.
6. Open the Studio density 3MF. If Prusa asks how to open it, keep its object and
   modifier configuration. Select the print/filament presets again if needed.
   Object and modifier infill values take precedence over the print preset's
   default 20% gyroid. Check those values in the Object list before slicing.

COMMON FILAMENT SETTINGS

Bed 40 C. Part cooling 100% after the first two layers. Filament retraction
length and speed are zero; deretraction, toolchange retraction and wipe are also
disabled in the filament overrides. This disables normal slicing retractions,
but retains any machine preparation/purge movements in your official printer
start G-code. Maximum volumetric speed is 2 mm3/s. Filament diameter is 1.75 mm.
Raw-filament density is deliberately unspecified (zero), so mass estimates
are unavailable; weigh a sample rather than treating foam density as spool
material density.

Siraya's 85A-specific table suggests 85-90% flow at 230-240 C and 65-70% at
250 C. These presets use midpoints, not a calibration for your individual spool.
The manufacturer recommends a 30-45 C bed, full cooling and retraction off.
The 0.875 and 0.675 values are Prusa's extrusion multiplier: leave printer flow
at 100%, rather than applying the same reduction a second time on the printer.
Temperature/flow changes foaming. The Studio density regions change infill.
Neither setting alone establishes a printed insole's Shore hardness or comfort.

PRINT SETTINGS AND SHELLS

0.20 mm layers including the first layer; 0.45 mm extrusion widths.
2 perimeters; 3 top and 3 bottom layers; minimum 0.6 mm top and bottom thickness.
First layer 15 mm/s; external/small perimeters and top surfaces 20 mm/s;
perimeters and solid infill 25 mm/s; infill 30 mm/s; overall maximum 30 mm/s.
Normal acceleration 500 mm/s2, first layer 300 mm/s2, travel 700 mm/s2.
Supports, brim, wipe tower and sequential printing off. One skirt is enabled.

Those conservative speeds, acceleration, shell counts and the 2 mm3/s limit
are project choices for initial samples, not Siraya's published speed limits.
Solid skins and walls remain solid even in a low-infill region. In a thin base
they can occupy most of its thickness. Inspect internal layers in Preview;
compare small samples before changing shell counts for a full insole.

MATERIAL PREPARATION AND PRINTER

Keep this hygroscopic filament dry and use the manufacturer's drying/storage
guidance for your equipment. Protect PEI with an appropriate release layer and
let the sheet cool before removal. Follow Prusa's MK4/Nextruder idler-tension
instructions if feeding is unreliable; that mechanical adjustment is outside
a slicer preset. These presets target only the MK4 Input Shaper or MK4S,
single extruder, 0.4 mm nozzle. Make a separately calibrated copy for any other
printer or nozzle. Nothing in this download sends a print to a printer.

SOURCES AND MATERIAL LINKS

Siraya's grade-specific temperature/flow guide:
https://siraya.tech/blogs/news/foaming-tpu-filament-guide
Siraya TPU Air manual (verify the grade-specific flow table above):
https://siraya.tech/pages/siraya-tech-tpu-air-user-manual
Material (Flex TPU Air 85A, active foaming):
https://siraya.tech/products/flex-tpu-air-65a-82a-foaming-flexible-filament
Siraya's own print-setting downloads (verify material and printer match):
https://siraya.tech/pages/print-settings-download
Prusa flexible-material handling guidance:
https://help.prusa3d.com/article/flexible-materials_2057
Prusa MK4/Nextruder idler tension:
https://help.prusa3d.com/article/idler-screw-tension_177367
Prusa modifier regions:
https://help.prusa3d.com/article/modifiers_1767
Prusa shell settings:
https://help.prusa3d.com/article/layers-and-perimeters_1748

The Siraya foaming-material guidance takes precedence over generic TPU
cooling/temperature examples. These links have no affiliate parameters.
