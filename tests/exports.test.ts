import { describe, expect, it } from "vitest";
import * as core from "../src/core";
import * as everything from "../src/index";

const ENGINE = [
  "DEFAULT_CONFIG",
  "EFFECTS",
  "HOVER_MODES",
  "IDLE_POINTER",
  "MAX_MESH_POINTS",
  "MAX_STOPS",
  "MIN_STOPS",
  "MOTIONS",
  "RANGES",
  "SHAPES",
  "colorToOklab",
  "createRenderer",
  "decodeConfig",
  "encodeConfig",
  "hexToOklab",
  "isColor",
  "isHex",
  "isSettled",
  "linearToOklab",
  "linearToSrgb",
  "mulberry32",
  "parseConfig",
  "parseHex",
  "presets",
  "randomConfig",
  "randomMesh",
  "resolveConfig",
  "srgbToLinear",
  "stepPointer",
  "toHex",
];

describe("public api", () => {
  it("exposes the whole engine from the core entry", () => {
    expect(Object.keys(core).sort()).toEqual(ENGINE);
  });

  it("exposes the component and the whole engine from the main entry", () => {
    expect(Object.keys(everything).sort()).toEqual(["Hazeglow", ...ENGINE].sort());
  });

  it("hands out the same engine from both entries", () => {
    for (const name of ENGINE) {
      expect(everything[name as keyof typeof everything]).toBe(core[name as keyof typeof core]);
    }
  });
});
