import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Footprints,
  Layers3,
  SlidersHorizontal,
  Thermometer,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  DEFAULT_MATERIAL_GRADE,
  isMaterialGrade,
  TPU_AIR_MATERIALS,
  type MaterialGrade,
} from "./materials";
import { readStudioPreferences, saveStudioPreferences } from "./project";
import "./prusa-guide.css";

const sources = {
  modifiers: "https://help.prusa3d.com/article/modifiers_1767",
  shells: "https://help.prusa3d.com/article/layers-and-perimeters_1748",
  flexible: "https://help.prusa3d.com/article/flexible-materials_2057",
};
const downloadBase = `${import.meta.env.BASE_URL}downloads/`;

function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children} <ExternalLink size={12} aria-hidden="true" />
    </a>
  );
}

function ChapterLink({ id, children }: { id: string; children: ReactNode }) {
  return (
    <a
      href="#/prusa"
      onClick={(event) => {
        event.preventDefault();
        document.getElementById(id)?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        });
        document.getElementById(id)?.focus({ preventScroll: true });
      }}
    >
      {children}
    </a>
  );
}

function DensityDiagram() {
  return (
    <figure className="prusa-region-figure">
      <svg
        viewBox="0 0 580 344"
        role="img"
        aria-labelledby="prusa-diagram-title prusa-diagram-description"
      >
        <title id="prusa-diagram-title">
          One insole, four density modifiers
        </title>
        <desc id="prusa-diagram-description">
          A schematic insole has a 12 percent heel region, 45 percent arch, 35
          percent metatarsal pad, and 40 percent forefoot. The matching Object
          list expands the forefoot modifier to reveal its Infill settings.
          These are illustrative percentages, not recommendations.
        </desc>
        <defs>
          <pattern
            id="prusa-grid"
            width="22"
            height="22"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M22 0H0V22"
              fill="none"
              stroke="#dce3d6"
              strokeWidth="0.65"
            />
          </pattern>
          <clipPath id="prusa-insole-clip">
            <path d="M98 300C65 296 62 273 65 247C68 215 75 183 68 153C60 120 50 82 69 52C81 32 113 20 145 23C181 26 203 41 206 65C209 91 185 117 174 141C160 170 157 198 157 227C158 260 158 291 137 299C126 304 109 304 98 300Z" />
          </clipPath>
        </defs>
        <rect width="580" height="344" rx="4" fill="#f1f4eb" />
        <rect x="15" y="15" width="224" height="314" fill="url(#prusa-grid)" />
        <g clipPath="url(#prusa-insole-clip)">
          <rect x="45" y="18" width="170" height="291" fill="#dbe7df" />
          <ellipse
            cx="115"
            cy="264"
            rx="59"
            ry="44"
            fill="#90b6c2"
            fillOpacity=".7"
            stroke="#538b9c"
            strokeWidth="1.3"
          />
          <ellipse
            cx="81"
            cy="178"
            rx="37"
            ry="69"
            transform="rotate(13 81 178)"
            fill="#ddb589"
            fillOpacity=".7"
            stroke="#ac7948"
            strokeWidth="1.3"
          />
          <rect
            x="63"
            y="64"
            width="145"
            height="72"
            rx="13"
            transform="rotate(-9 135 100)"
            fill="#b8bf89"
            fillOpacity=".75"
            stroke="#879153"
            strokeWidth="1.3"
          />
          <ellipse
            cx="130"
            cy="116"
            rx="33"
            ry="27"
            transform="rotate(-16 130 116)"
            fill="#c3998b"
            fillOpacity=".8"
            stroke="#9d6e5e"
            strokeWidth="1.3"
          />
        </g>
        <path
          d="M98 300C65 296 62 273 65 247C68 215 75 183 68 153C60 120 50 82 69 52C81 32 113 20 145 23C181 26 203 41 206 65C209 91 185 117 174 141C160 170 157 198 157 227C158 260 158 291 137 299C126 304 109 304 98 300Z"
          fill="none"
          stroke="#436957"
          strokeWidth="1.8"
        />
        <g
          fontFamily="IBM Plex Mono,monospace"
          fontSize="11"
          fill="#34483c"
          textAnchor="middle"
        >
          <text x="115" y="269">
            12%
          </text>
          <text x="90" y="183">
            45%
          </text>
          <text x="130" y="120">
            35%
          </text>
          <text x="158" y="82">
            40%
          </text>
        </g>
        <path
          d="M204 87H256V94H278"
          fill="none"
          stroke="#81917d"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        <circle cx="204" cy="87" r="3" fill="#879153" />
        <rect
          x="269"
          y="25"
          width="292"
          height="294"
          rx="5"
          fill="#fcfcf8"
          stroke="#d5ddcf"
        />
        <text
          x="287"
          y="49"
          fontFamily="IBM Plex Mono,monospace"
          fontSize="9"
          fill="#7b8974"
          letterSpacing="1.2"
        >
          OBJECT LIST
        </text>
        <path
          d="M287 70l4 4 4-4"
          fill="none"
          stroke="#526c59"
          strokeWidth="1.5"
        />
        <text x="307" y="77" fontSize="13" fontWeight="500" fill="#263b33">
          Right insole
        </text>
        <path
          d="M305 91v149M305 103h12M305 132h12M305 161h12M305 190h12M305 219h12"
          fill="none"
          stroke="#d4dcce"
        />
        <g fontSize="11.5" fill="#5f6f5c">
          <text x="326" y="107">
            Insole · printable part
          </text>
          <text x="326" y="136">
            Arch · 45% · support
          </text>
          <text x="326" y="165">
            Heel · 12% · full
          </text>
          <text x="326" y="194">
            Metatarsal pad · 35% · base
          </text>
        </g>
        <rect x="315" y="204" width="232" height="26" rx="3" fill="#e9eedc" />
        <path
          d="M321 215l3 3 3-3"
          fill="none"
          stroke="#66804d"
          strokeWidth="1.3"
        />
        <text x="335" y="221" fontSize="11.5" fill="#3b5945">
          Forefoot · 40% · full
        </text>
        <path d="M328 234v15h13" fill="none" stroke="#c5d0bc" />
        <text x="349" y="252" fontSize="11.5" fill="#3b5945">
          Infill
        </text>
        <path d="M287 267H543" stroke="#e2e6db" />
        <text x="287" y="289" fontSize="10.5" fill="#64715f">
          Fill density
        </text>
        <rect
          x="435"
          y="275"
          width="108"
          height="23"
          rx="3"
          fill="#f2f5ed"
          stroke="#d8dfd0"
        />
        <text
          x="448"
          y="291"
          fontFamily="IBM Plex Mono,monospace"
          fontSize="11"
          fill="#346b59"
        >
          40 %
        </text>
      </svg>
      <figcaption>
        Example only. Modifier volumes change infill inside the insole; they are
        not extra parts to print. Percentages do not predict compression.
      </figcaption>
    </figure>
  );
}

export default function PrusaGuide() {
  const [materialGrade, setMaterialGrade] = useState<MaterialGrade>(() => {
    const saved = readStudioPreferences().materialGrade;
    return isMaterialGrade(saved) ? saved : DEFAULT_MATERIAL_GRADE;
  });
  const material = TPU_AIR_MATERIALS[materialGrade];

  function selectMaterial(value: string) {
    if (!isMaterialGrade(value)) return;
    setMaterialGrade(value);
    saveStudioPreferences({
      ...readStudioPreferences(),
      materialGrade: value,
    });
  }

  return (
    <div className="insole-app prusa-guide">
      <header className="sole-header">
        <a href="#/insoles" className="sole-brand">
          <span className="sole-brand-mark">
            <Footprints size={25} strokeWidth={1.6} />
          </span>
          <strong>
            insole studio<span>PARAMETRIC INSOLE DESIGN</span>
          </strong>
        </a>
        <nav aria-label="Main navigation">
          <a href="#/insoles">Design studio</a>
          <a href="#/prusa" aria-current="page">
            Prusa guide
          </a>
        </nav>
        <a href="#/insoles" className="prusa-back-link">
          <ArrowLeft size={15} /> Back to your design
        </a>
      </header>

      <main>
        <section className="prusa-hero prusa-width">
          <div className="prusa-hero-copy">
            <p className="prusa-eyebrow">
              <BookOpen size={14} /> THE PRINT FIELD GUIDE / 01
            </p>
            <h1>
              From your design
              <br />
              to your <em>first print.</em>
            </h1>
            <p className="prusa-lead">
              Bring your insole into PrusaSlicer, inspect its density regions,
              and find a starting point for foaming TPU.
            </p>
            <div className="prusa-hero-actions">
              <ChapterLink id="prusa-import">
                Open the workflow <ArrowRight size={16} />
              </ChapterLink>
              <ChapterLink id="prusa-downloads">
                <ArrowDownToLine size={15} /> Starting profiles
              </ChapterLink>
            </div>
            <p className="prusa-compatibility">
              <Check size={13} /> Export verified with PrusaSlicer 2.9.2
            </p>
          </div>
          <DensityDiagram />
        </section>

        <nav className="prusa-chapters prusa-width" aria-label="Guide chapters">
          <ChapterLink id="prusa-import">
            <span>01</span> Import your design
          </ChapterLink>
          <ChapterLink id="prusa-inspect">
            <span>02</span> Inspect the regions
          </ChapterLink>
          <ChapterLink id="prusa-material">
            <span>03</span> Understand the material
          </ChapterLink>
          <ChapterLink id="prusa-downloads">
            <span>04</span> Profiles & downloads
          </ChapterLink>
        </nav>

        <section
          id="prusa-import"
          className="prusa-section prusa-width"
          tabIndex={-1}
        >
          <div className="prusa-section-heading">
            <span className="prusa-section-number">01 / PREPARE</span>
            <h2>
              Keep the shape.
              <br /> Bring the settings.
            </h2>
            <p>
              A 3MF carries the insole and its local infill modifiers together.
              An STL carries only the shape.
            </p>
            <SourceLink href={sources.modifiers}>
              Prusa’s modifier guide
            </SourceLink>
          </div>
          <div className="prusa-section-body">
            <ol className="prusa-steps">
              <li>
                <strong>Export a PrusaSlicer 3MF.</strong>
                <p>
                  In the studio, enable any local overrides in{" "}
                  <b>Tune the cushion</b>, choose <b>Export 3MF</b>, keep{" "}
                  <b>PrusaSlicer 3MF</b> and the default{" "}
                  <b>Complete MK4S project</b> selected. Choose the Air grade on
                  your spool. The project includes an MK4S standard 0.4 mm
                  printer, 0.20 mm print settings and the grade’s 250°C foam
                  starting filament preset. Download one foot, or both feet as
                  two files for separate plates.
                </p>
              </li>
              <li>
                <strong>Open it in PrusaSlicer.</strong>
                <p>
                  Use <b>File → Open Project</b> to open the downloaded{" "}
                  <code>.3mf</code> and load the project settings. The right
                  sidebar should show the MK4S standard 0.4 mm printer and
                  Insole Studio print and matching Air filament presets. Check
                  the nozzle matches your machine. Importing only geometry
                  leaves the project’s presets behind.
                </p>
              </li>
              <li>
                <strong>Check the automatic placement.</strong>
                <p>
                  Each foot arrives rotated and centered at <b>100% scale</b>,
                  with <b>3 mm bed edge clearance by default</b>. Adjust{" "}
                  <b>Bed edge clearance</b> from 0–10 mm for your fit. Its
                  modifiers move with it. The complete project includes the 250
                  × 210 mm MK4S bed. Check the bed outline, including any skirt
                  or brim, before slicing.
                </p>
              </li>
              <li>
                <strong>Slice, inspect, then save the project.</strong>
                <p>
                  Check the internal toolpaths before exporting G-code. The
                  included filament and print presets are calibration starting
                  points: test temperature and flow on a small sample, then save
                  a PrusaSlicer project with your tuned settings.
                </p>
              </li>
            </ol>
            <p className="prusa-fine-print">
              Using your own presets or another printer? Choose{" "}
              <b>Design only · use my presets</b>. This mode carries shape and
              local infill, with the material recorded as a note. For another
              bed, choose <b>Original coordinates · manual placement</b> and
              position the whole parent insole manually in PrusaSlicer so its
              modifiers stay aligned. Automatic placement blocks an insole that
              cannot fit with your chosen clearance; it never shrinks your
              design. For a very tight fit, lower the clearance and check that
              the insole and any skirt or brim stay inside the actual bed. Two
              downloaded feet are not arranged together on one plate.
            </p>
            <aside className="prusa-inline-note">
              <Layers3 size={19} />
              <p>
                <strong>3MF first. STL as a fallback.</strong>The Modifier ZIP
                contains aligned modifier STLs and manual settings. Load each
                through <b>Add modifier → Load</b> on the insole. Loading them
                as normal objects creates extra printable parts.
              </p>
            </aside>
          </div>
        </section>

        <section
          id="prusa-inspect"
          className="prusa-section prusa-width"
          tabIndex={-1}
        >
          <div className="prusa-section-heading">
            <span className="prusa-section-number">02 / LOOK INSIDE</span>
            <h2>
              Find the regions.
              <br /> See the difference.
            </h2>
            <p>
              The colored volumes describe where settings apply. The sliced
              toolpaths show what the printer will actually make.
            </p>
          </div>
          <div className="prusa-section-body">
            <div
              className="prusa-inspect-path"
              aria-label="Path to local infill settings"
            >
              <span>Advanced / Expert</span>
              <ChevronRight size={14} />
              <span>Object list</span>
              <ChevronRight size={14} />
              <span>Modifier</span>
              <ChevronRight size={14} />
              <strong>Infill</strong>
            </div>
            <ol className="prusa-steps">
              <li>
                <strong>Switch to Advanced or Expert mode.</strong>
                <p>
                  Use the mode selector at the upper right. Expand the insole in
                  the right-hand <b>Object list</b> using the small arrow beside
                  its name.
                </p>
              </li>
              <li>
                <strong>Select a modifier’s name.</strong>
                <p>
                  Look for the child rows named for the arch, heel, pad or
                  custom region. Their names include a percentage and vertical
                  scope. Click a modifier to see its translucent volume in the
                  3D editor.
                </p>
              </li>
              <li>
                <strong>Click its Infill child row.</strong>
                <p>
                  Expand that modifier if needed and select <b>Infill</b>.
                  Inspect <b>Fill density</b> and <b>Fill pattern</b>. Select
                  the parent insole’s Infill settings to inspect the base value.
                </p>
              </li>
              <li>
                <strong>Move into the sliced layers.</strong>
                <p>
                  Click <b>Slice now</b>, open <b>Preview</b>, then lower the
                  upper handle of the vertical layer slider. Inspect a layer
                  inside the base or support: sparse and dense regions should
                  have different internal spacing.
                </p>
              </li>
            </ol>
            <div className="prusa-two-notes">
              <div>
                <h3>No modifier rows?</h3>
                <p>
                  Enable a local arch, heel, pad or custom-region override, then
                  export a fresh <b>PrusaSlicer 3MF</b>. A base infill value
                  alone does not create separate modifier volumes.
                </p>
              </div>
              <div>
                <h3>Low infill still looks solid?</h3>
                <p>
                  Perimeters and solid top/bottom layers can fill a thin base.
                  Inspect deeper layers and your shell thickness. A percentage
                  describes infill, not total part density.{" "}
                  <SourceLink href={sources.shells}>Shell settings</SourceLink>
                </p>
              </div>
            </div>
            <details className="prusa-troubleshooting">
              <summary>
                <ChevronDown size={16} /> “Configuration was not loaded” on an
                older download
              </summary>
              <p>
                An early export incorrectly advertised a newer PrusaSlicer
                version. Current exports work with 2.9.2. Reload Insole Studio
                and download a fresh 3MF; changing your slicer version is not
                required for this correction. Old downloaded files retain the
                old marker.
              </p>
            </details>
            <p className="prusa-fine-print">
              When modifiers overlap, the last matching region wins. Base-only
              regions end at the base-thickness plane; support-only regions
              begin above it. At 100% infill, the export uses Rectilinear
              because Gyroid does not support 100%.
            </p>
          </div>
        </section>

        <section
          id="prusa-material"
          className="prusa-section prusa-width"
          tabIndex={-1}
        >
          <div className="prusa-section-heading">
            <span className="prusa-section-number">03 / MATERIAL NOTES</span>
            <h2>
              Two different ways
              <br /> to tune the feel.
            </h2>
            <p>
              Choose the grade printed on your spool. Material expansion and
              internal structure are separate controls.
            </p>
          </div>
          <div className="prusa-section-body">
            <div className="prusa-material-selector">
              <div>
                <label htmlFor="prusa-material-grade">Material grade</label>
                <select
                  id="prusa-material-grade"
                  value={materialGrade}
                  onChange={(event) => selectMaterial(event.target.value)}
                  aria-describedby="prusa-material-grade-help"
                >
                  <option value="85a">Siraya Flex TPU Air 85A</option>
                  <option value="95a">Siraya Flex TPU Air 95A</option>
                </select>
              </div>
              <p id="prusa-material-grade-help">
                Saved with your studio preferences. Downloads below follow this
                choice. Check the exact product and grade on your spool.
              </p>
            </div>
            <div className="prusa-two-controls">
              <article>
                <span className="prusa-control-icon">
                  <SlidersHorizontal size={21} />
                </span>
                <h3>Infill is local.</h3>
                <p>
                  Region percentages change the internal structure in selected
                  areas. Pattern, shells and the insole’s thickness also
                  influence how much it compresses.
                </p>
                <span className="prusa-control-location">
                  SET IN INSOLE STUDIO
                </span>
              </article>
              <article>
                <span className="prusa-control-icon prusa-warm">
                  <Thermometer size={21} />
                </span>
                <h3>Foaming is material-wide.</h3>
                <p>
                  Nozzle temperature changes expansion; flow must be calibrated
                  with it. Hold the material profile constant when comparing
                  local infill regions.
                </p>
                <span className="prusa-control-location">
                  SET IN PRUSASLICER
                </span>
              </article>
            </div>
            <p>
              These profiles are for <b>Siraya Flex TPU Air</b>, an active
              foaming material. They are not generic 85A or 95A TPU settings:
              ordinary TPU may need much more flow. Air 85A starts softer than
              Air 95A, but expansion, shells and infill all affect the finished
              part’s feel.
            </p>
            <p>
              Siraya’s guide gives separate flow ranges for each grade and
              temperature. At 240°C, both downloadable starters use 87.5% flow.
              At 250°C, the <b>{material.label}</b> starter uses{" "}
              <b>{material.foamFlowPercent}%</b>. These are midpoints for
              calibration, not guaranteed final settings. Tune temperature and
              flow together to keep the printed dimensions accurate.
            </p>
            <p>
              Dry the filament as the manufacturer directs, feed it with low
              resistance, and use the correct sheet preparation for flexible
              material. Start with a small coupon using the same shells and
              layer height as the insole. Compare the measured thickness, mass,
              surface and feel before committing to a full pair.
            </p>
            <p className="prusa-fine-print">
              Infill percentage is not a predicted compression, Shore hardness
              or final mass fraction. The downloadable profiles below are
              community starting points, not manufacturer-certified presets or a
              validated orthotic prescription.
            </p>
            <p className="prusa-fine-print">
              Changing material requires selecting the matching filament preset
              and slicing again. It does not update an existing G-code file or a
              print already in progress. Changing only temperature or flow
              mid-print is not a substitute for reslicing.
            </p>
            <div className="prusa-material-links">
              <SourceLink href={material.guideUrl}>
                Siraya’s 85A & 95A foaming guide
              </SourceLink>
              <SourceLink href={sources.flexible}>
                Prusa’s flexible-material guide
              </SourceLink>
            </div>
            <article className="prusa-material-card">
              <div>
                <span className="prusa-eyebrow">MATERIAL REFERENCE</span>
                <h3>{material.label}</h3>
                <p>
                  Active foaming TPU · 1.75 mm · confirm the{" "}
                  {material.grade.toUpperCase()} version on the spool
                </p>
              </div>
              <div>
                <SourceLink href={material.productUrl}>
                  Manufacturer & material details
                </SourceLink>
              </div>
            </article>
          </div>
        </section>

        <section
          id="prusa-downloads"
          className="prusa-section prusa-width"
          tabIndex={-1}
        >
          <div className="prusa-section-heading">
            <span className="prusa-section-number">04 / A STARTING POINT</span>
            <h2>
              Calibrate a coupon.
              <br /> Then print an insole.
            </h2>
            <p>
              Two filament presets for your selected grade and one print preset,
              packaged as a PrusaSlicer configuration bundle.
            </p>
            <span className="prusa-profile-badge">
              CALIBRATION STARTERS / NOT CERTIFIED
            </span>
          </div>
          <div className="prusa-section-body">
            <div className="prusa-download-card">
              <div>
                <ArrowDownToLine size={24} />
                <div>
                  <h3>{material.label} starting profiles</h3>
                  <p>PrusaSlicer 2.9.2 · .ini configuration bundle</p>
                </div>
              </div>
              <a
                className="prusa-download-button"
                href={`${downloadBase}${material.profileFilename}`}
                download
              >
                Download profiles <ArrowDownToLine size={15} />
              </a>
              <a
                className="prusa-readme"
                href={`${downloadBase}${material.readmeFilename}`}
                download
              >
                Read the settings & calibration notes <ArrowRight size={13} />
              </a>
              <div className="prusa-download-grade">
                <span>Selected: TPU Air {material.grade.toUpperCase()}</span>
                <ChapterLink id="prusa-material">
                  Change grade <ArrowRight size={12} />
                </ChapterLink>
              </div>
            </div>
            <div className="prusa-table-wrap">
              <table>
                <caption>
                  TPU Air {material.grade.toUpperCase()} filament presets —
                  initial values to test
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Preset</th>
                    <th scope="col">Nozzle</th>
                    <th scope="col">Extrusion multiplier</th>
                    <th scope="col">Bed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">240C firm START</th>
                    <td>240°C</td>
                    <td>0.875 / 87.5%</td>
                    <td>40°C</td>
                  </tr>
                  <tr>
                    <th scope="row">250C foam START</th>
                    <td>250°C</td>
                    <td>
                      {material.foamMultiplier} / {material.foamFlowPercent}%
                    </td>
                    <td>40°C</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="prusa-fine-print">
              Both presets: 2 mm³/s maximum volumetric speed, zero retraction
              length and speed, and 100% fan after the first two layers. “Firm”
              and “foam” distinguish the starting conditions; they do not
              guarantee a particular hardness.
            </p>
            <p className="prusa-fine-print">
              The flow reduction is already in the filament’s extrusion
              multiplier. Leave printer flow at 100% so you do not apply it
              twice.
            </p>
            <div className="prusa-print-spec">
              <span className="prusa-eyebrow">
                PRINT PRESET / MK4 INPUT SHAPER & MK4S / 0.4 MM NOZZLE
              </span>
              <h3>0.20mm MK4 0.4 START</h3>
              <p>
                0.20 mm layers, 2 perimeters, 3 top and 3 bottom layers. Initial
                speeds: 15 mm/s first layer, 20 external perimeters, 25
                perimeters and 30 infill, further limited by the filament’s
                volumetric cap. Base infill is 20% Gyroid; the design’s
                object/modifier settings can override it.
              </p>
              <p>
                <b>Keep your own printer preset and start/end G-code.</b> This
                bundle contains no printer profile. Its print preset is intended
                for stock, single-extruder MK4 Input Shaper or MK4S profiles
                with a 0.4 mm nozzle and direct-drive extrusion. Other printers,
                nozzles or extruders need their own settings.
              </p>
              <p>
                Choose the printer and nozzle variant that matches the actual
                machine, including standard or high-flow nozzle. The separate
                downloads above keep your printer preset. The studio’s default
                <b> Complete MK4S project</b> instead embeds an MK4S standard
                0.4 mm printer and the selected grade’s 250°C foam preset.
                Choose <b>Design only</b> at export to keep your own presets.
              </p>
            </div>
            <ol className="prusa-steps prusa-import-profiles">
              <li>
                <strong>Import the configuration bundle.</strong>
                <p>
                  In PrusaSlicer choose{" "}
                  <b>File → Import → Import Config Bundle</b> and select the
                  downloaded <code>.ini</code>.
                </p>
              </li>
              <li>
                <strong>Select the new presets explicitly.</strong>
                <p>
                  Keep your actual printer selected. Choose{" "}
                  <b>Insole Studio - TPU Air - 0.20mm MK4 0.4 START</b> under
                  Print settings, and either the <b>240C firm START</b> or{" "}
                  <b>250C foam START</b> Siraya{" "}
                  <b>{material.grade.toUpperCase()}</b> preset under Filament.
                </p>
              </li>
              <li>
                <strong>Check, calibrate and save a copy.</strong>
                <p>
                  Verify the selected printer, nozzle, temperatures, cooling and
                  retraction before slicing a small test. Tune temperature and
                  flow together, save your calibrated presets under new names,
                  then use those for the full insole.
                </p>
              </li>
            </ol>
          </div>
        </section>
        <footer className="prusa-guide-footer prusa-width">
          <div>
            <span className="prusa-eyebrow">READY FOR THE NEXT ITERATION?</span>
            <p>A small test now. A better fit next.</p>
          </div>
          <a href="#/insoles">
            Back to the design studio <ArrowRight size={17} />
          </a>
        </footer>
      </main>
    </div>
  );
}
