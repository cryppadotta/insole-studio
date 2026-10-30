import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDensityModifiers,
  getDensityAt,
  getDensityRegions,
  makeDensityZone,
  type DensityOverride,
} from "../src/insole/density";
import {
  createHistory,
  editHistory,
  redoHistory,
  undoHistory,
} from "../src/insole/history";
import { clampParams, cloneParams, makeNegativePad } from "../src/insole/model";
import {
  loadInsoleProject,
  newProject,
  parseInsoleProject,
  sameParams,
  saveInsoleProject,
} from "../src/insole/project";

const override: DensityOverride = {
  infill: 80,
  pattern: "cubic",
  temperature: 250,
  scope: "full",
};

afterEach(() => vi.unstubAllGlobals());

describe("negative pad project compatibility", () => {
  it("round-trips negative pads using project version 4", () => {
    const project = newProject();
    project.linked = false;
    project.feet.left.pads.push({
      ...makeNegativePad(),
      name: "Arch relief",
      height: 5,
      position: 0.4,
      offset: -10,
      width: 45,
      length: 80,
      rotation: 37,
      plateau: 0.2,
      curve1: 0.25,
      curve2: 0.75,
    });
    const restored = parseInsoleProject(JSON.stringify(project));
    expect(restored).toEqual(project);
    expect(restored.version).toBe(4);
    expect(restored.feet.left.pads.at(-1)?.operation).toBe("subtract");
    expect(restored.feet.left.pads.at(-1)).not.toBe(
      project.feet.left.pads.at(-1),
    );
    expect(restored.feet.right.pads).toHaveLength(1);
  });

  it("migrates a v3 additive project to v4 without changing its geometry or density settings", () => {
    const expected = newProject();
    expected.feet.left.density.arch = { ...override };
    expected.feet.right.density.arch = { ...override };
    const previous = JSON.parse(JSON.stringify(expected));
    previous.version = 3;
    for (const foot of Object.values(previous.feet) as Array<{
      pads: Array<{ operation?: string }>;
    }>) {
      for (const pad of foot.pads) delete pad.operation;
    }
    const migrated = parseInsoleProject(JSON.stringify(previous));
    expect(migrated.version).toBe(4);
    expect(migrated).toEqual(expected);
  });

  it("marks saved relief cuts with a version older v1–v3 readers reject", () => {
    const project = newProject();
    project.linked = false;
    project.feet.left.pads.push(makeNegativePad());
    const serialized = JSON.parse(JSON.stringify(project));
    expect(serialized.version).toBe(4);
    // Those readers allow only these versions before reading any foot geometry.
    expect([1, 2, 3]).not.toContain(serialized.version);
    expect(serialized.feet.left.pads.at(-1).operation).toBe("subtract");
  });

  it("retains negative pads in autosave and reload", () => {
    const entries = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
    });
    const project = newProject();
    const negative = makeNegativePad();
    project.feet.left.pads.push({ ...negative });
    project.feet.right.pads.push({ ...negative });
    saveInsoleProject(project);
    expect(loadInsoleProject()).toEqual(project);
  });

  it("treats omitted operations as add while keeping add and subtract distinct", () => {
    const project = newProject();
    delete project.feet.left.pads[0].operation;
    project.feet.right.pads[0].operation = "add";
    expect(sameParams(project.feet.left, project.feet.right)).toBe(true);
    expect(() => parseInsoleProject(JSON.stringify(project))).not.toThrow();
    project.feet.right.pads[0].operation = "subtract";
    expect(sameParams(project.feet.left, project.feet.right)).toBe(false);
    expect(() => parseInsoleProject(JSON.stringify(project))).toThrow(
      /linked pair/,
    );
  });

  it("records an operation-only edit and restores its meaning through undo and redo", () => {
    const project = newProject();
    delete project.feet.left.pads[0].operation;
    delete project.feet.right.pads[0].operation;
    const history = createHistory(project.feet, true);
    const feet = {
      left: cloneParams(project.feet.left),
      right: cloneParams(project.feet.right),
    };
    feet.left.pads[0].operation = "add";
    expect(editHistory(history, feet)).toBe(history);
    feet.left.pads[0].operation = "subtract";
    feet.right.pads[0].operation = "subtract";
    const edited = editHistory(history, feet);
    expect(edited.past).toHaveLength(1);
    expect(sameParams(history.present.left, edited.present.left)).toBe(false);
    const undone = undoHistory(edited);
    expect(sameParams(undone.present.left, project.feet.left)).toBe(true);
    expect(redoHistory(undone).present.left.pads[0].operation).toBe("subtract");
  });

  it.each([null, "remove", "", 0, false, {}, []])(
    "rejects an invalid supplied pad operation: %j",
    (operation) => {
      const project = newProject();
      (
        project.feet.left.pads[0] as unknown as Record<string, unknown>
      ).operation = operation;
      expect(() => parseInsoleProject(JSON.stringify(project))).toThrow(
        /pad 1 operation/,
      );
    },
  );
});

describe("negative pads and density regions", () => {
  it("drops stale cutter overrides while preserving independent custom zones", () => {
    const project = newProject();
    project.linked = false;
    const params = project.feet.left;
    const negative = makeNegativePad();
    params.pads.push(negative);
    params.density.pads[negative.id] = { ...override };
    params.density.pads[params.pads[0].id] = { ...override, infill: 60 };
    params.density.zones = [makeDensityZone()];

    for (const normalized of [
      clampParams(params),
      parseInsoleProject(JSON.stringify(project)).feet.left,
    ]) {
      expect(normalized.density.pads).not.toHaveProperty(negative.id);
      expect(normalized.density.pads[params.pads[0].id].infill).toBe(60);
      expect(normalized.density.zones).toEqual(params.density.zones);
      expect(normalized.pads.at(-1)?.operation).toBe("subtract");
    }
  });

  it("never exports or previews a cutter as a density modifier, even before normalization", () => {
    const params = newProject().feet.left;
    params.density.arch = { ...override };
    const top = getDensityRegions(params)[0].maxZ;
    const negative = {
      ...makeNegativePad(),
      height: 50,
      offset: 0,
      position: 0.8,
    };
    params.pads.push(negative);
    params.density.pads[negative.id] = { ...override };
    expect(getDensityRegions(params)[0].maxZ).toBe(top);
    expect(getDensityRegions(params).map((region) => region.source)).toEqual([
      "arch",
    ]);
    expect(getDensityAt(params, 0, 0.8 * params.length, 1)).toBe(
      params.density.baseInfill,
    );

    const zone = {
      ...makeDensityZone(),
      position: negative.position,
      offset: negative.offset,
      infill: 40,
    };
    params.density.zones.push(zone);
    expect(getDensityAt(params, 0, 0.8 * params.length, 1)).toBe(40);
    const modifiers = buildDensityModifiers(params, "left");
    expect(modifiers.map((modifier) => modifier.source)).toEqual([
      "arch",
      "zone",
    ]);
    expect(
      modifiers.some((modifier) => modifier.sourceId === negative.id),
    ).toBe(false);
    modifiers.forEach((modifier) => modifier.geometry.dispose());
  });
});
