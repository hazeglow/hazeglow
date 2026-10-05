import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cellGrid } from "../src/cells";
import { cellShader, compositeShader } from "../src/shader";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

const f = Math.fround;

function gpuCells(effect: string, effectSize: number, width: number, height: number): number[] {
  const short = f(Math.min(width, height));
  const cells: number[] = [];
  for (const scale of [f(short / 1080), f(short * f(1 / 1080))]) {
    const size = f(f(effectSize) * scale);
    if (effect === "ascii") cells.push(Math.max(7, size));
    else {
      const below = Math.floor(size);
      const fraction = size - below;
      if (fraction <= 0.5) cells.push(Math.max(1, below));
      if (fraction >= 0.5) cells.push(Math.max(1, below + 1));
    }
  }
  return cells;
}

function cellsNeeded(extent: number, cell: number): number {
  const pixel = f(extent - 0.5);
  return Math.max(Math.floor(f(pixel / cell)), Math.floor(f(pixel * f(1 / cell)))) + 1;
}

describe("cellGrid", () => {
  it("leaves effects without square cells on the single pass", () => {
    for (const effect of ["none", "glass", "halftone", "unknown"]) expect(cellGrid(effect, 8, 1920, 1080)).toBeNull();
  });

  it("leaves sizes outside the parsed range on the single pass", () => {
    for (const effectSize of [1.99, 64.01, Number.NaN, Infinity, -8]) expect(cellGrid("dither", effectSize, 1920, 1080)).toBeNull();
  });

  it("leaves one-pixel cells on the single pass", () => {
    expect(cellGrid("dither", 2, 780, 1688)).toBeNull();
    expect(cellGrid("pixelate", 2, 780, 1688)).toBeNull();
    expect(cellGrid("ascii", 2, 780, 1688)).not.toBeNull();
  });

  it("sizes the reference dither at 2200x1688", () => {
    expect(cellGrid("dither", 4, 2200, 1688)).toEqual({ width: 368, height: 283 });
  });

  it("covers every cell the GPU can address, whichever way it rounds", () => {
    const misses: unknown[] = [];
    let checked = 0;
    for (let width = 1; width <= 4100; width += 37) {
      for (let height = 1; height <= 4100; height += 211) {
        const scale = Math.min(width, height) / 1080;
        const sizes = [2, 2.5, 3, 4.5, 7, 16, 64];
        for (let k = 1.5; k < 140; k += 1) sizes.push(k / scale);
        for (const effect of ["dither", "pixelate", "ascii"]) {
          for (const effectSize of sizes) {
            const grid = cellGrid(effect, effectSize, width, height);
            if (!grid) continue;
            for (const cell of gpuCells(effect, effectSize, width, height)) {
              checked++;
              if (cell < 2 || cellsNeeded(width, cell) >= grid.width || cellsNeeded(height, cell) >= grid.height) {
                misses.push({ effect, effectSize, width, height, cell, grid });
              }
            }
          }
        }
      }
    }
    expect(misses).toEqual([]);
    expect(checked).toBeGreaterThan(100000);
  });
});

describe("cell pass shader sources", () => {
  it("keeps the cell shader byte for byte, so the picture cannot drift", () => {
    expect(cellShader()).toHaveLength(9439);
    expect(sha256(cellShader())).toBe("ab314364dc747ef43590a70b102cae67270af9e2f8c824fd323404efd332e7d2");
  });

  it("keeps the composite shader byte for byte, so the picture cannot drift", () => {
    expect(compositeShader()).toHaveLength(4948);
    expect(sha256(compositeShader())).toBe("c61f3687b16c6bd1bd3caaf346878ccb1b25a8638f779cc777f6cc63f6488118");
  });
});
