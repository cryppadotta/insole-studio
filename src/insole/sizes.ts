import { clampParams, type InsoleParams } from "./model";

export type SizeSystem = "eu" | "us-men" | "us-women";
// Birkenstock's EU/US conversion and printed millimeter foot-size references.
// These are foot-size references, not measured factory-insole dimensions.
export const SIZE_SOURCE =
  "https://www.birkenstock.com/us/us-service-fittingguide/";
export const MM_SOURCE =
  "https://www.birkenstock.com/on/demandware.static/-/Library-Sites-birkenstock-apac/default/dw848f1271/documents/Measurement_Template_US_A4.pdf";
export const SIZES = [
  [35, 225, null, 4],
  [36, 230, null, 5],
  [37, 240, null, 6],
  [38, 245, null, 7],
  [39, 250, null, 8],
  [40, 260, 7, 9],
  [41, 265, 8, 10],
  [42, 270, 9, 11],
  [43, 280, 10, null],
  [44, 285, 11, null],
  [45, 290, 12, null],
  [46, 300, 13, null],
  [47, 305, 14, null],
  [48, 310, 15, null],
  [49, 320, 16, null],
  [50, 325, 17, null],
].map(([eu, mm, men, women]) => ({ eu: eu!, mm: mm!, men, women }));
export function sizeOptions(system: SizeSystem) {
  return SIZES.filter(
    (s) => system === "eu" || s[system === "us-men" ? "men" : "women"] !== null,
  ).map((s) => ({
    value: String(s.eu),
    label:
      system === "eu"
        ? `EU ${s.eu}`
        : `US ${s[system === "us-men" ? "men" : "women"]}–${s[system === "us-men" ? "men" : "women"]! + 0.5} · EU ${s.eu}`,
  }));
}
export function sizePreset(
  params: InsoleParams,
  eu: number,
  narrow: boolean,
  toeAllowance = 10,
) {
  const size = SIZES.find((s) => s.eu === eu);
  if (!size) throw new Error("Choose a listed size.");
  const footLength = size.mm;
  const width = Math.round(((narrow ? 95 : 103) * footLength) / 270);
  return {
    footLength,
    params: clampParams({
      ...params,
      length: footLength + Math.max(0, Math.min(30, toeAllowance)),
      width,
      heelWidth: Math.round(width * 0.65),
      archWidth: Math.round(width * 0.61),
      toeShape: narrow ? 0.4 : 0.65,
    }),
  };
}
