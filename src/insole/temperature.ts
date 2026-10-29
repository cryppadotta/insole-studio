import {
  DEFAULT_PRINT_TEMPERATURE,
  TEMPERATURE_LIMITS,
  getDensityRegions,
} from "./density";
import type { InsoleParams } from "./model";
import type { MaterialGrade } from "./materials";

const TEMPERATURES = [230, 240, 250, 260, 270] as const;
const STARTING_MULTIPLIERS = {
  "85a": [0.875, 0.875, 0.675, 0.575, 0.525],
  "95a": [0.875, 0.875, 0.65, 0.525, 0.525],
} as const;

/** Midpoints of Siraya's grade-specific starting flow ranges, not calibration. */
export function airTemperatureSettings(
  grade: MaterialGrade,
  temperature = DEFAULT_PRINT_TEMPERATURE,
) {
  if (
    !Number.isInteger(temperature) ||
    temperature < TEMPERATURE_LIMITS[0] ||
    temperature > TEMPERATURE_LIMITS[1]
  ) {
    throw new Error(
      "TPU Air temperature must be a whole degree between 230 and 270°C.",
    );
  }
  const upper = Math.max(
    1,
    TEMPERATURES.findIndex((t) => t >= temperature),
  );
  const lowerTemperature = TEMPERATURES[upper - 1];
  const ratio =
    (temperature - lowerTemperature) / (TEMPERATURES[upper] - lowerTemperature);
  const flows = STARTING_MULTIPLIERS[grade];
  const multiplier = Number(
    (flows[upper - 1] + ratio * (flows[upper] - flows[upper - 1])).toFixed(5),
  );
  return {
    temperature,
    multiplier,
    flowPercent: Number((multiplier * 100).toFixed(3)),
    interpolated: !TEMPERATURES.some((t) => t === temperature),
  };
}

/** Native Prusa modifiers can apply infill/pattern, but not nozzle temperature. */
export function regionalTemperaturePlan(p: InsoleParams) {
  const regions = getDensityRegions(p).map((region) => ({
    id: region.id,
    name: region.name,
    temperature: region.temperature,
  }));
  return {
    wholeInsoleTemperature: p.density.temperature,
    regionalTemperaturesApplied: false as const,
    mixed: regions.some(
      (region) => region.temperature !== p.density.temperature,
    ),
    regions,
  };
}
