import { ArrowDownToLine } from "lucide-react";
import {
  isMaterialGrade,
  TPU_AIR_MATERIALS,
  type MaterialGrade,
} from "./materials";

export default function MaterialSettings({
  grade,
  onChange,
  id,
  exportMode,
}: {
  grade: MaterialGrade;
  onChange: (grade: MaterialGrade) => void;
  id: string;
  exportMode?: "complete" | "design";
}) {
  const material = TPU_AIR_MATERIALS[grade];
  return (
    <section className="sole-material-settings" aria-label="Material settings">
      <label htmlFor={id}>Material grade</label>
      <select
        id={id}
        value={grade}
        onChange={(event) => {
          if (isMaterialGrade(event.target.value)) onChange(event.target.value);
        }}
      >
        <option value="85a">Siraya Flex TPU Air 85A · softer</option>
        <option value="95a">Siraya Flex TPU Air 95A · firmer</option>
      </select>
      <p>{material.description} Match the grade printed on your spool.</p>
      <div className="sole-material-start">
        <span>250°C foam start</span>
        <strong>{material.foamFlowPercent}% flow</strong>
        <small>Calibrate a sample; keep printer flow at 100%.</small>
      </div>
      <a
        className="sole-button sole-full"
        href={`${import.meta.env.BASE_URL}downloads/${material.profileFilename}`}
        download
      >
        <ArrowDownToLine size={15} /> Download {grade.toUpperCase()} presets
      </a>
      <p>
        {exportMode === "design"
          ? "This export records the material as a note. Select your own calibrated printer, print and filament presets in PrusaSlicer. "
          : "Complete 3MF projects include an MK4S standard 0.4 mm printer, 0.20 mm print settings and this grade’s 250°C foam starting preset. Calibrate temperature and flow before a full insole. "}
        <a href="#/prusa">Setup & material guide ↗</a>
      </p>
      <p>
        To install the separate preset download, use File → Import → Import
        Config Bundle, then select your actual printer and the matching presets.
      </p>
      <p className="sole-material-caution">
        For active foaming TPU Air only. Regular, non-foaming TPU needs its own
        temperature and flow calibration.
      </p>
    </section>
  );
}
