import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, MAX_STOPS, parseConfig } from "../src/config";
import { encodeConfig } from "../src/encode";

describe("parseConfig", () => {
  it("returns the default config for non-object input", () => {
    for (const input of [undefined, null, 42, "nope", [], true]) {
      expect(parseConfig(input)).toEqual(DEFAULT_CONFIG);
    }
  });

  it("returns a valid config unchanged", () => {
    expect(parseConfig(DEFAULT_CONFIG)).toEqual(DEFAULT_CONFIG);
  });

  it("does not return the default object itself", () => {
    const parsed = parseConfig(undefined);
    expect(parsed).not.toBe(DEFAULT_CONFIG);
    expect(parsed.palette).not.toBe(DEFAULT_CONFIG.palette);
  });

  it("fills missing fields with defaults", () => {
    const parsed = parseConfig({ shape: "blob", grain: 0.2 });
    expect(parsed).toEqual({ ...DEFAULT_CONFIG, shape: "blob", grain: 0.2 });
  });

  it("clamps out-of-range numbers", () => {
    const parsed = parseConfig({
      softness: 5,
      warp: -1,
      warpScale: 100,
      angle: 720,
      speed: -3,
      roundness: 2,
      rampDirection: -0.5,
      grain: 9,
      center: [-1, 2],
      size: [9, -9],
    });
    expect(parsed.softness).toBe(1);
    expect(parsed.warp).toBe(0);
    expect(parsed.warpScale).toBe(4);
    expect(parsed.angle).toBe(360);
    expect(parsed.speed).toBe(0);
    expect(parsed.roundness).toBe(1);
    expect(parsed.rampDirection).toBe(0);
    expect(parsed.grain).toBe(1);
    expect(parsed.center).toEqual([0, 1]);
    expect(parsed.size).toEqual([1.5, 0]);
  });

  it("replaces wrongly typed fields with defaults", () => {
    const parsed = parseConfig({
      shape: "hexagon",
      motion: 3,
      softness: "soft",
      warp: Number.NaN,
      center: [0.5],
      size: "big",
      background: "blue",
    });
    expect(parsed.shape).toBe(DEFAULT_CONFIG.shape);
    expect(parsed.motion).toBe(DEFAULT_CONFIG.motion);
    expect(parsed.softness).toBe(DEFAULT_CONFIG.softness);
    expect(parsed.warp).toBe(DEFAULT_CONFIG.warp);
    expect(parsed.center).toEqual(DEFAULT_CONFIG.center);
    expect(parsed.size).toEqual(DEFAULT_CONFIG.size);
    expect(parsed.background).toBe(DEFAULT_CONFIG.background);
  });

  it("normalises the seed to a uint32", () => {
    expect(parseConfig({ seed: 12.9 }).seed).toBe(12);
    expect(parseConfig({ seed: -1 }).seed).toBe(4294967295);
    expect(parseConfig({ seed: "x" }).seed).toBe(DEFAULT_CONFIG.seed);
  });

  it("replaces invalid palette colours with the default for that slot", () => {
    const parsed = parseConfig({ palette: ["#112233", "nope", "#445566"] });
    expect(parsed.palette).toEqual(["#112233", DEFAULT_CONFIG.palette[1], "#445566"]);
  });

  it("allows up to 10 colours, so there is room to add to the six-colour default", () => {
    expect(MAX_STOPS).toBe(10);
    expect(DEFAULT_CONFIG.palette.length).toBeLessThan(MAX_STOPS);
    const palette = Array.from({ length: 10 }, (_, index) => `#${String(index).repeat(6)}`);
    expect(parseConfig({ palette }).palette).toEqual(palette);
  });

  it("trims palettes longer than 10 colours", () => {
    const palette = Array.from({ length: 13 }, (_, index) => `#${(index + 1).toString(16).repeat(6)}`);
    expect(parseConfig({ palette }).palette).toEqual(palette.slice(0, 10));
  });

  it("fills an invalid colour beyond the default palette's length with a default", () => {
    const palette = Array.from({ length: 8 }, () => "#123456");
    palette[7] = "nope";
    expect(parseConfig({ palette }).palette[7]).toBe(DEFAULT_CONFIG.palette[DEFAULT_CONFIG.palette.length - 1]);
  });

  it("pads palettes shorter than 2 stops from the default palette", () => {
    expect(parseConfig({ palette: ["#111111"] }).palette).toEqual(["#111111", DEFAULT_CONFIG.palette[1]]);
    expect(parseConfig({ palette: [] }).palette).toEqual(DEFAULT_CONFIG.palette.slice(0, 2));
  });

  it("always reports the current version", () => {
    expect(parseConfig({ version: 99 }).version).toBe(1);
  });
});

describe("parseConfig effects", () => {
  it("defaults to no effect", () => {
    const parsed = parseConfig({});
    expect(parsed.effect).toBe("none");
    expect(parsed.effectSize).toBe(DEFAULT_CONFIG.effectSize);
    expect(parsed.effectAmount).toBe(DEFAULT_CONFIG.effectAmount);
  });

  it("accepts every known effect", () => {
    for (const effect of ["none", "dither", "ascii", "halftone", "pixelate", "glass"]) {
      expect(parseConfig({ effect }).effect).toBe(effect);
    }
  });

  it("replaces an unknown effect with the default", () => {
    expect(parseConfig({ effect: "sparkle" }).effect).toBe("none");
  });

  it("clamps effect size and amount", () => {
    expect(parseConfig({ effectSize: 1000 }).effectSize).toBe(64);
    expect(parseConfig({ effectSize: 0 }).effectSize).toBe(2);
    expect(parseConfig({ effectAmount: 3 }).effectAmount).toBe(1);
    expect(parseConfig({ effectAmount: -3 }).effectAmount).toBe(0);
  });

  it("upgrades a config saved before effects existed", () => {
    const { effect, effectSize, effectAmount, ...legacy } = DEFAULT_CONFIG;
    expect(parseConfig(legacy)).toEqual({ ...legacy, effect, effectSize, effectAmount });
  });
});

describe("parseConfig shapes and mesh", () => {
  it("defaults to no rotation and no mesh points", () => {
    const parsed = parseConfig({});
    expect(parsed.rotation).toBe(0);
    expect(parsed.mesh).toEqual([]);
  });

  it("accepts the ring and mesh shapes", () => {
    expect(parseConfig({ shape: "ring" }).shape).toBe("ring");
    expect(parseConfig({ shape: "mesh" }).shape).toBe("mesh");
  });

  it("clamps rotation", () => {
    expect(parseConfig({ rotation: 500 }).rotation).toBe(360);
    expect(parseConfig({ rotation: -20 }).rotation).toBe(0);
  });

  it("keeps valid mesh points and clamps their positions", () => {
    const parsed = parseConfig({ mesh: [[0.2, 0.8, "#112233"], [-1, 4, "#abc"]] });
    expect(parsed.mesh).toEqual([[0.2, 0.8, "#112233"], [0, 1, "#abc"]]);
  });

  it("drops malformed mesh points", () => {
    const parsed = parseConfig({
      mesh: [[0.5, 0.5, "#112233"], [0.5, 0.5], [0.5, "x", "#112233"], [0.5, 0.5, "red"], "nope", null],
    });
    expect(parsed.mesh).toEqual([[0.5, 0.5, "#112233"]]);
  });

  it("limits mesh points to 16", () => {
    const mesh = Array.from({ length: 30 }, (_, i) => [i / 30, 0.5, "#112233"]);
    expect(parseConfig({ mesh }).mesh).toHaveLength(16);
  });

  it("treats a non-array mesh as empty", () => {
    expect(parseConfig({ mesh: "points" }).mesh).toEqual([]);
  });

  it("does not share mesh points with its input", () => {
    const mesh = [[0.5, 0.5, "#112233"]];
    expect(parseConfig({ mesh }).mesh[0]).not.toBe(mesh[0]);
  });
});

describe("parseConfig loop", () => {
  it("defaults to not looping", () => {
    expect(parseConfig({}).loop).toBe(0);
  });

  it("keeps a loop length in seconds", () => {
    expect(parseConfig({ loop: 8 }).loop).toBe(8);
  });

  it("clamps the loop length", () => {
    expect(parseConfig({ loop: -4 }).loop).toBe(0);
    expect(parseConfig({ loop: 500 }).loop).toBe(30);
  });
});

describe("parseConfig hover", () => {
  it("is off unless asked for", () => {
    expect(DEFAULT_CONFIG.hover).toBe(0);
    expect(parseConfig({}).hover).toBe(0);
  });

  it("can be switched on with a strength", () => {
    expect(parseConfig({ hover: 0.5 }).hover).toBe(0.5);
  });

  it("clamps the strength", () => {
    expect(parseConfig({ hover: -1 }).hover).toBe(0);
    expect(parseConfig({ hover: 7 }).hover).toBe(1);
  });

  it("upgrades a config saved before hover existed", () => {
    const { hover, hoverMode, ...legacy } = DEFAULT_CONFIG;
    expect(parseConfig(legacy)).toEqual({ ...legacy, hover, hoverMode });
  });

  it("pulls toward the pointer unless told to push", () => {
    expect(parseConfig({}).hoverMode).toBe("pull");
    expect(parseConfig({ hoverMode: "push" }).hoverMode).toBe("push");
  });

  it("replaces an unknown hover mode with pull", () => {
    expect(parseConfig({ hoverMode: "spin" }).hoverMode).toBe("pull");
  });

  it("keeps the mode of a config saved before modes existed as pull", () => {
    expect(parseConfig({ hover: 0.7 })).toMatchObject({ hover: 0.7, hoverMode: "pull" });
  });
});

describe("parseConfig colours", () => {
  const colourful = {
    palette: ["#abc", "oklch(0.7 0.15 200)", "var(--brand)", "var(--a, oklch(0.5 0.1 20))"],
    background: "var(--surface, #000)",
    mesh: [
      [0.2, 0.8, "oklch(0.7 0.1 200)"],
      [0.1, 0.1, "var(--m, #fff)"],
    ],
  };

  it("keeps oklch and var colours as given", () => {
    expect(parseConfig(colourful)).toMatchObject(colourful);
  });

  it("falls back to the default stop for an invalid colour", () => {
    const palette = ["oklch(0.5 0.1)", "var(--a, red)", " oklch(0.5 0.1 20)", "rgb(1,2,3)"];
    expect(parseConfig({ palette }).palette).toEqual(DEFAULT_CONFIG.palette.slice(0, 4));
  });

  it("falls back to the default background for an invalid colour", () => {
    for (const background of ["oklch(0.5)", "var(red)", "red", "var(--a, blue)"]) {
      expect(parseConfig({ background }).background).toBe(DEFAULT_CONFIG.background);
    }
  });

  it("still drops mesh points with an invalid colour", () => {
    const mesh = [
      [0.5, 0.5, "oklch(0.5 0.1)"],
      [0.5, 0.5, "var(red)"],
      [0.5, 0.5, "red"],
      [0.2, 0.8, "oklch(0.7 0.1 200)"],
      [0.1, 0.1, "var(--m, #fff)"],
    ];
    expect(parseConfig({ mesh }).mesh).toEqual([
      [0.2, 0.8, "oklch(0.7 0.1 200)"],
      [0.1, 0.1, "var(--m, #fff)"],
    ]);
  });

  it("keeps the key order", () => {
    expect(Object.keys(parseConfig(colourful))).toEqual(Object.keys(DEFAULT_CONFIG));
  });

  it("survives a deeply nested variable", () => {
    const deep = "var(--a, ".repeat(10000) + "#fff" + ")".repeat(10000);
    expect(parseConfig({ background: deep }).background).toBe(DEFAULT_CONFIG.background);
  });

  it("never produces a config that encodeConfig cannot encode", () => {
    const texts = [
      "oklch(\u3000 0.5 0.1 20)",
      "var(\u3000--a)",
      "var(--a,\ufeff#fff)",
      "oklch(0.5 0.1 20 /\u00a00.5)",
      "oklch(0.5\v0.1 20)",
      "oklch(0.5 0.1 20)",
      "var(--a, #fff)",
    ];
    for (const text of texts) {
      const config = parseConfig({ palette: [text, "#fff"], background: text, mesh: [[0.5, 0.5, text]] });
      expect(() => encodeConfig(config)).not.toThrow();
    }
  });
});
