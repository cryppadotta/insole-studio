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
}: {
  grade: MaterialGrade;
  onChange: (grade: MaterialGrade) => void;
  id: string;
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
        Import with File → Import → Import Config Bundle. Select your actual MK4
        Input Shaper / MK4S 0.4 mm printer and the matching Air filament preset
        in PrusaSlicer. The 3MF remembers this choice as a note; it carries
        shape and infill settings.{" "}
        <a href="#/prusa">Setup & material guide ↗</a>
      </p>
      <p className="sole-material-caution">
        For active foaming TPU Air only. Regular, non-foaming TPU needs its own
        temperature and flow calibration.
      </p>
    </section>
  );
}
