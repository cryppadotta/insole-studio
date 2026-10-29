import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpFromLine,
  Box,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Download,
  Footprints,
  Gauge,
  Grid2X2,
  Layers3,
  Link2,
  Maximize,
  MousePointer2,
  Move,
  Redo2,
  RotateCcw,
  Ruler,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Undo2,
  Unlink2,
  X,
} from "lucide-react";
import InsoleViewer from "./Viewer";
import Measure from "./Measure";
import SupportControls from "./SupportControls";
import DensityControls from "./DensityControls";
import BedPlacementPreview from "./BedPlacementPreview";
import MaterialSettings from "./MaterialSettings";
import { DEFAULT_MATERIAL_GRADE, type MaterialGrade } from "./materials";
import { MK4S_BED, planBedPlacement, type PlacementMode } from "./placement";
import { getDensityRegions } from "./density";
import { prusaProject, modifierBundle } from "./prusa";
import SizePresets from "./SizePresets";
import InsoleOutline from "./Outline";
import {
  createHistory,
  editHistory,
  toggleHistoryLink,
  undoHistory,
  redoHistory,
} from "./history";
import {
  binarySTL,
  buildInsoleGeometry,
  clampParams,
  DEFAULT_PARAMS,
  geometryStats,
  outlinePoints,
  PARAM_LIMITS,
  type InsoleParams,
  type NumericParamKey,
  cloneParams,
} from "./model";
import {
  downloadFile,
  loadInsoleProject,
  parseInsoleProject,
  safeName,
  readStudioPreferences,
  saveStudioPreferences,
  saveInsoleProject,
  type Foot,
} from "./project";
import type { SizeSystem } from "./sizes";
import "./styles.css";

type Step = "shape" | "support" | "density" | "print";
type Feature = "outline" | "arch" | "heel" | "met" | "base";
const steps = [
  { id: "shape", label: "Define the shape", detail: "Dimensions & outline" },
  { id: "support", label: "Add your support", detail: "Contours & landmarks" },
  { id: "density", label: "Tune the cushion", detail: "Infill & regions" },
  { id: "print", label: "Make it tangible", detail: "Review & export" },
] as const;
const features = [
  {
    id: "arch",
    label: "Arch support",
    caption: "A smooth lift along the inner edge.",
    icon: Layers3,
  },
  {
    id: "heel",
    label: "Heel cup",
    caption: "A raised rim around the heel seat.",
    icon: ShieldCheck,
  },
  {
    id: "met",
    label: "Metatarsal pads",
    caption: "Independent supports, each with its own shape.",
    icon: Footprints,
  },
  {
    id: "base",
    label: "Base & flex",
    caption: "Base thickness and a smooth heel or toe lift.",
    icon: SlidersHorizontal,
  },
] as const;

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,select,a[href]",
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, []);
  return (
    <div className="sole-modal-backdrop" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="sole-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sole-modal-title">
          <h2>{title}</h2>
          <button aria-label="Close dialog" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function InsoleApp() {
  const [project, setProject] = useState(loadInsoleProject);
  const [preferences] = useState(readStudioPreferences);
  const [materialGrade, setMaterialGrade] = useState<MaterialGrade>(
    preferences.materialGrade ??
      project.materialGrade ??
      DEFAULT_MATERIAL_GRADE,
  );
  const [history, setHistory] = useState(() =>
    createHistory(project.feet, project.linked),
  );
  const [side, setSide] = useState<Foot>(preferences.side ?? "right");
  const [step, setStep] = useState<Step>(preferences.step ?? "shape");
  const [feature, setFeature] = useState<Feature>(
    preferences.feature ??
      (preferences.step === "support" ? "arch" : "outline"),
  );
  const [view, setView] = useState<"perspective" | "top" | "side">(
    "perspective",
  );
  const [mode, setMode] = useState<
    "solid" | "wireframe" | "height" | "density"
  >(preferences.step === "density" ? "density" : "solid");
  const [grid, setGrid] = useState(true);
  const [fitSignal, setFitSignal] = useState(0);
  const [selectedPadId, setSelectedPadId] = useState(
    preferences.selectedPadId ?? "",
  );
  const [sizeSystem, setSizeSystem] = useState<SizeSystem>(() =>
    ["eu", "us-men", "us-women"].includes(preferences.sizeSystem ?? "")
      ? (preferences.sizeSystem as SizeSystem)
      : "eu",
  );
  const [sizeValue, setSizeValue] = useState(preferences.sizeValue ?? "42");
  const [selectedDensityZoneId, setSelectedDensityZoneId] = useState(
    preferences.selectedDensityZoneId ?? "",
  );
  const [toast, setToast] = useState("");
  const [saved, setSaved] = useState(true);
  const [modal, setModal] = useState<"help" | "export" | null>(null);
  const [exportSide, setExportSide] = useState<"current" | "pair">("current");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportFormat, setExportFormat] = useState<"3mf" | "stl" | "bundle">(
    "3mf",
  );
  const [exportPlacement, setExportPlacement] = useState<PlacementMode>(
    preferences.exportPlacement ?? "mk4s",
  );
  const [exportProfileMode, setExportProfileMode] = useState<
    "complete" | "design"
  >(preferences.exportProfileMode ?? "complete");
  const effectiveExportPlacement =
    exportProfileMode === "complete" ? "mk4s" : exportPlacement;
  const [bedClearance, setBedClearance] = useState(
    preferences.bedClearance ?? 3,
  );
  const importRef = useRef<HTMLInputElement>(null);
  const lastEdit = useRef(0);
  const p = history.present[side];
  const deferred = useDeferredValue(p);
  const selectedPad =
    p.pads.find((pad) => pad.id === selectedPadId) ?? p.pads[0];
  const selectedDensityZone =
    p.density.zones.find((zone) => zone.id === selectedDensityZoneId) ??
    p.density.zones[0];
  const statsKey = JSON.stringify({ ...deferred, density: undefined });
  const stats = useMemo(() => {
    const geometry = buildInsoleGeometry(deferred, side, 56);
    const result = geometryStats(geometry);
    geometry.dispose();
    return result;
  }, [statsKey, side]);
  const currentProject = useMemo(
    () => ({
      ...project,
      feet: history.present,
      linked: history.linked,
      materialGrade,
    }),
    [project, history.present, history.linked, materialGrade],
  );
  useEffect(() => {
    const old = document.title;
    document.title = "Insole Studio";
    return () => {
      document.title = old;
    };
  }, []);
  useEffect(() => {
    setSaved(false);
    const timer = setTimeout(() => {
      try {
        saveInsoleProject(currentProject);
        setSaved(true);
      } catch {
        setToast(
          "Browser storage is full or unavailable. Save a project file to keep your design.",
        );
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [currentProject]);
  const projectRef = useRef(currentProject);
  projectRef.current = currentProject;
  useEffect(() => {
    const flush = () => {
      try {
        saveInsoleProject(projectRef.current);
      } catch {
        /* The normal autosave reports persistent failures. */
      }
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", visibility);
      flush();
    };
  }, []);
  useEffect(() => {
    saveStudioPreferences({
      side,
      step,
      feature,
      selectedPadId: selectedPad?.id ?? "",
      sizeSystem,
      sizeValue,
      selectedDensityZoneId: selectedDensityZone?.id ?? "",
      exportPlacement,
      exportProfileMode,
      bedClearance,
      materialGrade,
    });
  }, [
    side,
    step,
    feature,
    selectedPad?.id,
    sizeSystem,
    sizeValue,
    selectedDensityZone?.id,
    exportPlacement,
    exportProfileMode,
    bedClearance,
    materialGrade,
  ]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  const change = (next: InsoleParams) => {
    const now = Date.now();
    const padStructureChanged =
      p.pads.length !== next.pads.length ||
      p.pads.some((pad, i) => pad.id !== next.pads[i]?.id);
    const zoneStructureChanged =
      p.density.zones.length !== next.density.zones.length ||
      p.density.zones.some((zone, i) => zone.id !== next.density.zones[i]?.id);
    const coalesce =
      !padStructureChanged &&
      !zoneStructureChanged &&
      now - lastEdit.current < 400;
    lastEdit.current = padStructureChanged || zoneStructureChanged ? 0 : now;
    setHistory((h) => {
      const nextFeet = { ...h.present, [side]: clampParams(next) };
      if (h.linked)
        nextFeet[side === "right" ? "left" : "right"] = clampParams(next);
      return editHistory(h, nextFeet, coalesce);
    });
  };
  const set = (key: NumericParamKey, value: number) =>
    change({ ...p, [key]: value });
  const undo = () => {
    lastEdit.current = 0;
    setHistory(undoHistory);
  };
  const redo = () => {
    lastEdit.current = 0;
    setHistory(redoHistory);
  };
  const goStep = (next: Step) => {
    setStep(next);
    if (next === "density") setMode("density");
    else if (mode === "density") setMode("solid");
    setFeature(
      next === "shape"
        ? "outline"
        : next === "support" && feature === "outline"
          ? "arch"
          : feature,
    );
  };
  const selectFeature = (next: Feature) => {
    setFeature(next);
    setStep(next === "outline" ? "shape" : "support");
  };
  const toggleLink = () => {
    lastEdit.current = 0;
    setHistory((h) => toggleHistoryLink(h, side));
    if (!history.linked) {
      setToast(
        "Both feet now share these parameters. Their geometry is mirrored.",
      );
    }
  };
  const field = (
    key: NumericParamKey,
    label: string,
    note?: string,
    unit = "mm",
    scale = 1,
  ) => (
    <Measure
      key={key}
      label={label}
      value={p[key] * scale}
      min={PARAM_LIMITS[key][0] * scale}
      max={PARAM_LIMITS[key][1] * scale}
      step={
        scale === 100
          ? 0.1
          : key === "toeShape"
            ? 0.05
            : key === "baseThickness"
              ? 0.1
              : key.includes("Height") ||
                  key === "toeSpring" ||
                  key === "heelLift"
                ? 0.5
                : 1
      }
      unit={unit}
      onChange={(n) => set(key, n / scale)}
      note={note}
    />
  );
  const fitIssues = (foot: Foot) => {
    const q = history.present[foot];
    return [
      q.length > project.shoeLength
        ? `${foot === "right" ? "Right" : "Left"} length exceeds shoe limit by ${(q.length - project.shoeLength).toFixed(1)} mm.`
        : "",
      q.width > project.shoeWidth
        ? `${foot === "right" ? "Right" : "Left"} width exceeds shoe limit by ${(q.width - project.shoeWidth).toFixed(1)} mm.`
        : "",
    ].filter(Boolean);
  };
  const issues = fitIssues(side);
  const shoeExportIssues =
    exportSide === "pair"
      ? [...fitIssues("left"), ...fitIssues("right")]
      : issues;
  const bedPlacements = useMemo(() => {
    if (
      modal !== "export" ||
      exportFormat !== "3mf" ||
      effectiveExportPlacement !== "mk4s"
    )
      return [];
    const sides: Foot[] = exportSide === "pair" ? ["left", "right"] : [side];
    return sides.map((foot) => {
      const geometry = buildInsoleGeometry(history.present[foot], foot, 160);
      try {
        return { foot, placement: planBedPlacement(geometry, bedClearance) };
      } finally {
        geometry.dispose();
      }
    });
  }, [
    modal,
    exportFormat,
    effectiveExportPlacement,
    exportSide,
    side,
    history.present,
    bedClearance,
  ]);
  const exportIssues = [
    ...shoeExportIssues,
    ...bedPlacements
      .filter(({ placement }) => !placement.fits)
      .map(
        ({ foot, placement }) =>
          `${foot === "right" ? "Right" : "Left"} footprint cannot fit the ${MK4S_BED.width} × ${MK4S_BED.depth} mm bed with ${bedClearance} mm edge clearance at full scale (${placement.size.width.toFixed(1)} × ${placement.size.depth.toFixed(1)} mm at its best angle). Lower the clearance or adjust the dimensions. For another printer, choose Design only and Original coordinates.`,
      ),
  ];
  const saveProject = () => {
    downloadFile(
      JSON.stringify(currentProject, null, 2),
      `${safeName(project.name)}.insole.json`,
      "application/json",
    );
    setToast("Editable project downloaded.");
  };
  const importProject = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 1000000)
        throw new Error("Choose a project file smaller than 1 MB.");
      const next = parseInsoleProject(await file.text());
      setProject(next);
      if (next.materialGrade) setMaterialGrade(next.materialGrade);
      lastEdit.current = 0;
      setHistory(createHistory(next.feet, next.linked));
      setToast(`Opened “${next.name}”.`);
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "Unable to open project.",
      );
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };
  const exportPrint = () => {
    if (exportIssues.length || exportBusy) return;
    setExportBusy(true);
    setTimeout(() => {
      try {
        const sides: Foot[] =
          exportSide === "pair" ? ["left", "right"] : [side];
        for (const foot of sides) {
          const name = safeName(project.name);
          if (exportFormat === "stl") {
            const geometry = buildInsoleGeometry(
              history.present[foot],
              foot,
              160,
            );
            try {
              downloadFile(
                binarySTL(geometry),
                `${name}-${foot}-mm.stl`,
                "model/stl",
              );
            } finally {
              geometry.dispose();
            }
          } else {
            const bytes =
              exportFormat === "3mf"
                ? prusaProject(history.present[foot], foot, project.name, {
                    placement: effectiveExportPlacement,
                    clearance: bedClearance,
                    materialGrade,
                    profileMode: exportProfileMode,
                  })
                : modifierBundle(history.present[foot], foot, project.name, {
                    materialGrade,
                  });
            downloadFile(
              new Uint8Array(bytes).buffer,
              exportFormat === "3mf"
                ? exportProfileMode === "complete"
                  ? `${name}-${foot}-MK4S-Air${materialGrade.toUpperCase()}-complete.3mf`
                  : `${name}-${foot}-density.3mf`
                : `${name}-${foot}-modifiers.zip`,
              exportFormat === "3mf" ? "model/3mf" : "application/zip",
            );
          }
        }
        setToast(
          exportFormat === "stl"
            ? "STL geometry exported. Infill settings require the 3MF export."
            : exportFormat === "3mf"
              ? exportProfileMode === "complete"
                ? "Complete MK4S project exported with printer, print, filament and local infill settings. Open as a project in PrusaSlicer."
                : "Design 3MF exported with local infill modifiers. Choose your calibrated printer, print and filament presets in PrusaSlicer."
              : "Modifier bundle exported with instructions and matching coordinates.",
        );
        setModal(null);
      } catch (error) {
        setToast(
          error instanceof Error
            ? error.message
            : "Print export failed. Your editable project is still saved.",
        );
      } finally {
        setExportBusy(false);
      }
    }, 30);
  };
  const exportOutline = () => {
    const points = outlinePoints(p, side, 180);
    const path =
      points
        .map(
          (pt, i) =>
            `${i ? "L" : "M"}${(pt.x + p.width / 2 + 5).toFixed(3)} ${(p.length - pt.y + 5).toFixed(3)}`,
        )
        .join(" ") + "Z";
    downloadFile(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width + 10}mm" height="${p.length + 10}mm" viewBox="0 0 ${p.width + 10} ${p.length + 10}"><title>${side} insole outline, millimeters</title><path d="${path}" fill="none" stroke="black" stroke-width="0.3"/><path d="M5 ${p.length + 7}h50" stroke="black" stroke-width="0.3"/><text x="5" y="${p.length + 5}" font-size="2">50 mm calibration — print at 100%</text></svg>`,
      `${safeName(project.name)}-${side}-outline.svg`,
      "image/svg+xml",
    );
    setToast(
      "Full-size SVG outline downloaded. Print at 100% and check the calibration line.",
    );
  };
  return (
    <div className="insole-app">
      <header className="sole-header">
        <a href="#" className="sole-brand">
          <span className="sole-brand-mark">
            <Footprints size={25} strokeWidth={1.6} />
          </span>
          <strong>
            insole studio<span>PARAMETRIC INSOLE DESIGN</span>
          </strong>
        </a>

        <nav aria-label="Main navigation">
          <a href="#/prusa">Prusa guide</a>
        </nav>
        <div className="sole-header-tools">
          <span className="sole-local">
            <i /> LOCAL WORKSPACE
          </span>
          <button
            aria-label="Open studio guide"
            onClick={() => setModal("help")}
          >
            <CircleHelp size={19} />
          </button>
        </div>
      </header>
      <section className="sole-project-bar">
        <div>
          <div className="sole-eyebrow">FOOTWEAR / PARAMETRIC DESIGN</div>
          <div className="sole-project-title">
            <h1>
              Insole Studio<span>.</span>
            </h1>
            <span className="sole-title-rule" />
            <input
              aria-label="Project name"
              maxLength={100}
              value={project.name}
              onChange={(e) =>
                setProject((v) => ({ ...v, name: e.target.value }))
              }
            />
            <ChevronDown size={14} />
          </div>
        </div>
        <div className="sole-project-actions">
          <span className="sole-save-state">
            {saved ? (
              <CheckCheck size={14} />
            ) : (
              <span className="sole-saving" />
            )}
            {saved ? "Saved on this device" : "Saving…"}
          </span>
          <button
            className="sole-button"
            onClick={() => importRef.current?.click()}
          >
            <ArrowUpFromLine size={15} />
            <span>Open</span>
          </button>
          <button className="sole-button" onClick={saveProject}>
            <Save size={15} />
            <span>Save project</span>
          </button>
          <button
            className="sole-button sole-primary"
            onClick={() => setModal("export")}
          >
            <ArrowDownToLine size={15} />
            <span>Export 3MF</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </section>
      <nav className="sole-workflow sole-four-steps" aria-label="Design steps">
        {steps.map((s, i) => (
          <button
            key={s.id}
            aria-current={step === s.id ? "step" : undefined}
            onClick={() => goStep(s.id)}
          >
            <span className="sole-step-number">0{i + 1}</span>
            <span>
              <strong>{s.label}</strong>
              <small>{s.detail}</small>
            </span>
            {i < steps.length - 1 && (
              <ChevronDown className="sole-step-arrow" size={16} />
            )}
          </button>
        ))}
        <div className="sole-workflow-note">
          <Ruler size={14} /> DESIGNED IN MILLIMETERS
        </div>
      </nav>
      <main className="sole-workbench">
        <aside className="sole-controls" aria-label="Insole parameters">
          <div className="sole-controls-intro">
            <div className="sole-eyebrow">
              {step === "shape"
                ? "01 / THE FOUNDATION"
                : step === "support"
                  ? "02 / THE DETAILS"
                  : step === "density"
                    ? "03 / THE INTERNAL STRUCTURE"
                    : "04 / THE FIRST PROTOTYPE"}
            </div>
            <h2>
              {step === "shape" ? (
                <>
                  A shape that’s <br />
                  all yours.
                </>
              ) : step === "support" ? (
                <>
                  A little support. <br />A better fit.
                </>
              ) : step === "density" ? (
                <>
                  Tune the <br />
                  feel.
                </>
              ) : (
                <>
                  From pixels <br />
                  to a first fit.
                </>
              )}
            </h2>
            <p>
              {step === "shape"
                ? "Start with your dimensions. Fine-tune the outline with the orange landmarks."
                : step === "support"
                  ? "Shape each support above the base. Where arch and pads overlap, the higher surface wins."
                  : step === "density"
                    ? "Control internal infill separately from the shape. Paint a footprint with settings, not extra material."
                    : "Check the footprint, then take your design to your slicer."}
            </p>
          </div>
          <div className="sole-controls-scroll">
            {step === "shape" && (
              <>
                <SizePresets
                  params={p}
                  system={sizeSystem}
                  value={sizeValue}
                  onSelection={(system, value) => {
                    setSizeSystem(system);
                    setSizeValue(value);
                  }}
                  onApply={(next, footLength) => {
                    lastEdit.current = 0;
                    change(next);
                    setProject((v) => ({ ...v, footLength }));
                    setToast(
                      "Size starting point applied. Fine-tune it against your actual shoe.",
                    );
                  }}
                />
                <div className="sole-control-heading">
                  <Ruler size={15} />
                  <h3>Footprint</h3>
                  <span>mm</span>
                </div>
                <div className="sole-preset-row">
                  {[
                    ["Standard", 100, 64, 62, 0.5],
                    ["Wide", 112, 70, 72, 0.8],
                    ["Slim", 90, 58, 56, 0.25],
                  ].map(([label, width, heel, arch, toe]) => (
                    <button
                      key={label}
                      className={p.width === width ? "active" : ""}
                      onClick={() =>
                        change({
                          ...p,
                          width: Number(width),
                          heelWidth: Number(heel),
                          archWidth: Number(arch),
                          toeShape: Number(toe),
                        })
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {field("length", "Overall length")}
                {field("width", "Forefoot width")}
                {field("heelWidth", "Heel width")}
                {field("archWidth", "Waist width")}
                <div className="sole-control-heading sole-section-break">
                  <Settings2 size={15} />
                  <h3>Toe profile</h3>
                </div>
                {field("toeShape", "Toe roundness", undefined, "", 1)}
                <div className="sole-range-ends">
                  <span>Round</span>
                  <span>Broad</span>
                </div>
                <details className="sole-details">
                  <summary>
                    Foot & shoe measurements
                    <ChevronDown size={14} />
                  </summary>
                  <p>
                    Use the factory insole to measure your shoe’s maximum
                    footprint.
                  </p>
                  <Measure
                    label="Measured foot length"
                    value={project.footLength}
                    min={100}
                    max={400}
                    onChange={(n) =>
                      setProject((v) => ({ ...v, footLength: n }))
                    }
                  />
                  <div className="sole-allowance">
                    Toe allowance{" "}
                    <strong>
                      {(p.length - project.footLength).toFixed(1)} mm
                    </strong>
                  </div>
                  <Measure
                    label="Shoe maximum length"
                    value={project.shoeLength}
                    min={140}
                    max={420}
                    onChange={(n) =>
                      setProject((v) => ({ ...v, shoeLength: n }))
                    }
                  />
                  <Measure
                    label="Shoe maximum width"
                    value={project.shoeWidth}
                    min={40}
                    max={180}
                    onChange={(n) =>
                      setProject((v) => ({ ...v, shoeWidth: n }))
                    }
                  />
                  {p.length < project.footLength && (
                    <p className="sole-error-text">
                      The insole is shorter than your measured foot.
                    </p>
                  )}
                </details>
              </>
            )}
            {step === "support" && (
              <SupportControls
                params={p}
                onChange={change}
                feature={feature}
                onFeature={setFeature}
                selectedPadId={selectedPad?.id}
                onSelectedPad={setSelectedPadId}
              />
            )}
            {step === "density" && (
              <DensityControls
                params={p}
                onChange={change}
                selectedZoneId={selectedDensityZone?.id}
                onSelectZone={setSelectedDensityZoneId}
                onExport={() => {
                  setExportFormat("3mf");
                  setModal("export");
                }}
              />
            )}
            {step === "print" && (
              <>
                <div className="sole-print-check">
                  <span>
                    <Check size={16} />
                  </span>
                  <div>
                    <strong>Closed solid geometry</strong>
                    <p>Top, bottom and rim form one solid.</p>
                  </div>
                </div>
                <div
                  className={`sole-print-check ${issues.length ? "warning" : ""}`}
                >
                  <span>{issues.length ? "!" : <Check size={16} />}</span>
                  <div>
                    <strong>
                      {issues.length
                        ? "Check the shoe limits"
                        : "Within your shoe limits"}
                    </strong>
                    <p>
                      {issues.length
                        ? issues.join(" ")
                        : `${p.length} × ${p.width} mm within ${project.shoeLength} × ${project.shoeWidth} mm.`}
                    </p>
                  </div>
                </div>
                <div className="sole-print-check">
                  <span>
                    <Check size={16} />
                  </span>
                  <div>
                    <strong>Millimeter scale</strong>
                    <p>Import the STL into your slicer as mm.</p>
                  </div>
                </div>
                <div className="sole-print-summary">
                  <span>CURRENT FOOT</span>
                  <strong>{side === "right" ? "Right" : "Left"} insole</strong>
                  <dl>
                    <div>
                      <dt>Footprint</dt>
                      <dd>
                        {p.length} × {p.width} mm
                      </dd>
                    </div>
                    <div>
                      <dt>Base thickness</dt>
                      <dd>{p.baseThickness} mm</dd>
                    </div>
                    <div>
                      <dt>Heel lift</dt>
                      <dd>{p.heelLift} mm</dd>
                    </div>
                    <div>
                      <dt>Solid volume</dt>
                      <dd>{stats.volumeCm3.toFixed(1)} cm³</dd>
                    </div>
                  </dl>
                </div>
                <MaterialSettings
                  id="insole-print-material"
                  grade={materialGrade}
                  onChange={setMaterialGrade}
                />
                <button
                  className="sole-button sole-primary sole-full"
                  onClick={() => setModal("export")}
                >
                  <Download size={16} /> Export for PrusaSlicer
                  <ArrowRight size={16} />
                </button>
                <button
                  className="sole-button sole-full"
                  onClick={exportOutline}
                >
                  <Ruler size={16} /> Download 1:1 outline
                </button>
                <p className="sole-print-note">
                  Print the outline on paper first to check the shoe fit. Open
                  the complete 3MF project to retain local infill and include
                  MK4S standard 0.4 mm starting presets. Check and calibrate
                  them in PrusaSlicer.
                </p>
                <p className="sole-print-note">
                  This is an editable design prototype. The dimensions and
                  support values are yours to test; they are not a clinical
                  prescription.
                </p>
              </>
            )}
          </div>
          <div className="sole-controls-footer">
            {step === "shape" ? (
              <button onClick={() => goStep("support")}>
                Continue to support
                <ArrowRight size={16} />
              </button>
            ) : step === "support" ? (
              <button onClick={() => goStep("density")}>
                Continue to density
                <ArrowRight size={16} />
              </button>
            ) : step === "density" ? (
              <button onClick={() => goStep("print")}>
                Review & export
                <ArrowRight size={16} />
              </button>
            ) : (
              <button onClick={() => goStep("shape")}>
                <ArrowLeft size={16} />
                Back to the shape
              </button>
            )}
          </div>
        </aside>
        <section className="sole-model-panel" aria-label="3D design workspace">
          <div className="sole-model-toolbar">
            <div
              className="sole-foot-switch"
              role="group"
              aria-label="Foot selection"
            >
              <button
                className={side === "left" ? "active" : ""}
                aria-pressed={side === "left"}
                onClick={() => setSide("left")}
              >
                L <span>Left</span>
              </button>
              <button
                className={side === "right" ? "active" : ""}
                aria-pressed={side === "right"}
                onClick={() => setSide("right")}
              >
                R <span>Right</span>
              </button>
            </div>
            <button
              className={`sole-link-button ${history.linked ? "active" : ""}`}
              aria-pressed={history.linked}
              onClick={toggleLink}
              title="Linking copies this foot’s parameters to both feet"
            >
              {history.linked ? <Link2 size={15} /> : <Unlink2 size={15} />}
              <span>
                {history.linked ? "Mirrored pair" : "Independent feet"}
              </span>
            </button>
            <div className="sole-model-history">
              <button
                aria-label="Undo parameter change"
                disabled={!history.past.length}
                onClick={undo}
              >
                <Undo2 size={17} />
              </button>
              <button
                aria-label="Redo parameter change"
                disabled={!history.future.length}
                onClick={redo}
              >
                <Redo2 size={17} />
              </button>
              <span />
              <button
                aria-label="Reset current foot"
                title="Reset current foot to the default shape (undoable)"
                onClick={() => {
                  lastEdit.current = 0;
                  change(cloneParams(DEFAULT_PARAMS));
                  setToast("Default shape restored. You can undo this change.");
                }}
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>
          <div className="sole-viewer-area">
            <div className="sole-viewer-label">
              <span className="sole-live-dot" />
              LIVE PARAMETRIC MODEL<span>{side.toUpperCase()} / 01</span>
            </div>
            <InsoleViewer
              params={deferred}
              side={side}
              view={view}
              mode={mode}
              showGrid={grid}
              fitSignal={fitSignal}
            />
            <div className="sole-viewer-tools">
              <button
                className={mode === "density" ? "active" : ""}
                aria-label="Toggle infill visualization"
                aria-pressed={mode === "density"}
                title="Requested infill"
                onClick={() =>
                  setMode(mode === "density" ? "solid" : "density")
                }
              >
                <Gauge size={17} />
              </button>
              <button
                aria-label="Fit model in view"
                title="Fit model in view"
                onClick={() => setFitSignal((n) => n + 1)}
              >
                <Maximize size={17} />
              </button>
              <button
                className={grid ? "active" : ""}
                aria-label="Toggle construction grid"
                aria-pressed={grid}
                onClick={() => setGrid(!grid)}
                title="Construction grid"
              >
                <Grid2X2 size={17} />
              </button>
              <button
                className={mode === "wireframe" ? "active" : ""}
                aria-label="Toggle wireframe"
                aria-pressed={mode === "wireframe"}
                onClick={() =>
                  setMode(mode === "wireframe" ? "solid" : "wireframe")
                }
                title="Wireframe"
              >
                <Box size={17} />
              </button>
              <button
                className={mode === "height" ? "active" : ""}
                aria-label="Toggle height visualization"
                aria-pressed={mode === "height"}
                onClick={() => setMode(mode === "height" ? "solid" : "height")}
                title="Surface height"
              >
                <Layers3 size={17} />
              </button>
            </div>
            <div className="sole-model-tag">
              <span />
              <div>
                <strong>{project.name || "Untitled insole"}</strong>
                <span>
                  {p.length.toFixed(0)} × {p.width.toFixed(0)} mm · {side} foot
                </span>
              </div>
            </div>
            {mode === "density" && (
              <div className="sole-density-key">
                <span>REQUESTED INFILL</span>
                <i />
                <div>
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>
            )}
            {mode === "height" && (
              <div className="sole-height-key">
                <span>LOW</span>
                <i />
                <span>HIGH</span>
              </div>
            )}
            <div className="sole-view-tabs" aria-label="Camera views">
              {(["perspective", "top", "side"] as const).map((v) => (
                <button
                  key={v}
                  aria-pressed={view === v}
                  className={view === v ? "active" : ""}
                  onClick={() => setView(v)}
                >
                  {v === "perspective"
                    ? "3D view"
                    : v === "top"
                      ? "Top"
                      : "Side"}
                </button>
              ))}
            </div>
            <div className="sole-axis">
              <span>Z</span>
              <span>Y</span>
              <span>X</span>
              <svg viewBox="0 0 64 64">
                <path d="M31 38V10M31 38L10 50M31 38L53 50" />
              </svg>
            </div>
          </div>
          <div className="sole-model-metrics">
            <div>
              <span>OVERALL LENGTH</span>
              <strong>
                {p.length.toFixed(0)}
                <small>mm</small>
              </strong>
            </div>
            <div>
              <span>MAXIMUM WIDTH</span>
              <strong>
                {p.width.toFixed(0)}
                <small>mm</small>
              </strong>
            </div>
            <div>
              <span>BASE THICKNESS</span>
              <strong>
                {p.baseThickness.toFixed(1)}
                <small>mm</small>
              </strong>
            </div>
            <div>
              <span>SOLID VOLUME</span>
              <strong>
                {stats.volumeCm3.toFixed(1)}
                <small>cm³</small>
              </strong>
            </div>
          </div>
          <div className="sole-orbit-hint">
            <MousePointer2 size={13} />
            <span>Drag to orbit</span>
            <span>·</span>
            <Move size={13} />
            <span>Right-drag to pan</span>
            <span>·</span>
            <span>Scroll to zoom</span>
          </div>
        </section>
        <aside className="sole-outline-panel">
          <div className="sole-outline-heading">
            <div className="sole-eyebrow">THE PLAN VIEW</div>
            <h2>Outline & landmarks</h2>
            <p>Small points. Precise adjustments.</p>
          </div>
          <div className="sole-outline-canvas">
            <span className="sole-outline-view-label">
              <span>TOP / {side === "right" ? "R" : "L"}</span>
              <Ruler size={14} />
            </span>
            <InsoleOutline
              params={p}
              side={side}
              onChange={change}
              selected={feature === "base" ? "outline" : feature}
              onSelect={selectFeature}
              densityMode={step === "density" || mode === "density"}
              selectedDensityZoneId={selectedDensityZone?.id}
              onSelectDensityZone={(id) => {
                setSelectedDensityZoneId(id);
                setStep("density");
                setMode("density");
              }}
              selectedPadId={selectedPad?.id}
              onSelectPad={(id) => {
                setSelectedPadId(id);
                selectFeature("met");
              }}
            />
            <div className="sole-landmark-hint">
              <span />
              {step === "density"
                ? "Drag a region center to move it"
                : "Drag a point to reshape"}
            </div>
          </div>
          <div className="sole-landmarks">
            <div className="sole-control-heading">
              <MousePointer2 size={14} />
              <h3>Support & base</h3>
              <span>04</span>
            </div>
            {features.map((f, i) => (
              <button
                key={f.id}
                className={feature === f.id ? "active" : ""}
                onClick={() => selectFeature(f.id)}
              >
                <span className="sole-landmark-number">0{i + 1}</span>
                <span>
                  <strong>{f.label}</strong>
                  <small>
                    {f.id === "arch"
                      ? `${p.archHeight} mm lift · inner edge`
                      : f.id === "heel"
                        ? `${p.heelCupHeight} mm rim · heel seat`
                        : f.id === "base"
                          ? `${p.baseThickness} mm base · ${p.heelLift} mm heel lift`
                          : `${p.pads.filter((pad) => pad.enabled).length} active · ${p.pads.length} total`}
                  </small>
                </span>
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
          <div className="sole-studio-note">
            <span className="sole-note-symbol">↗</span>
            <p>
              <strong>Start with the shoe.</strong> Measure its removable insole
              for a footprint you can trust.
            </p>
          </div>
        </aside>
      </main>
      <footer className="sole-footer">
        <span>
          <i />
          {issues.length ? "Review shoe dimensions" : "Geometry up to date"}
        </span>
        <span>
          PARAMETRIC SOLID<span>·</span>MM<span>·</span>V3.0
        </span>
        <span className="sole-autosave-footer">
          <CheckCheck size={11} />
          {saved ? "Autosaved locally" : "Saving…"}
        </span>
        <span>Made to be made.</span>
      </footer>
      <input
        ref={importRef}
        hidden
        type="file"
        accept=".json,.insole.json,application/json"
        onChange={(e) => void importProject(e.target.files?.[0])}
      />
      {toast && (
        <div className="sole-toast" role="status">
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal === "help" && (
        <Modal title="Your first insole" onClose={() => setModal(null)}>
          <div className="sole-guide">
            <p>
              A small CAD studio for shaping, printing and refining your own
              insoles.
            </p>
            {steps.map((s, i) => (
              <div key={s.id}>
                <span>0{i + 1}</span>
                <section>
                  <h3>{s.label}</h3>
                  <p>
                    {i === 0
                      ? "Measure your factory insole. Set its length and widths, then drag the orange outline landmarks. Your measured foot length and shoe limits live under Foot & shoe measurements."
                      : i === 1
                        ? "Choose arch support, heel cup or metatarsal pads. Add or duplicate pads, rotate them, and adjust their length, width and position. Use Advanced slope & curve to flatten the tops and shape the falloff. Base & flex has base thickness, heel lift and toe lift; heel lift raises the whole heel seat. Drag landmarks in plan view to position supports."
                        : i === 2
                          ? "Set a base infill, override supports, and add movable density regions. Export a PrusaSlicer 3MF to carry the geometry and local settings together. Colors show requested infill, not a measured compression simulation."
                          : "Download a full-size paper outline to check fit, then export a PrusaSlicer 3MF to keep your density regions. Choose your printer and material in the slicer. Save a project file to keep an editable copy."}
                  </p>
                </section>
              </div>
            ))}
            <p className="sole-guide-note">
              Link the feet for a mirrored pair, or unlink them to customize
              each side. Your design autosaves in this browser with a recovery
              copy. Measurements and size preferences stay in local storage; a
              small cookie remembers your editor view.
            </p>
          </div>
        </Modal>
      )}
      {modal === "export" && (
        <Modal
          title="Take it to PrusaSlicer."
          onClose={() => {
            if (!exportBusy) setModal(null);
          }}
        >
          <p className="sole-modal-lead">
            A full-scale insole with local infill settings, ready for your
            slicer.
          </p>
          <div
            className="sole-export-formats"
            role="group"
            aria-label="Export format"
          >
            {(
              [
                ["3mf", "PrusaSlicer 3MF", "Shape + settings"],
                ["stl", "STL only", "Shape; no infill data"],
                ["bundle", "Modifier ZIP", "Manual import fallback"],
              ] as const
            ).map(([value, label, detail]) => (
              <button
                key={value}
                className={exportFormat === value ? "active" : ""}
                aria-pressed={exportFormat === value}
                onClick={() => setExportFormat(value)}
              >
                <strong>{label}</strong>
                <small>{detail}</small>
              </button>
            ))}
          </div>
          <div className="sole-export-options">
            <label>
              <input
                type="radio"
                name="export-foot"
                checked={exportSide === "current"}
                onChange={() => setExportSide("current")}
              />
              <span>
                <strong>Current foot</strong>
                <small>
                  {side === "right" ? "Right" : "Left"} insole · one file
                </small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="export-foot"
                checked={exportSide === "pair"}
                onChange={() => setExportSide("pair")}
              />
              <span>
                <strong>Both feet</strong>
                <small>Left and right · two files</small>
              </span>
            </label>
          </div>
          {exportFormat === "3mf" && (
            <section
              className="sole-bed-placement"
              aria-label="Project settings"
            >
              <label htmlFor="insole-export-profile">Project settings</label>
              <select
                id="insole-export-profile"
                value={exportProfileMode}
                onChange={(event) =>
                  setExportProfileMode(
                    event.target.value as "complete" | "design",
                  )
                }
              >
                <option value="complete">
                  Complete MK4S project · recommended
                </option>
                <option value="design">Design only · use my presets</option>
              </select>
              <p>
                {exportProfileMode === "complete"
                  ? "Includes the MK4S standard 0.4 mm nozzle, 250 × 210 mm bed, 0.20 mm layers, 2 perimeters, 0.6 mm top/bottom shells and the selected Air grade’s starting filament preset. These are calibration starting points."
                  : "Includes the shape and local infill overrides. Keep your own printer, print and filament presets in PrusaSlicer."}
              </p>
            </section>
          )}
          {exportFormat !== "stl" && (
            <MaterialSettings
              id="insole-export-material"
              grade={materialGrade}
              onChange={setMaterialGrade}
              exportMode={exportFormat === "3mf" ? exportProfileMode : "design"}
            />
          )}
          {exportFormat === "3mf" && (
            <section
              className="sole-bed-placement"
              aria-label="Print bed placement"
            >
              <label htmlFor="insole-export-placement">
                Print bed placement
              </label>
              <select
                id="insole-export-placement"
                value={effectiveExportPlacement}
                disabled={exportProfileMode === "complete"}
                onChange={(event) =>
                  setExportPlacement(event.target.value as PlacementMode)
                }
              >
                <option value="mk4s">Prusa MK4 / MK4S · 250 × 210 mm</option>
                <option value="original">
                  Original coordinates · manual placement
                </option>
              </select>
              {effectiveExportPlacement === "mk4s" ? (
                <>
                  <Measure
                    label="Bed edge clearance"
                    value={bedClearance}
                    min={0}
                    max={10}
                    step={0.5}
                    onChange={setBedClearance}
                  />
                  <div className="sole-bed-previews">
                    {bedPlacements.map(({ foot, placement }) => (
                      <BedPlacementPreview
                        key={foot}
                        params={history.present[foot]}
                        side={foot}
                        placement={placement}
                      />
                    ))}
                  </div>
                  <p>
                    Each file opens rotated and centered at full scale. Density
                    regions move with the insole. Check room for your skirt or
                    brim in PrusaSlicer.
                  </p>
                  {exportSide === "pair" && (
                    <p>
                      Left and right are separate files for separate plates.
                    </p>
                  )}
                </>
              ) : (
                <p>
                  The design keeps its original coordinates. Position the whole
                  insole on your chosen bed in PrusaSlicer.
                </p>
              )}
            </section>
          )}
          <div className="sole-export-facts">
            <span>
              <Check size={14} />
              Closed solid
            </span>
            <span>
              <Ruler size={14} />
              Millimeters
            </span>
            <span>
              <Layers3 size={14} />
              Flat print base
            </span>
          </div>
          {exportIssues.length > 0 && (
            <p className="sole-export-error">{exportIssues.join(" ")}</p>
          )}
          <p className="sole-print-note">
            {exportFormat === "stl"
              ? "STL includes geometry only and discards the density regions. Use 3MF to carry your infill settings."
              : exportFormat === "3mf"
                ? exportProfileMode === "complete"
                  ? "Use File → Open Project in PrusaSlicer and load the project settings. This 3MF includes the printer, print and filament presets alongside the solid and non-printing infill modifiers. Check the standard 0.4 mm nozzle matches your machine, inspect the slice and calibrate a sample."
                  : "Open this design 3MF with its object and modifier settings. It contains the solid and non-printing infill modifiers; select your own printer, print and filament presets."
                : "Load the solid STL first, then add each region STL as a modifier (not a separate printed part). The ZIP includes exact settings and import instructions."}
            {exportFormat !== "stl" && (
              <span className="sole-export-region-summary">
                Base {p.density.baseInfill}% · {p.density.pattern} ·{" "}
                {getDensityRegions(p).length} modifiers on the current foot
              </span>
            )}
            {exportSide === "pair" &&
              " For a pair, allow both downloads if your browser asks."}
          </p>
          {exportFormat === "3mf" && (
            <details className="sole-details">
              <summary>
                View density regions in PrusaSlicer
                <ChevronDown size={14} />
              </summary>
              <p>
                Use Advanced or Expert mode. Expand the insole in the right-hand
                Object list. Select a modifier name to see its translucent
                volume, then click its Infill child row to inspect Fill density
                and Fill pattern. The insole’s own Infill row sets the base.
              </p>
              <p>
                Slice, then move the Preview layer slider inside the base or
                support to see the infill spacing. If no modifiers are listed,
                enable a support infill override or add a region in Tune the
                cushion before exporting.
              </p>
            </details>
          )}
          <button
            className="sole-button sole-primary sole-full"
            disabled={exportBusy || exportIssues.length > 0}
            onClick={exportPrint}
          >
            <Download size={16} />
            {exportBusy
              ? "Building your solid…"
              : exportSide === "pair"
                ? `Download left & right ${exportFormat === "bundle" ? "ZIP" : exportFormat.toUpperCase()}`
                : `Download ${exportFormat === "bundle" ? "ZIP" : exportFormat.toUpperCase()}`}
            <ArrowRight size={16} />
          </button>
          <button className="sole-export-outline" onClick={exportOutline}>
            Check the fit first — download a 1:1 outline
            <Ruler size={14} />
          </button>
        </Modal>
      )}
    </div>
  );
}
