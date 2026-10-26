import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PARAMS, makePad, supportProfile } from "../src/insole/model";
import { DENSITY_ZONE_LIMITS, makeDensityZone } from "../src/insole/density";
import {
  BACKUP_STORAGE_KEY,
  PREFERENCES_COOKIE,
  PREFERENCES_STORAGE_KEY,
  STORAGE_KEY,
  loadInsoleProject,
  newProject,
  parseInsoleProject,
  readStudioPreferences,
  saveInsoleProject,
  saveStudioPreferences,
} from "../src/insole/project";

const legacyParams = {
  length: 270,
  width: 98,
  heelWidth: 64,
  archWidth: 60,
  toeShape: 0.45,
  baseThickness: 3,
  archHeight: 12,
  archPosition: 0.43,
  heelCupHeight: 8,
  metHeight: 3,
  metPosition: 0.66,
  metOffset: -3,
  metWidth: 46,
  metLength: 38,
  toeSpring: 2,
};
function legacyProject() {
  return {
    ...newProject(),
    version: 1,
    feet: { left: { ...legacyParams }, right: { ...legacyParams } },
  };
}

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => entries.set(key, value)),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("insole project files", () => {
  it("round-trips editable v3 designs and keeps feet and pad objects independent", () => {
    const linked = newProject();
    expect(linked.version).toBe(3);
    expect(linked.feet.left.pads).not.toBe(linked.feet.right.pads);
    expect(linked.feet.left.pads[0]).not.toBe(linked.feet.right.pads[0]);
    expect(parseInsoleProject(JSON.stringify(linked))).toEqual(linked);
    const independent = newProject();
    independent.linked = false;
    independent.name = "Walking pair";
    independent.feet.left.archHeight = 17;
    independent.feet.left.heelLift = 6.5;
    independent.feet.left.archLength = 180;
    independent.feet.left.pads[0].offset = -9;
    independent.feet.left.pads.push({
      ...makePad(1),
      id: "second-pad",
      name: "Lateral lift",
      rotation: -37,
      plateau: 0.6,
      curve1: 0.8,
      curve2: 0.2,
      enabled: false,
    });
    independent.feet.right.length = 275;
    independent.feet.right.heelLift = 11;
    const restored = parseInsoleProject(JSON.stringify(independent));
    expect(restored).toEqual(independent);
    expect(restored.feet.left).not.toBe(restored.feet.right);
    expect(restored.feet.right.archHeight).toBe(DEFAULT_PARAMS.archHeight);
    restored.feet.left.pads[0].height = 14;
    expect(independent.feet.left.pads[0].height).not.toBe(14);
    expect(restored.feet.right.pads[0].height).not.toBe(14);
  });

  it("migrates original v1 measurements and pad dimensions into the editable v3 schema", () => {
    const original = legacyProject();
    original.linked = false;
    original.feet.left = {
      ...original.feet.left,
      archHeight: 21,
      archPosition: 0.49,
      metHeight: 8,
      metPosition: 0.71,
      metOffset: -14,
      metWidth: 63,
      metLength: 54,
    };
    const migrated = parseInsoleProject(JSON.stringify(original));
    expect(migrated.version).toBe(3);
    expect(migrated.feet.left).toMatchObject({
      archHeight: 21,
      archPosition: 0.49,
      heelLift: 0,
    });
    expect(migrated.feet.right.heelLift).toBe(0);
    expect(migrated.feet.left.pads).toHaveLength(1);
    expect(migrated.feet.left.pads[0]).toMatchObject({
      enabled: true,
      height: 8,
      position: 0.71,
      offset: -14,
      width: 63,
      length: 54,
      rotation: 0,
      plateau: 0,
    });
    expect(migrated.feet.right.pads[0]).toMatchObject({
      height: 3,
      length: 38,
    });
    expect(migrated.feet.left).not.toHaveProperty("metHeight");
    expect(parseInsoleProject(JSON.stringify(migrated))).toEqual(migrated);
    expect(parseInsoleProject(JSON.stringify(legacyProject())).linked).toBe(
      true,
    );
  });

  it.each([2, 3])(
    "loads pre-heel-lift v%i files with zero lift and preserves their shape",
    (version) => {
      const expected = newProject();
      expected.linked = false;
      expected.feet.left.archHeight = 23;
      expected.feet.right.toeSpring = 8;
      expected.feet.left.pads[0].rotation = -41;
      if (version === 3)
        expected.feet.left.density.heel = { infill: 12, scope: "full" };
      const previous = JSON.parse(JSON.stringify(expected));
      previous.version = version;
      for (const side of ["left", "right"] as const) {
        delete previous.feet[side].heelLift;
        if (version === 2) delete previous.feet[side].density;
      }
      expect(parseInsoleProject(JSON.stringify(previous))).toEqual(expected);
    },
  );

  it.each([1, 2, 3])(
    "validates an explicitly supplied heel lift in v%i files",
    (version) => {
      const original = version === 1 ? legacyProject() : newProject();
      const project = JSON.parse(JSON.stringify(original));
      project.version = version;
      project.linked = false;
      project.feet.left.heelLift = 40;
      project.feet.right.heelLift = 0;
      const restored = parseInsoleProject(JSON.stringify(project));
      expect(restored.feet.left.heelLift).toBe(40);
      expect(restored.feet.right.heelLift).toBe(0);
      for (const invalid of [-0.1, 40.1, "5", null, true, {}, NaN, Infinity]) {
        project.feet.left.heelLift = invalid;
        expect(() => parseInsoleProject(JSON.stringify(project))).toThrow(
          /invalid left foot parameter: heelLift/i,
        );
      }
    },
  );

  it("approximates a v1 pad's original broad slope without changing v2 curve choices", () => {
    const migrated = parseInsoleProject(JSON.stringify(legacyProject()));
    const pad = migrated.feet.left.pads[0];
    for (let sample = 0; sample <= 100; sample++) {
      const radius = sample / 100;
      const original = (1 - radius * radius) ** 3;
      const next = supportProfile(radius, pad.plateau, pad.curve1, pad.curve2);
      expect(Math.abs(next - original)).toBeLessThan(0.03);
    }
    const v2 = newProject();
    for (const foot of [v2.feet.left, v2.feet.right]) {
      foot.pads[0].curve1 = 0;
      foot.pads[0].curve2 = 0;
      foot.pads[0].plateau = 0;
    }
    expect(parseInsoleProject(JSON.stringify(v2))).toEqual(v2);
  });

  it("rejects linked pairs with different scalar, pad, enabled, or order fields", () => {
    const scalar = newProject();
    scalar.feet.left.heelLift = 18;
    expect(() => parseInsoleProject(JSON.stringify(scalar))).toThrow(
      /linked pair.*matching/i,
    );
    for (const change of [
      (pad: ReturnType<typeof makePad>) => {
        pad.height += 1;
      },
      (pad: ReturnType<typeof makePad>) => {
        pad.enabled = !pad.enabled;
      },
      (pad: ReturnType<typeof makePad>) => {
        pad.name = "A new name";
      },
    ]) {
      const project = newProject();
      change(project.feet.left.pads[0]);
      expect(() => parseInsoleProject(JSON.stringify(project))).toThrow(
        /linked pair.*matching/i,
      );
    }
    const project = newProject();
    const second = { ...makePad(1), id: "second-pad" };
    project.feet.left.pads.push({ ...second });
    project.feet.right.pads.unshift({ ...second });
    expect(() => parseInsoleProject(JSON.stringify(project))).toThrow(
      /linked pair.*matching/i,
    );
  });

  it("rejects unsupported formats, malformed nested pads, and out-of-range measurements", () => {
    const project = newProject();
    const invalid = [
      null,
      { ...project, format: "different-cad" },
      { ...project, version: 4 },
      { ...project, feet: { right: project.feet.right } },
      {
        ...project,
        feet: {
          ...project.feet,
          left: { ...project.feet.left, length: "270" },
        },
      },
      {
        ...project,
        feet: {
          ...project.feet,
          left: { ...project.feet.left, baseThickness: 0 },
        },
      },
      { ...project, shoeLength: 900 },
      { ...project, shoeWidth: "112" },
      { ...project, footLength: null },
      {
        ...project,
        feet: { ...project.feet, left: { ...project.feet.left, pads: null } },
      },
      {
        ...project,
        feet: { ...project.feet, left: { ...project.feet.left, pads: [{}] } },
      },
    ];
    for (const field of [
      "rotation",
      "curve1",
      "curve2",
      "enabled",
      "id",
    ] as const) {
      const bad = newProject();
      (bad.feet.left.pads[0] as unknown as Record<string, unknown>)[field] =
        null;
      invalid.push(bad);
    }
    const duplicate = newProject();
    duplicate.feet.left.pads.push({ ...duplicate.feet.left.pads[0] });
    invalid.push(duplicate);
    for (const value of invalid)
      expect(() => parseInsoleProject(JSON.stringify(value))).toThrow();
    expect(() => parseInsoleProject("{broken json")).toThrow();
  });

  it("allows deleting every pad and sanitizes a blank name and dependent widths", () => {
    const project = newProject();
    project.name = "   ";
    for (const side of ["left", "right"] as const) {
      project.feet[side] = {
        ...project.feet[side],
        width: 65,
        heelWidth: 90,
        archWidth: 100,
        pads: [],
      };
    }
    const restored = parseInsoleProject(JSON.stringify(project));
    expect(restored.name).toBe("Untitled insole");
    expect(restored.feet.left.heelWidth).toBeLessThan(restored.feet.left.width);
    expect(restored.feet.left.archWidth).toBeLessThan(restored.feet.left.width);
    expect(restored.feet.left.pads).toEqual([]);
    expect(restored.feet.left).toEqual(restored.feet.right);
  });
});

describe("insole autosave storage", () => {
  it("reloads new heel lift edits and recovers old v3 autosaves without changing their shape", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    const previous = JSON.parse(JSON.stringify(newProject()));
    previous.feet.left.toeSpring = 7;
    previous.feet.right.toeSpring = 7;
    delete previous.feet.left.heelLift;
    delete previous.feet.right.heelLift;
    storage.entries.set(STORAGE_KEY, JSON.stringify(previous));
    const loaded = loadInsoleProject();
    expect(loaded.feet.left.heelLift).toBe(0);
    expect(loaded.feet.right.heelLift).toBe(0);
    expect(loaded.feet.left.toeSpring).toBe(7);
    const edited = {
      ...loaded,
      linked: false,
      feet: {
        left: { ...loaded.feet.left, heelLift: 9.5 },
        right: { ...loaded.feet.right, heelLift: 4 },
      },
    };
    saveInsoleProject(edited);
    expect(loadInsoleProject()).toEqual(edited);
    expect(parseInsoleProject(storage.entries.get(STORAGE_KEY)!)).toEqual(
      edited,
    );
    storage.entries.set(STORAGE_KEY, "{broken");
    expect(loadInsoleProject()).toEqual(loaded);
  });

  it("loads and migrates the original autosave key", () => {
    const storage = memoryStorage();
    storage.entries.set(STORAGE_KEY, JSON.stringify(legacyProject()));
    vi.stubGlobal("localStorage", storage);
    const project = loadInsoleProject();
    expect(project.version).toBe(3);
    expect(project.feet.left.pads[0].length).toBe(38);
    saveInsoleProject(project);
    expect(JSON.parse(storage.entries.get(STORAGE_KEY)!).version).toBe(3);
  });

  it("keeps a previous valid autosave and recovers it if the primary becomes malformed", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    const first = newProject();
    first.name = "First shape";
    saveInsoleProject(first);
    const latest = newProject();
    latest.name = "Latest shape";
    saveInsoleProject(latest);
    // pagehide/visibility/unmount can flush the same state repeatedly.
    saveInsoleProject(latest);
    expect(loadInsoleProject()).toEqual(latest);
    expect(JSON.parse(storage.entries.get(BACKUP_STORAGE_KEY)!).name).toBe(
      "First shape",
    );
    storage.entries.set(STORAGE_KEY, "{partial");
    expect(loadInsoleProject()).toEqual(first);
    expect(JSON.parse(storage.entries.get(STORAGE_KEY)!).name).toBe(
      "First shape",
    );
  });

  it("does not overwrite a valid backup with a malformed primary", () => {
    const storage = memoryStorage();
    const first = newProject();
    first.name = "Recovery shape";
    storage.entries.set(BACKUP_STORAGE_KEY, JSON.stringify(first));
    storage.entries.set(STORAGE_KEY, "unreadable");
    vi.stubGlobal("localStorage", storage);
    saveInsoleProject(newProject());
    expect(JSON.parse(storage.entries.get(BACKUP_STORAGE_KEY)!).name).toBe(
      "Recovery shape",
    );
  });

  it("survives unavailable storage on load and reports primary write failures on save", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("Storage blocked");
      },
      setItem() {
        throw new Error("Storage full");
      },
    });
    expect(loadInsoleProject()).toEqual(newProject());
    expect(() => saveInsoleProject(newProject())).toThrow("Storage full");
  });

  it("saves the primary even when the backup slot cannot be written", () => {
    const storage = memoryStorage();
    storage.setItem.mockImplementation((key, value) => {
      if (key === BACKUP_STORAGE_KEY) throw new Error("Backup quota");
      storage.entries.set(key, value);
      return storage.entries;
    });
    vi.stubGlobal("localStorage", storage);
    saveInsoleProject(newProject());
    expect(loadInsoleProject()).toEqual(newProject());
  });
});

describe("density project persistence", () => {
  it("autosaves nested density edits and recovers the previous density configuration", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    const project = newProject();
    for (const foot of [project.feet.left, project.feet.right]) {
      foot.density.arch = { infill: 38, scope: "support" };
      foot.density.pads[foot.pads[0].id] = { infill: 50, scope: "full" };
      foot.density.zones = [{ ...makeDensityZone(), id: "soft-heel" }];
    }
    saveInsoleProject(project);
    expect(loadInsoleProject()).toEqual(project);
    for (const foot of [project.feet.left, project.feet.right]) {
      foot.density.zones[0].infill = 80;
      foot.density.arch!.scope = "full";
    }
    saveInsoleProject(project);
    expect(loadInsoleProject()).toEqual(project);
    storage.entries.set(STORAGE_KEY, "{broken");
    const recovered = loadInsoleProject();
    expect(recovered.feet.left.density.zones[0].infill).toBe(12);
    expect(recovered.feet.left.density.arch).toEqual({
      infill: 38,
      scope: "support",
    });
    expect(recovered.feet.right.density).toEqual(recovered.feet.left.density);
  });

  it("round-trips overlapping regions, all scopes, and support overrides independently", () => {
    const project = newProject();
    project.linked = false;
    const density = project.feet.left.density;
    density.baseInfill = 15;
    density.pattern = "rectilinear";
    density.arch = { infill: 43, scope: "support" };
    density.heel = { infill: 66, scope: "base" };
    density.pads[project.feet.left.pads[0].id] = { infill: 28, scope: "full" };
    density.zones = [
      {
        ...makeDensityZone(0),
        id: "heel-soft",
        name: "Soft heel",
        infill: 8,
        scope: "base",
        position: 0.2,
        rotation: -27,
      },
      {
        ...makeDensityZone(1),
        id: "heel-firm",
        name: "Firm heel",
        shape: "box",
        infill: 70,
        scope: "full",
        position: 0.2,
        rotation: 32,
        enabled: false,
      },
    ];
    const restored = parseInsoleProject(JSON.stringify(project));
    expect(restored).toEqual(project);
    expect(restored.feet.left.density).not.toBe(density);
    expect(restored.feet.left.density.arch).not.toBe(density.arch);
    expect(
      restored.feet.left.density.pads[project.feet.left.pads[0].id],
    ).not.toBe(density.pads[project.feet.left.pads[0].id]);
    expect(restored.feet.left.density.zones[0]).not.toBe(density.zones[0]);
    restored.feet.left.density.zones[0].infill = 90;
    expect(density.zones[0].infill).toBe(8);
    expect(restored.feet.right.density.zones).toEqual([]);
  });

  it("adds default density to v1 and v2 designs while preserving every v2 shape choice", () => {
    const project = newProject();
    project.linked = false;
    project.feet.left.archLength = 210;
    project.feet.left.archRotation = -37;
    project.feet.left.archPlateau = 0.74;
    project.feet.left.pads[0].curve1 = 0.17;
    project.feet.left.pads[0].curve2 = 0.81;
    project.feet.left.pads.push({
      ...makePad(1),
      id: "second-pad",
      rotation: 83,
      plateau: 0.57,
    });
    const { density: _leftDensity, ...left } = project.feet.left;
    const { density: _rightDensity, ...right } = project.feet.right;
    const legacy = { ...project, version: 2, feet: { left, right } };
    const restored = parseInsoleProject(JSON.stringify(legacy));
    expect(restored).toEqual(project);
    expect(restored.feet.left.density).toEqual(newProject().feet.left.density);
    expect(
      parseInsoleProject(JSON.stringify(legacyProject())).feet.left.density,
    ).toEqual(newProject().feet.left.density);
    restored.feet.left.density.zones.push(makeDensityZone());
    expect(restored.feet.right.density.zones).toEqual([]);
  });

  it("rejects malformed density fields, unsupported scopes/patterns, and unknown pad targets", () => {
    const project = newProject();
    const density = project.feet.left.density;
    const invalid = [
      undefined,
      null,
      { ...density, baseInfill: -1 },
      { ...density, baseInfill: 101 },
      { ...density, baseInfill: "20" },
      { ...density, pattern: "honeycomb" },
      { ...density, arch: undefined },
      { ...density, arch: { infill: 30, scope: "outside" } },
      { ...density, heel: { infill: 101, scope: "full" } },
      { ...density, pads: null },
      { ...density, pads: { missing: { infill: 20, scope: "full" } } },
      { ...density, pads: { "met-pad-1": null } },
      {
        ...density,
        pads: JSON.parse('{"__proto__":{"infill":20,"scope":"full"}}'),
      },
      { ...density, zones: null },
      { ...density, zones: [null] },
    ];
    for (const next of invalid) {
      const bad = {
        ...project,
        linked: false,
        feet: {
          ...project.feet,
          left: { ...project.feet.left, density: next },
        },
      };
      expect(() => parseInsoleProject(JSON.stringify(bad))).toThrow(/density/i);
    }
  });

  it("rejects malformed region identities and every out-of-range region parameter", () => {
    const project = newProject();
    const zone = makeDensityZone();
    const invalid: unknown[][] = [
      [{ ...zone, id: "" }],
      [{ ...zone, id: "constructor" }],
      [{ ...zone, id: "bad\u0000id" }],
      [{ ...zone, name: "x".repeat(101) }],
      [{ ...zone, shape: "polygon" }],
      [{ ...zone, scope: "skin" }],
      [{ ...zone, enabled: 1 }],
      [{ ...zone }, { ...zone }],
    ];
    for (const [key, [minimum, maximum]] of Object.entries(
      DENSITY_ZONE_LIMITS,
    )) {
      invalid.push([{ ...zone, [key]: minimum - 1 }]);
      invalid.push([{ ...zone, [key]: maximum + 1 }]);
      invalid.push([{ ...zone, [key]: "10" }]);
    }
    for (const zones of invalid) {
      const bad = {
        ...project,
        linked: false,
        feet: {
          ...project.feet,
          left: {
            ...project.feet.left,
            density: { ...project.feet.left.density, zones },
          },
        },
      };
      expect(() => parseInsoleProject(JSON.stringify(bad))).toThrow(
        /density region/i,
      );
    }
  });

  it("enforces linked density equality but treats pad record key ordering as immaterial", () => {
    const changed = newProject();
    changed.feet.left.density.baseInfill = 43;
    expect(() => parseInsoleProject(JSON.stringify(changed))).toThrow(
      /linked pair.*matching/i,
    );
    const project = newProject();
    for (const side of ["left", "right"] as const) {
      project.feet[side].pads.push({ ...makePad(1), id: "second-pad" });
    }
    project.feet.left.density.pads = {
      "met-pad-1": { infill: 40, scope: "full" },
      "second-pad": { infill: 50, scope: "base" },
    };
    project.feet.right.density.pads = {
      "second-pad": { infill: 50, scope: "base" },
      "met-pad-1": { infill: 40, scope: "full" },
    };
    expect(parseInsoleProject(JSON.stringify(project))).toEqual(project);
  });
});

describe("private studio preferences", () => {
  it("remembers Base & flex as a support feature without placing heel lift in UI storage or cookies", () => {
    const storage = memoryStorage();
    const mockDocument = { cookie: "" };
    vi.stubGlobal("document", mockDocument);
    vi.stubGlobal("localStorage", storage);
    saveStudioPreferences({
      step: "support",
      feature: "base",
      heelLift: 12,
    } as Parameters<typeof saveStudioPreferences>[0]);
    expect(readStudioPreferences()).toEqual({
      step: "support",
      feature: "base",
    });
    expect(JSON.parse(storage.entries.get(PREFERENCES_STORAGE_KEY)!)).toEqual({
      step: "support",
      feature: "base",
    });
    expect(mockDocument.cookie).not.toContain("heelLift");
    storage.entries.clear();
    expect(readStudioPreferences()).toEqual({
      step: "support",
      feature: "base",
    });
  });

  it("keeps full preferences in local storage and only non-sensitive UI state in the cookie", () => {
    const mockDocument = { cookie: "" };
    const storage = memoryStorage();
    vi.stubGlobal("document", mockDocument);
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("location", { protocol: "https:" });
    const preferences = {
      side: "left" as const,
      step: "support" as const,
      feature: "met" as const,
      selectedPadId: "pad & 2",
      selectedDensityZoneId: "heel-soft",
      sizeSystem: "birkenstock",
      sizeValue: "42",
    };
    saveStudioPreferences({
      ...preferences,
      feet: newProject().feet,
    } as typeof preferences);
    expect(mockDocument.cookie).toContain(`${PREFERENCES_COOKIE}=`);
    expect(mockDocument.cookie).toContain(
      "Max-Age=31536000; Path=/insole-studio/; SameSite=Strict; Secure",
    );
    const cookieValue = JSON.parse(
      decodeURIComponent(mockDocument.cookie.split(";")[0].split("=")[1]),
    );
    expect(cookieValue).toEqual({
      side: "left",
      step: "support",
      feature: "met",
    });
    expect(JSON.parse(storage.entries.get(PREFERENCES_STORAGE_KEY)!)).toEqual(
      preferences,
    );
    expect(mockDocument.cookie).not.toMatch(
      /archHeight|selectedPadId|selectedDensityZoneId|sizeSystem|sizeValue/,
    );
    expect(readStudioPreferences()).toEqual(preferences);
  });

  it("remembers the density editor step", () => {
    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal("localStorage", memoryStorage());
    saveStudioPreferences({ step: "density", selectedDensityZoneId: "zone-1" });
    expect(readStudioPreferences()).toEqual({
      step: "density",
      selectedDensityZoneId: "zone-1",
    });
  });

  it("remembers validated bed placement locally without adding it to cookies", () => {
    const storage = memoryStorage();
    const mockDocument = { cookie: "" };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("document", mockDocument);
    saveStudioPreferences({ exportPlacement: "original", bedClearance: 0 });
    expect(readStudioPreferences()).toEqual({
      exportPlacement: "original",
      bedClearance: 0,
    });
    expect(mockDocument.cookie).not.toMatch(/exportPlacement|bedClearance/);
    for (const invalid of [-1, 11, null, "3"]) {
      storage.entries.set(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify({ exportPlacement: "unknown", bedClearance: invalid }),
      );
      expect(readStudioPreferences()).toEqual({});
    }
  });

  it("ignores malformed storage and cookies without disrupting editing", () => {
    const storage = memoryStorage();
    storage.entries.set(PREFERENCES_STORAGE_KEY, "{broken");
    vi.stubGlobal("localStorage", storage);
    const mockDocument = { cookie: `${PREFERENCES_COOKIE}=%broken` };
    vi.stubGlobal("document", mockDocument);
    expect(readStudioPreferences()).toEqual({});
    mockDocument.cookie = `${PREFERENCES_COOKIE}=${encodeURIComponent(JSON.stringify({ side: "left", step: "admin", sizeValue: "42", selectedPadId: "ok", x: "ignored" }))}`;
    expect(readStudioPreferences()).toEqual({ side: "left" });
    vi.stubGlobal("document", undefined);
    expect(readStudioPreferences()).toEqual({});
    expect(() => saveStudioPreferences({ side: "right" })).not.toThrow();
  });

  it("uses only the minimal cookie when local storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("Storage blocked");
      },
      setItem() {
        throw new Error("Storage blocked");
      },
    });
    const mockDocument = { cookie: "" };
    vi.stubGlobal("document", mockDocument);
    vi.stubGlobal("location", { protocol: "http:" });
    expect(() =>
      saveStudioPreferences({
        step: "density",
        sizeValue: "42",
        selectedDensityZoneId: "private-zone",
      }),
    ).not.toThrow();
    expect(readStudioPreferences()).toEqual({ step: "density" });
    expect(mockDocument.cookie).not.toContain("Secure");
    expect(mockDocument.cookie).not.toContain("42");
    expect(mockDocument.cookie).not.toContain("private-zone");
  });

  it("keeps namespaces separate from the source application", () => {
    expect(STORAGE_KEY).toBe("insole-studio.project.v1");
    expect(BACKUP_STORAGE_KEY).toBe("insole-studio.project.backup");
    expect(PREFERENCES_STORAGE_KEY).toBe("insole-studio.preferences.v1");
    expect(PREFERENCES_COOKIE).toBe("insole_studio_ui");
  });
});
