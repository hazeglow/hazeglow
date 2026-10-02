import { describe, expect, it } from "vitest";
import { isHex, linearToOklab, linearToSrgb, parseHex, srgbToLinear, toHex } from "../src/color";

describe("parseHex", () => {
  it("parses 6-digit hex", () => {
    expect(parseHex("#ff8000")).toEqual([1, 128 / 255, 0]);
  });

  it("parses 3-digit hex", () => {
    expect(parseHex("#f80")).toEqual([1, 136 / 255, 0]);
  });

  it("is case-insensitive", () => {
    expect(parseHex("#FFFFFF")).toEqual([1, 1, 1]);
  });

  it("rejects anything else", () => {
    expect(parseHex("ff8000")).toBeNull();
    expect(parseHex("#ff80")).toBeNull();
    expect(parseHex("#gggggg")).toBeNull();
    expect(parseHex("red")).toBeNull();
  });
});

describe("isHex", () => {
  it("accepts only hex strings", () => {
    expect(isHex("#000")).toBe(true);
    expect(isHex("#12abEF")).toBe(true);
    expect(isHex(0)).toBe(false);
    expect(isHex(null)).toBe(false);
    expect(isHex("#12")).toBe(false);
  });
});

describe("srgbToLinear", () => {
  it("maps the endpoints to themselves", () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 10);
  });

  it("matches known values", () => {
    expect(srgbToLinear(0.5)).toBeCloseTo(0.21404, 4);
    expect(srgbToLinear(0.04045)).toBeCloseTo(0.0031308, 6);
  });
});

describe("linearToOklab", () => {
  it("maps white to L=1 with no chroma", () => {
    const [l, a, b] = linearToOklab([1, 1, 1]);
    expect(l).toBeCloseTo(1, 3);
    expect(a).toBeCloseTo(0, 3);
    expect(b).toBeCloseTo(0, 3);
  });

  it("maps black to the origin", () => {
    expect(linearToOklab([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("matches the reference value for pure red", () => {
    const [l, a, b] = linearToOklab([1, 0, 0]);
    expect(l).toBeCloseTo(0.628, 3);
    expect(a).toBeCloseTo(0.2249, 3);
    expect(b).toBeCloseTo(0.1258, 3);
  });
});

describe("linearToSrgb", () => {
  it("inverts srgbToLinear", () => {
    for (const value of [0, 0.002, 0.04045, 0.2, 0.5, 0.8, 1]) {
      expect(linearToSrgb(srgbToLinear(value))).toBeCloseTo(value, 6);
    }
  });
});

describe("toHex", () => {
  it("formats sRGB channels as 6-digit hex", () => {
    expect(toHex([1, 128 / 255, 0])).toBe("#ff8000");
    expect(toHex([0, 0, 0])).toBe("#000000");
  });

  it("clamps out-of-range channels", () => {
    expect(toHex([2, -1, 0.5])).toBe("#ff0080");
  });

  it("round-trips through parseHex", () => {
    expect(toHex(parseHex("#3aa7f0")!)).toBe("#3aa7f0");
  });
});
