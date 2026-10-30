import {
  DEFAULT_PARAMS,
  NUMERIC_PARAM_KEYS,
  PAD_LIMITS,
  PARAM_LIMITS,
  clampParams,
  cloneParams,
  makePad,
  type InsoleParams,
  type MetPad,
} from "./model";
import {
  DENSITY_ZONE_LIMITS,
  DEFAULT_PRINT_TEMPERATURE,
  TEMPERATURE_LIMITS,
  isDensityPattern,
  type DensityConfig,
  type DensityOverride,
  type DensityPattern,
  type DensityScope,
  type DensityZone,
} from "./density";
import { isMaterialGrade, type MaterialGrade } from "./materials";

export type Foot = "left" | "right";
export type Pair = Record<Foot, InsoleParams>;
export interface InsoleProject {
  format: "fieldwork-insole";
  version: 4;
  name: string;
  feet: Pair;
  linked: boolean;
  footLength: number;
  shoeLength: number;
  shoeWidth: number;
  materialGrade?: MaterialGrade;
}
// Separate the public app from other projects sharing the same browser origin.
// Existing project files remain compatible through the unchanged JSON format.
export const STORAGE_KEY = "insole-studio.project.v1";
export const BACKUP_STORAGE_KEY = "insole-studio.project.backup";
export const PREFERENCES_STORAGE_KEY = "insole-studio.preferences.v1";
export const PREFERENCES_COOKIE = "insole_studio_ui";

export interface StudioPreferences {
  side?: Foot;
  step?: "shape" | "support" | "density" | "print";
  feature?: "outline" | "arch" | "heel" | "met" | "base";
  exportPlacement?: "mk4s" | "original";
  exportProfileMode?: "complete" | "design";
  bedClearance?: number;
  selectedPadId?: string;
  selectedDensityZoneId?: string;
  sizeSystem?: string;
  sizeValue?: string;
  materialGrade?: MaterialGrade;
}

export const newProject = (): InsoleProject => ({
  format: "fieldwork-insole",
  version: 4,
  name: "Everyday insole",
  feet: {
    left: cloneParams(DEFAULT_PARAMS),
    right: cloneParams(DEFAULT_PARAMS),
  },
  linked: true,
  footLength: 265,
  shoeLength: 290,
  shoeWidth: 112,
});

const LEGACY_LIMITS = {
  length: [180, 330],
  width: [65, 130],
  heelWidth: [35, 90],
  archWidth: [35, 100],
  toeShape: [0, 1],
  baseThickness: [1.6, 8],
  archHeight: [0, 28],
  archPosition: [0.25, 0.55],
  heelCupHeight: [0, 20],
  metHeight: [0, 12],
  metPosition: [0.55, 0.8],
  metOffset: [-25, 25],
  metWidth: [20, 70],
  metLength: [18, 65],
  toeSpring: [0, 12],
} as const;
const padKeys = Object.keys(PAD_LIMITS) as (keyof typeof PAD_LIMITS)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validNumber(value: unknown, limits: readonly [number, number]) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= limits[0] &&
    value <= limits[1]
  );
}

function validTemperature(value: unknown): value is number {
  return validNumber(value, TEMPERATURE_LIMITS) && Number.isInteger(value);
}

function safeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !!value.trim() &&
    value.length <= 100 &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    !["__proto__", "constructor", "prototype"].includes(value)
  );
}

function isDensityScope(value: unknown): value is DensityScope {
  return value === "full" || value === "base" || value === "support";
}

function readDensityOverride(
  value: unknown,
  context: string,
  basePattern: DensityPattern,
  baseTemperature: number,
): DensityOverride {
  if (
    !isRecord(value) ||
    !validNumber(value.infill, DENSITY_ZONE_LIMITS.infill) ||
    !isDensityScope(value.scope)
  )
    throw new Error(
      `Invalid ${context}: use an infill from 0–100% and a valid scope.`,
    );
  if (Object.hasOwn(value, "pattern") && !isDensityPattern(value.pattern))
    throw new Error(`Invalid ${context} pattern.`);
  if (
    Object.hasOwn(value, "temperature") &&
    !validTemperature(value.temperature)
  )
    throw new Error(
      `Invalid ${context} temperature: use whole degrees from 230–270°C.`,
    );
  return {
    infill: value.infill as number,
    pattern: isDensityPattern(value.pattern) ? value.pattern : basePattern,
    temperature: Object.hasOwn(value, "temperature")
      ? (value.temperature as number)
      : baseTemperature,
    scope: value.scope,
  };
}

function readDensity(
  value: unknown,
  side: Foot,
  padIds: ReadonlySet<string>,
): DensityConfig {
  if (
    !isRecord(value) ||
    !validNumber(value.baseInfill, DENSITY_ZONE_LIMITS.infill) ||
    !isDensityPattern(value.pattern) ||
    !isRecord(value.pads) ||
    !Array.isArray(value.zones)
  )
    throw new Error(`Invalid ${side} foot density settings.`);
  if (
    Object.hasOwn(value, "temperature") &&
    !validTemperature(value.temperature)
  )
    throw new Error(
      `Invalid ${side} foot density temperature: use whole degrees from 230–270°C.`,
    );
  const temperature = Object.hasOwn(value, "temperature")
    ? (value.temperature as number)
    : DEFAULT_PRINT_TEMPERATURE;
  const pattern = value.pattern;
  const arch =
    value.arch === null
      ? null
      : readDensityOverride(
          value.arch,
          `${side} foot arch density`,
          pattern,
          temperature,
        );
  const heel =
    value.heel === null
      ? null
      : readDensityOverride(
          value.heel,
          `${side} foot heel density`,
          pattern,
          temperature,
        );
  const pads = Object.fromEntries(
    Object.entries(value.pads).map(([id, override]) => {
      if (!safeId(id) || !padIds.has(id))
        throw new Error(`Invalid ${side} foot density pad target: ${id}.`);
      return [
        id,
        readDensityOverride(
          override,
          `${side} foot pad density`,
          pattern,
          temperature,
        ),
      ];
    }),
  );
  const ids = new Set<string>();
  const zones: DensityZone[] = value.zones.map((zone: unknown, index) => {
    const context = `${side} foot density region ${index + 1}`;
    if (
      !isRecord(zone) ||
      !safeId(zone.id) ||
      ids.has(zone.id) ||
      typeof zone.name !== "string" ||
      zone.name.length > 100 ||
      typeof zone.enabled !== "boolean" ||
      (zone.shape !== "ellipse" && zone.shape !== "box") ||
      !isDensityScope(zone.scope)
    )
      throw new Error(
        `Invalid ${context}: use a unique id, name, shape, scope, and enabled state.`,
      );
    ids.add(zone.id);
    for (const key of Object.keys(
      DENSITY_ZONE_LIMITS,
    ) as (keyof typeof DENSITY_ZONE_LIMITS)[]) {
      if (!validNumber(zone[key], DENSITY_ZONE_LIMITS[key]))
        throw new Error(`Invalid ${context} parameter: ${key}.`);
    }
    const settings = readDensityOverride(zone, context, pattern, temperature);
    return {
      ...settings,
      id: zone.id,
      name: zone.name,
      enabled: zone.enabled,
      shape: zone.shape,
      scope: zone.scope,
      infill: zone.infill as number,
      position: zone.position as number,
      offset: zone.offset as number,
      width: zone.width as number,
      length: zone.length as number,
      rotation: zone.rotation as number,
    };
  });
  return {
    baseInfill: value.baseInfill as number,
    pattern,
    temperature,
    arch,
    heel,
    pads,
    zones,
  };
}

function readPads(value: unknown, side: Foot): MetPad[] {
  if (!Array.isArray(value))
    throw new Error(`Invalid ${side} foot pads: expected a list.`);
  const ids = new Set<string>();
  return value.map((pad: unknown, index) => {
    const context = `${side} foot pad ${index + 1}`;
    if (
      !isRecord(pad) ||
      typeof pad.id !== "string" ||
      !pad.id.trim() ||
      pad.id.length > 100 ||
      ids.has(pad.id) ||
      typeof pad.name !== "string" ||
      pad.name.length > 100 ||
      typeof pad.enabled !== "boolean"
    )
      throw new Error(
        `Invalid ${context}: use a unique id, name, and enabled state.`,
      );
    if (
      Object.hasOwn(pad, "operation") &&
      pad.operation !== "add" &&
      pad.operation !== "subtract"
    )
      throw new Error(`Invalid ${context} operation: use add or subtract.`);
    ids.add(pad.id);
    for (const key of padKeys) {
      if (!validNumber(pad[key], PAD_LIMITS[key]))
        throw new Error(`Invalid ${context} parameter: ${key}.`);
    }
    const result: MetPad = {
      ...makePad(index),
      id: pad.id,
      name: pad.name,
      enabled: pad.enabled,
      ...(pad.operation === "add" || pad.operation === "subtract"
        ? { operation: pad.operation }
        : {}),
    };
    for (const key of padKeys) result[key] = pad[key] as number;
    return result;
  });
}

function readFoot(
  value: unknown,
  side: Foot,
  version: 1 | 2 | 3 | 4,
): InsoleParams {
  if (!isRecord(value)) throw new Error("The project must contain both feet.");
  // Heel lift was added to v3 without changing the format version. Omission
  // means the original, unraised heel; a supplied value still requires validation.
  const heelLift = Object.prototype.hasOwnProperty.call(value, "heelLift")
    ? value.heelLift
    : 0;
  if (!validNumber(heelLift, PARAM_LIMITS.heelLift))
    throw new Error(`Invalid ${side} foot parameter: heelLift.`);
  if (version === 1) {
    for (const key of Object.keys(
      LEGACY_LIMITS,
    ) as (keyof typeof LEGACY_LIMITS)[]) {
      if (!validNumber(value[key], LEGACY_LIMITS[key]))
        throw new Error(`Invalid ${side} foot parameter: ${key}.`);
    }
    const migrated = cloneParams(DEFAULT_PARAMS);
    for (const key of NUMERIC_PARAM_KEYS) {
      if (key in LEGACY_LIMITS) migrated[key] = value[key] as number;
    }
    migrated.heelLift = heelLift as number;
    migrated.pads = [
      {
        ...makePad(0),
        id: "met-pad-1",
        name: "Metatarsal pad 1",
        height: value.metHeight as number,
        position: value.metPosition as number,
        offset: value.metOffset as number,
        width: value.metWidth as number,
        length: value.metLength as number,
        rotation: 0,
        plateau: 0,
        // Fit the original (1 - radius²)³ dome within the new C2 curve family.
        // This keeps its broad shoulders while preserving all pad dimensions.
        curve1: 0.45,
        curve2: 0.31,
      },
    ];
    return clampParams(migrated);
  }
  const result = cloneParams(DEFAULT_PARAMS);
  for (const key of NUMERIC_PARAM_KEYS) {
    const number = key === "heelLift" ? heelLift : value[key];
    if (!validNumber(number, PARAM_LIMITS[key]))
      throw new Error(`Invalid ${side} foot parameter: ${key}.`);
    result[key] = number as number;
  }
  result.pads = readPads(value.pads, side);
  if (version >= 3)
    result.density = readDensity(
      value.density,
      side,
      new Set(result.pads.map((pad) => pad.id)),
    );
  return clampParams(result);
}

function sameDensityOverride(
  a: DensityOverride | null,
  b: DensityOverride | null,
): boolean {
  return a === null || b === null
    ? a === b
    : a.infill === b.infill &&
        a.pattern === b.pattern &&
        a.temperature === b.temperature &&
        a.scope === b.scope;
}

function sameDensity(a: DensityConfig, b: DensityConfig): boolean {
  const padIds = Object.keys(a.pads);
  return (
    a.baseInfill === b.baseInfill &&
    a.pattern === b.pattern &&
    a.temperature === b.temperature &&
    sameDensityOverride(a.arch, b.arch) &&
    sameDensityOverride(a.heel, b.heel) &&
    padIds.length === Object.keys(b.pads).length &&
    padIds.every(
      (id) =>
        Object.prototype.hasOwnProperty.call(b.pads, id) &&
        sameDensityOverride(a.pads[id], b.pads[id]),
    ) &&
    a.zones.length === b.zones.length &&
    a.zones.every((zone, index) => {
      const other = b.zones[index];
      return (
        zone.id === other.id &&
        zone.name === other.name &&
        zone.enabled === other.enabled &&
        zone.shape === other.shape &&
        zone.scope === other.scope &&
        zone.pattern === other.pattern &&
        zone.temperature === other.temperature &&
        (
          Object.keys(
            DENSITY_ZONE_LIMITS,
          ) as (keyof typeof DENSITY_ZONE_LIMITS)[]
        ).every((key) => zone[key] === other[key])
      );
    })
  );
}

/** Every editable field, including pad identity and order, contributes to equality. */
export function sameParams(a: InsoleParams, b: InsoleParams): boolean {
  return (
    NUMERIC_PARAM_KEYS.every((key) => a[key] === b[key]) &&
    sameDensity(a.density, b.density) &&
    a.pads.length === b.pads.length &&
    a.pads.every((pad, index) => {
      const other = b.pads[index];
      return (
        pad.id === other.id &&
        pad.name === other.name &&
        pad.enabled === other.enabled &&
        (pad.operation ?? "add") === (other.operation ?? "add") &&
        padKeys.every((key) => pad[key] === other[key])
      );
    })
  );
}

/** Migrate v1–v3 files; v4 prevents old readers treating relief cuts as supports. */
export function parseInsoleProject(text: string): InsoleProject {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value))
    throw new Error("Choose a Fieldwork .insole.json project.");
  if (
    value.format !== "fieldwork-insole" ||
    (value.version !== 1 &&
      value.version !== 2 &&
      value.version !== 3 &&
      value.version !== 4) ||
    typeof value.name !== "string" ||
    value.name.length > 100 ||
    typeof value.linked !== "boolean"
  )
    throw new Error(
      "This is not a supported insole project (versions 1, 2, 3, or 4).",
    );
  if (!isRecord(value.feet))
    throw new Error("The project must contain both feet.");
  const feet: Pair = {
    left: readFoot(value.feet.left, "left", value.version),
    right: readFoot(value.feet.right, "right", value.version),
  };
  for (const [key, min, max] of [
    ["footLength", 100, 400],
    ["shoeLength", 140, 420],
    ["shoeWidth", 40, 180],
  ] as const) {
    if (!validNumber(value[key], [min, max]))
      throw new Error(`Invalid ${key} measurement.`);
  }
  if (value.linked && !sameParams(feet.left, feet.right))
    throw new Error(
      "A linked pair must use matching left and right parameters.",
    );
  if (
    value.materialGrade !== undefined &&
    !isMaterialGrade(value.materialGrade)
  )
    throw new Error("Choose TPU Air 85A or 95A for the material grade.");
  return {
    format: "fieldwork-insole",
    version: 4,
    name: value.name.trim() || "Untitled insole",
    feet,
    linked: value.linked,
    footLength: value.footLength as number,
    shoeLength: value.shoeLength as number,
    shoeWidth: value.shoeWidth as number,
    ...(isMaterialGrade(value.materialGrade)
      ? { materialGrade: value.materialGrade }
      : {}),
  };
}

function readSaved(text: string | null): InsoleProject | undefined {
  if (!text) return;
  try {
    return parseInsoleProject(text);
  } catch {
    return;
  }
}

export function loadInsoleProject(): InsoleProject {
  try {
    const current = readSaved(localStorage.getItem(STORAGE_KEY));
    if (current) return current;
    const backup = readSaved(localStorage.getItem(BACKUP_STORAGE_KEY));
    if (backup) {
      // Recovery still works when browser storage has become read-only or full.
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(backup));
      } catch {
        // The valid backup remains available for the next visit.
      }
      return backup;
    }
  } catch {
    // Storage may be unavailable in private or server-rendered environments.
  }
  return newProject();
}

/** Save the current project and retain one previous valid autosave for recovery. */
export function saveInsoleProject(project: InsoleProject): void {
  const serialized = JSON.stringify(
    parseInsoleProject(JSON.stringify(project)),
  );
  let previous: string | null = null;
  try {
    previous = localStorage.getItem(STORAGE_KEY);
  } catch {
    // A storage implementation may permit writes while refusing reads.
  }
  try {
    // Never replace a good backup with malformed data from the primary slot.
    if (readSaved(previous)) {
      if (previous !== serialized)
        localStorage.setItem(BACKUP_STORAGE_KEY, previous!);
    } else if (!readSaved(localStorage.getItem(BACKUP_STORAGE_KEY)))
      localStorage.setItem(BACKUP_STORAGE_KEY, serialized);
  } catch {
    // A backup quota failure must not prevent saving to the primary slot.
  }
  // Let callers show a useful error if the latest project could not be saved.
  localStorage.setItem(STORAGE_KEY, serialized);
}

function cleanPreferences(value: unknown): StudioPreferences {
  if (!isRecord(value)) return {};
  const preferences: StudioPreferences = {};
  if (value.side === "left" || value.side === "right")
    preferences.side = value.side;
  if (
    value.step === "shape" ||
    value.step === "support" ||
    value.step === "density" ||
    value.step === "print"
  )
    preferences.step = value.step;
  if (
    value.feature === "outline" ||
    value.feature === "arch" ||
    value.feature === "heel" ||
    value.feature === "met" ||
    value.feature === "base"
  )
    preferences.feature = value.feature;
  if (value.exportPlacement === "mk4s" || value.exportPlacement === "original")
    preferences.exportPlacement = value.exportPlacement;
  if (
    value.exportProfileMode === "complete" ||
    value.exportProfileMode === "design"
  )
    preferences.exportProfileMode = value.exportProfileMode;
  if (validNumber(value.bedClearance, [0, 10]))
    preferences.bedClearance = value.bedClearance as number;
  if (isMaterialGrade(value.materialGrade))
    preferences.materialGrade = value.materialGrade;
  for (const key of [
    "selectedPadId",
    "selectedDensityZoneId",
    "sizeSystem",
    "sizeValue",
  ] as const) {
    if (typeof value[key] === "string" && value[key].length <= 100)
      preferences[key] = value[key];
  }
  return preferences;
}

function cookiePreferences(value: unknown): StudioPreferences {
  const { side, step, feature } = cleanPreferences(value);
  return {
    ...(side ? { side } : {}),
    ...(step ? { step } : {}),
    ...(feature ? { feature } : {}),
  };
}

/** Measurements and selected object IDs stay in browser storage, never cookies. */
export function readStudioPreferences(): StudioPreferences {
  try {
    const saved = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (saved) return cleanPreferences(JSON.parse(saved));
  } catch {
    // The non-sensitive UI cookie can recover the last step if storage is blocked.
  }
  if (typeof document === "undefined") return {};
  try {
    const cookie = document.cookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${PREFERENCES_COOKIE}=`));
    return cookie
      ? cookiePreferences(
          JSON.parse(
            decodeURIComponent(cookie.slice(PREFERENCES_COOKIE.length + 1)),
          ),
        )
      : {};
  } catch {
    return {};
  }
}

export function saveStudioPreferences(preferences: StudioPreferences): void {
  const clean = cleanPreferences(preferences);
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Restricted storage must not prevent editing or the minimal UI cookie.
  }
  if (typeof document === "undefined") return;
  try {
    const value = encodeURIComponent(JSON.stringify(cookiePreferences(clean)));
    const basePath = import.meta.env.BASE_URL;
    const path =
      typeof basePath === "string" &&
      basePath.startsWith("/") &&
      !/[;\r\n]/.test(basePath)
        ? basePath
        : "/insole-studio/";
    const secure =
      typeof location !== "undefined" && location.protocol === "https:"
        ? "; Secure"
        : "";
    document.cookie = `${PREFERENCES_COOKIE}=${value}; Max-Age=31536000; Path=${path}; SameSite=Strict${secure}`;
  } catch {
    // Cookie restrictions should never stop project editing or autosaving.
  }
}

export function downloadFile(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function safeName(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "insole"
  );
}
