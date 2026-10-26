import { describe, expect, it } from "vitest";
import { clampParams, DEFAULT_PARAMS, makePad } from "../src/insole/model";
import { sizeOptions, sizePreset } from "../src/insole/sizes";

describe("insole size starting points", () => {
  it("applies the EU 42 foot reference with an explicit toe allowance", () => {
    const regular = sizePreset(DEFAULT_PARAMS, 42, false);
    const narrow = sizePreset(DEFAULT_PARAMS, 42, true);
    expect(regular.footLength).toBe(270);
    expect(regular.params.length).toBe(280);
    expect(regular.params.width).toBe(103);
    expect(narrow.footLength).toBe(270);
    expect(narrow.params.length).toBe(280);
    expect(narrow.params.width).toBe(95);
    expect(sizePreset(DEFAULT_PARAMS, 42, false, 0).params.length).toBe(270);
    expect(sizePreset(DEFAULT_PARAMS, 42, false, 30).params.length).toBe(300);
  });

  it("maps Birkenstock US men's and women's ranges to the same EU preset", () => {
    const men = sizeOptions("us-men").find((option) => option.value === "42");
    const women = sizeOptions("us-women").find(
      (option) => option.value === "42",
    );
    expect(men?.label).toBe("US 9–9.5 · EU 42");
    expect(women?.label).toBe("US 11–11.5 · EU 42");
    expect(
      sizeOptions("eu").find((option) => option.value === "42")?.label,
    ).toBe("EU 42");
    expect(sizeOptions("us-men").some((option) => option.value === "35")).toBe(
      false,
    );
    expect(
      sizeOptions("us-women").some((option) => option.value === "50"),
    ).toBe(false);
  });

  it("rejects sizes outside the listed reference table", () => {
    expect(() => sizePreset(DEFAULT_PARAMS, 42.5, false)).toThrow(
      "Choose a listed size.",
    );
    expect(() => sizePreset(DEFAULT_PARAMS, 34, false)).toThrow(
      "Choose a listed size.",
    );
    expect(() => sizePreset(DEFAULT_PARAMS, Number.NaN, false)).toThrow(
      "Choose a listed size.",
    );
  });

  it("changes only the outline dimensions while preserving independent support edits", () => {
    const source = clampParams({
      archHeight: 24,
      archLength: 190,
      archSpan: 80,
      archOffset: -35,
      archPosition: 0.55,
      archRotation: 17,
      archPlateau: 0.4,
      archCurve1: 0.8,
      archCurve2: 0.2,
      baseThickness: 4.5,
      heelCupHeight: 16,
      toeSpring: 7,
      pads: [
        { ...makePad(), height: 12, rotation: 42, offset: -12, curve1: 0.7 },
        { ...makePad(1), height: 8, position: 0.6, enabled: false },
      ],
    });
    const before = structuredClone(source);
    const result = sizePreset(source, 42, false).params;
    expect(result.pads).toEqual(source.pads);
    expect(result.pads).not.toBe(source.pads);
    expect(result.pads[0]).not.toBe(source.pads[0]);
    for (const key of [
      "archHeight",
      "archLength",
      "archSpan",
      "archOffset",
      "archPosition",
      "archRotation",
      "archPlateau",
      "archCurve1",
      "archCurve2",
      "baseThickness",
      "heelCupHeight",
      "toeSpring",
    ] as const) {
      expect(result[key]).toBe(source[key]);
    }
    expect(source).toEqual(before);
  });
});
