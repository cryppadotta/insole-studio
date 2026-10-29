import { DEFAULT_PRINT_TEMPERATURE } from "./density";
import { TPU_AIR_MATERIALS, type MaterialGrade } from "./materials";

/** One whole-insole starting temperature, paired with the selected Air grade. */
export function airTemperatureSettings(grade: MaterialGrade) {
  const material = TPU_AIR_MATERIALS[grade];
  return {
    temperature: DEFAULT_PRINT_TEMPERATURE,
    multiplier: material.foamMultiplier,
    flowPercent: Number(material.foamFlowPercent),
  };
}
