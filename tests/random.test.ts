import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config";
import { mulberry32, randomConfig, randomMesh } from "../src/random";

describe("mulberry32", () => {
  it("is deterministic for a seed", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("differs between seeds", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it("stays in [0, 1)", () => {
    const next = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("randomConfig", () => {
  it("gives the same config for the same seed", () => {
    expect(randomConfig(42)).toEqual(randomConfig(42));
  });

  it("gives different configs for different seeds", () => {
    expect(randomConfig(1)).not.toEqual(randomConfig(2));
  });

  it("records the seed it was built from", () => {
    expect(randomConfig(987654).seed).toBe(987654);
  });

  it("only produces configs that parseConfig leaves unchanged", () => {
    for (let seed = 0; seed < 1000; seed++) {
      const config = randomConfig(seed);
      expect(parseConfig(config)).toEqual(config);
    }
  });

  it("uses every shape across a range of seeds", () => {
    const shapes = new Set<string>();
    for (let seed = 0; seed < 200; seed++) shapes.add(randomConfig(seed).shape);
    expect([...shapes].sort()).toEqual(["band", "blob", "mesh", "pill", "ring"]);
  });

  it("gives mesh configs 5 to 10 points and other shapes none", () => {
    for (let seed = 0; seed < 300; seed++) {
      const config = randomConfig(seed);
      if (config.shape === "mesh") {
        expect(config.mesh.length).toBeGreaterThanOrEqual(5);
        expect(config.mesh.length).toBeLessThanOrEqual(10);
      } else {
        expect(config.mesh).toEqual([]);
      }
    }
  });

  it("leaves the hover reaction off, because it is opt-in", () => {
    for (let seed = 0; seed < 100; seed++) {
      expect(randomConfig(seed).hover).toBe(0);
    }
  });
});

describe("randomMesh", () => {
  const palette = ["#111111", "#222222", "#333333"];

  it("is deterministic", () => {
    expect(randomMesh(9, palette, 8)).toEqual(randomMesh(9, palette, 8));
  });

  it("returns the requested number of points, within 1 to 16", () => {
    expect(randomMesh(1, palette, 7)).toHaveLength(7);
    expect(randomMesh(1, palette, 0)).toHaveLength(1);
    expect(randomMesh(1, palette, 99)).toHaveLength(16);
  });

  it("keeps earlier points when the count grows", () => {
    expect(randomMesh(4, palette, 9).slice(0, 5)).toEqual(randomMesh(4, palette, 5));
  });

  it("places points inside the canvas and cycles through the palette", () => {
    const points = randomMesh(3, palette, 7);
    points.forEach(([x, y, color], index) => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
      expect(color).toBe(palette[index % palette.length]);
    });
  });

  it("spreads points apart", () => {
    const points = randomMesh(5, palette, 8);
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const distance = Math.hypot(points[i]![0] - points[j]![0], points[i]![1] - points[j]![1]);
        expect(distance).toBeGreaterThan(0.08);
      }
    }
  });
});
