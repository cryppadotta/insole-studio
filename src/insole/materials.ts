export type MaterialGrade = "85a" | "95a";

// Preserve the material used by existing projects until a grade is chosen.
export const DEFAULT_MATERIAL_GRADE: MaterialGrade = "95a";

export function isMaterialGrade(value: unknown): value is MaterialGrade {
  return value === "85a" || value === "95a";
}

const guideUrl = "https://siraya.tech/blogs/news/foaming-tpu-filament-guide";

export const TPU_AIR_MATERIALS = {
  "85a": {
    grade: "85a",
    label: "Siraya Flex TPU Air 85A",
    description: "Softer foaming TPU for cushioning and flexibility.",
    productUrl:
      "https://siraya.tech/products/flex-tpu-air-65a-82a-foaming-flexible-filament",
    guideUrl,
    profileFilename: "siraya-tpu-air-85a-prusa292-starting-profiles.ini",
    readmeFilename: "siraya-tpu-air-85a-README.txt",
    foamMultiplier: 0.675,
    foamFlowPercent: "67.5",
  },
  "95a": {
    grade: "95a",
    label: "Siraya Flex TPU Air 95A",
    description: "Firmer foaming TPU for more structure and shape retention.",
    productUrl: "https://siraya.tech/products/flex-tpu-air-95a-filament",
    guideUrl,
    profileFilename: "siraya-tpu-air-95a-prusa292-starting-profiles.ini",
    readmeFilename: "siraya-tpu-air-95a-README.txt",
    foamMultiplier: 0.65,
    foamFlowPercent: "65",
  },
} as const;
