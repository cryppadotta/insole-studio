import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { clampParams, makeNegativePad } from "../src/insole/model";
import { modifierBundle, prusaProject } from "../src/insole/prusa";

function vertices(xml: string) {
  return [
    ...xml.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g),
  ].map((match) => match.slice(1).map(Number));
}

describe("exported negative pad geometry", () => {
  it.each(["left", "right"] as const)(
    "bakes a deep recess into the single printable %s solid in 3MF and STL",
    (side) => {
      const base = clampParams({
        baseThickness: 6,
        archHeight: 0,
        heelCupHeight: 0,
        heelLift: 0,
        toeSpring: 0,
        pads: [],
      });
      const cut = {
        ...makeNegativePad(),
        height: 45,
        width: 80,
        length: 100,
        offset: 0,
        position: 0.5,
        rotation: 30,
      };
      const params = { ...base, pads: [cut] };
      // Stale imported material settings must never turn a cutter into a part.
      params.density.pads[cut.id] = {
        infill: 80,
        pattern: "cubic",
        temperature: 250,
        scope: "full",
      };
      const options = { profileMode: "design", placement: "original" } as const;
      const before = unzipSync(prusaProject(base, side, "Base", options));
      const after = unzipSync(prusaProject(params, side, "Relief", options));
      const original = vertices(strFromU8(before["3D/3dmodel.model"]));
      const carved = vertices(strFromU8(after["3D/3dmodel.model"]));
      expect(carved).toHaveLength(original.length);
      let changed = 0;
      for (let i = 0; i < carved.length; i++) {
        expect(carved[i].slice(0, 2)).toEqual(original[i].slice(0, 2));
        expect(carved[i][2]).toBeLessThanOrEqual(original[i][2]);
        if (carved[i][2] < original[i][2]) changed++;
        if (carved[i][2] > 0) expect(carved[i][2]).toBeGreaterThan(0.7999);
      }
      expect(changed).toBeGreaterThan(100);
      const config = strFromU8(after["Metadata/Slic3r_PE_model.config"]);
      expect([...config.matchAll(/<volume /g)]).toHaveLength(1);
      expect(config).not.toContain("ParameterModifier");
      const bundle = unzipSync(modifierBundle(params, side, "Relief"));
      const models = Object.keys(bundle).filter((name) =>
        name.endsWith(".stl"),
      );
      expect(models).toEqual([`insole-${side}-mm.stl`]);
      const stl = bundle[models[0]];
      const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
      const triangleCount = view.getUint32(80, true);
      let reliefVertices = 0;
      for (let triangle = 0; triangle < triangleCount; triangle++) {
        for (let corner = 0; corner < 3; corner++) {
          const z = view.getFloat32(
            84 + triangle * 50 + 12 + corner * 12 + 8,
            true,
          );
          expect(z === 0 || z >= 0.7999).toBe(true);
          if (z > 0 && z < 5.9) reliefVertices++;
        }
      }
      expect(reliefVertices).toBeGreaterThan(100);
    },
  );
});
