import { ArrowDownToLine } from "lucide-react";
import {
  isMaterialGrade,
  TPU_AIR_MATERIALS,
  type MaterialGrade,
} from "./materials";
import { airTemperatureSettings } from "./temperature";

export default function MaterialSettings({
  grade,
  onChange,
  id,
  exportMode,
  temperature = 250,
}: {
  grade: MaterialGrade;
  onChange: (grade: MaterialGrade) => void;
  id: string;
  exportMode?: "complete" | "design";
  temperature?: number;
}) {
  const material = TPU_AIR_MATERIALS[grade];
  const thermal = airTemperatureSettings(grade, temperature);
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
        <span>{temperature}°C whole-insole start</span>
        <strong>{thermal.flowPercent}% flow</strong>
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
          : `Complete 3MF projects include an MK4S standard 0.4 mm printer, 0.20 mm print settings and this grade’s ${temperature}°C whole-insole starting settings. Regional temperature targets are saved separately and are not applied by PrusaSlicer modifiers. Calibrate temperature and flow before a full insole. `}
        <a href="#/prusa">Setup & material guide ↗</a>
      </p>
      <p>
        To install the separate preset download, use File → Import → Import
        Config Bundle, then select your actual printer and the matching presets.
        The separate download contains 240°C and 250°C starters.
      </p>
      {thermal.interpolated && (
        <p>
          Starting flow is interpolated between Siraya’s temperature guide
          points. Calibrate it for your spool.
        </p>
      )}
      <p className="sole-material-caution">
        For active foaming TPU Air only. Regular, non-foaming TPU needs its own
        temperature and flow calibration.
      </p>
    </section>
  );
}
