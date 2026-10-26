import { describe, expect, it } from "vitest";
import {
  createHistory,
  editHistory,
  redoHistory,
  toggleHistoryLink,
  undoHistory,
  type History,
} from "../src/insole/history";
import { newProject, parseInsoleProject } from "../src/insole/project";
import { cloneDensity, makeDensityZone } from "../src/insole/density";

function expectValidProject(history: History) {
  const project = {
    ...newProject(),
    feet: history.present,
    linked: history.linked,
  };
  expect(parseInsoleProject(JSON.stringify(project))).toEqual(project);
  for (const state of [...history.past, ...history.future]) {
    const snapshotProject = {
      ...newProject(),
      feet: state.feet,
      linked: state.linked,
    };
    expect(parseInsoleProject(JSON.stringify(snapshotProject))).toEqual(
      snapshotProject,
    );
  }
}

describe("insole pair undo history", () => {
  it("tracks heel lift through independent edits, undo, redo and pair linking", () => {
    let history = createHistory(newProject().feet, false);
    history = editHistory(history, {
      ...history.present,
      right: { ...history.present.right, heelLift: 6.5 },
    });
    expect(history.past).toHaveLength(1);
    expect(history.present.left.heelLift).toBe(0);
    expect(history.present.right.heelLift).toBe(6.5);
    expect(editHistory(history, history.present)).toBe(history);
    history = undoHistory(history);
    expect(history.present.right.heelLift).toBe(0);
    history = redoHistory(history);
    expect(history.present.right.heelLift).toBe(6.5);
    history = toggleHistoryLink(history, "right");
    expect(history.present.left.heelLift).toBe(6.5);
    expect(history.present.right.heelLift).toBe(6.5);
    history = undoHistory(history);
    expect(history.linked).toBe(false);
    expect(history.present.left.heelLift).toBe(0);
    expect(history.present.right.heelLift).toBe(6.5);
    expectValidProject(history);
  });

  it("restores both feet and link state through unlink, independent edit, relink, undo and redo", () => {
    let history = createHistory(newProject().feet, true);
    history = toggleHistoryLink(history, "right");
    expect(history.linked).toBe(false);
    history = editHistory(
      history,
      {
        ...history.present,
        left: { ...history.present.left, archHeight: 19 },
      },
      true,
    );
    expect(history.present.right.archHeight).toBe(12);
    history = toggleHistoryLink(history, "left");
    expect(history.linked).toBe(true);
    expect(history.present.right.archHeight).toBe(19);
    expectValidProject(history);

    history = undoHistory(history);
    expect(history.linked).toBe(false);
    expect(history.present.left.archHeight).toBe(19);
    expect(history.present.right.archHeight).toBe(12);
    expectValidProject(history);

    history = undoHistory(history);
    expect(history.linked).toBe(false);
    expect(history.present.left.archHeight).toBe(12);
    history = undoHistory(history);
    expect(history.linked).toBe(true);
    expect(history.past).toHaveLength(0);
    expectValidProject(history);

    history = redoHistory(redoHistory(redoHistory(history)));
    expect(history.linked).toBe(true);
    expect(history.present.left.archHeight).toBe(19);
    expect(history.present.right.archHeight).toBe(19);
    expect(history.future).toHaveLength(0);
    expectValidProject(history);
  });

  it("coalesces repeated parameter edits and discards redo when a new edit branches", () => {
    let history = createHistory(newProject().feet, false);
    const original = history.present;
    history = editHistory(history, {
      ...history.present,
      right: { ...history.present.right, length: 272 },
    });
    history = editHistory(
      history,
      { ...history.present, right: { ...history.present.right, length: 274 } },
      true,
    );
    expect(history.past).toHaveLength(1);
    history = undoHistory(history);
    expect(history.present).toEqual(original);
    expect(history.future).toHaveLength(1);
    history = editHistory(history, {
      ...history.present,
      right: { ...history.present.right, width: 105 },
    });
    expect(history.future).toHaveLength(0);
    expect(redoHistory(history)).toBe(history);
    expectValidProject(history);
  });

  it("caps undo snapshots at 80 and leaves no-op edits unchanged", () => {
    const project = newProject();
    let history = createHistory(project.feet, false);
    expect(undoHistory(history)).toBe(history);
    expect(redoHistory(history)).toBe(history);
    expect(editHistory(history, project.feet)).toBe(history);
    for (let i = 0; i < 100; i++) {
      history = editHistory(history, {
        ...history.present,
        left: { ...history.present.left, archHeight: i % 2 ? 13 : 14 },
      });
    }
    expect(history.past).toHaveLength(80);
    for (let i = 0; i < 80; i++) history = undoHistory(history);
    expect(history.past).toHaveLength(0);
    expect(history.future).toHaveLength(80);
    expectValidProject(history);
  });
});

describe("pad history isolation", () => {
  it("captures nested pad additions, shape edits, ordering, enablement, and removal", () => {
    const project = newProject();
    let history = createHistory(project.feet, false);
    // The history owns its initial nested objects.
    project.feet.left.pads[0].height = 17;
    expect(history.present.left.pads[0].height).not.toBe(17);
    const first = history.present.left.pads[0];
    const second = { ...first, id: "second", name: "Second pad", height: 7 };
    history = editHistory(history, {
      ...history.present,
      left: { ...history.present.left, pads: [first, second] },
    });
    second.height = 20;
    expect(history.present.left.pads[1].height).toBe(7);
    history = editHistory(history, {
      ...history.present,
      left: {
        ...history.present.left,
        pads: [
          { ...history.present.left.pads[1], rotation: 42, plateau: 0.7 },
          { ...history.present.left.pads[0], enabled: false },
        ],
      },
    });
    const sculpted = history.present.left;
    history = editHistory(history, {
      ...history.present,
      left: { ...history.present.left, pads: [] },
    });
    expect(history.present.left.pads).toHaveLength(0);
    history = undoHistory(history);
    expect(history.present.left).toEqual(sculpted);
    expect(history.present.left.pads[0].rotation).toBe(42);
    expect(history.present.left.pads[1].enabled).toBe(false);
    history = undoHistory(history);
    expect(history.present.left.pads.map((pad) => pad.id)).toEqual([
      first.id,
      "second",
    ]);
    history = undoHistory(history);
    expect(history.present.left.pads).toHaveLength(1);
    history = redoHistory(redoHistory(redoHistory(history)));
    expect(history.present.left.pads).toHaveLength(0);
    expectValidProject(history);
  });

  it("clones pad collections when linking and detects metadata-only edits", () => {
    let history = createHistory(newProject().feet, false);
    history = editHistory(history, {
      ...history.present,
      left: {
        ...history.present.left,
        pads: history.present.left.pads.map((pad) => ({
          ...pad,
          name: "Renamed support",
        })),
      },
    });
    expect(history.past).toHaveLength(1);
    history = toggleHistoryLink(history, "left");
    expect(history.present.left.pads).not.toBe(history.present.right.pads);
    expect(history.present.left.pads[0]).not.toBe(
      history.present.right.pads[0],
    );
    expect(history.present.left.pads).toEqual(history.present.right.pads);
    expectValidProject(history);
    const undone = undoHistory(history);
    history.present.left.pads[0].name = "Edited after snapshot";
    expect(undone.present.left.pads[0].name).toBe("Renamed support");
  });
});

describe("density history isolation", () => {
  it("captures nested support and overlapping region changes through undo and redo", () => {
    const project = newProject();
    project.feet.left.density.arch = { infill: 40, scope: "support" };
    project.feet.left.density.zones.push({
      ...makeDensityZone(),
      id: "first",
      name: "Heel cushion",
      position: 0.2,
    });
    let history = createHistory(project.feet, false);
    project.feet.left.density.arch.infill = 90;
    project.feet.left.density.zones[0].infill = 90;
    expect(history.present.left.density.arch?.infill).toBe(40);
    expect(history.present.left.density.zones[0].infill).not.toBe(90);

    const next = cloneDensity(history.present.left.density);
    next.baseInfill = 35;
    next.pattern = "rectilinear";
    next.arch!.scope = "full";
    next.heel = { infill: 60, scope: "base" };
    next.pads[history.present.left.pads[0].id] = {
      infill: 25,
      scope: "support",
    };
    next.zones.push({
      ...makeDensityZone(1),
      id: "second",
      position: 0.2,
      shape: "box",
      rotation: -23,
    });
    history = editHistory(history, {
      ...history.present,
      left: { ...history.present.left, density: next },
    });
    const saved = cloneDensity(history.present.left.density);
    next.arch!.infill = 99;
    next.pads[history.present.left.pads[0].id].infill = 99;
    next.zones[1].rotation = 55;
    expect(history.present.left.density).toEqual(saved);
    expect(history.present.right.density.baseInfill).toBe(20);

    history = undoHistory(history);
    expect(history.present.left.density.baseInfill).toBe(20);
    expect(history.present.left.density.arch).toEqual({
      infill: 40,
      scope: "support",
    });
    expect(history.present.left.density.zones).toHaveLength(1);
    history = redoHistory(history);
    expect(history.present.left.density).toEqual(saved);
    expectValidProject(history);
  });

  it("treats every region field, scope, support override, and region order as an editable change", () => {
    const project = newProject();
    project.feet.left.density.zones.push(
      { ...makeDensityZone(), id: "first" },
      { ...makeDensityZone(1), id: "second" },
    );
    const density = project.feet.left.density;
    const edits = [
      { ...density, baseInfill: 37 },
      { ...density, pattern: "rectilinear" as const },
      { ...density, arch: { infill: 42, scope: "full" as const } },
      { ...density, heel: { infill: 70, scope: "support" as const } },
      {
        ...density,
        pads: { "met-pad-1": { infill: 15, scope: "base" as const } },
      },
      ...Object.entries({
        id: "renamed",
        name: "Renamed",
        enabled: false,
        shape: "box",
        scope: "support",
        infill: 77,
        position: 0.12,
        offset: -28,
        width: 73,
        length: 92,
        rotation: 81,
      }).map(([key, value]) => ({
        ...density,
        zones: [{ ...density.zones[0], [key]: value }, density.zones[1]],
      })),
      { ...density, zones: [...density.zones].reverse() },
    ];
    for (const next of edits) {
      const history = createHistory(project.feet, false);
      const updated = editHistory(history, {
        ...history.present,
        left: { ...history.present.left, density: next },
      });
      expect(updated.past).toHaveLength(1);
      expect(undoHistory(updated).present).toEqual(history.present);
    }
  });

  it("clones all density collections when linking and preserves the independent snapshot", () => {
    let history = createHistory(newProject().feet, false);
    const next = cloneDensity(history.present.left.density);
    next.arch = { infill: 40, scope: "support" };
    next.pads[history.present.left.pads[0].id] = { infill: 25, scope: "full" };
    next.zones.push({ ...makeDensityZone(), id: "heel" });
    history = editHistory(history, {
      ...history.present,
      left: { ...history.present.left, density: next },
    });
    history = toggleHistoryLink(history, "left");
    const { left, right } = history.present;
    expect(left.density).toEqual(right.density);
    expect(left.density).not.toBe(right.density);
    expect(left.density.arch).not.toBe(right.density.arch);
    expect(left.density.pads["met-pad-1"]).not.toBe(
      right.density.pads["met-pad-1"],
    );
    expect(left.density.zones[0]).not.toBe(right.density.zones[0]);
    const undone = undoHistory(history);
    left.density.zones[0].infill = 90;
    left.density.arch!.infill = 90;
    expect(undone.present.left.density.zones[0].infill).not.toBe(90);
    expect(undone.present.left.density.arch?.infill).toBe(40);
    expect(undone.present.right.density.zones).toHaveLength(0);
    expectValidProject(undone);
  });
});
