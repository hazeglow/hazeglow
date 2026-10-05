import { RANGES } from "./config";

export interface CellGrid {
  width: number;
  height: number;
}

export function cellGrid(effect: string, effectSize: number, width: number, height: number): CellGrid | null {
  if (!(effectSize >= RANGES.effectSize[0] && effectSize <= RANGES.effectSize[1])) return null;
  const size = (effectSize * Math.min(width, height)) / 1080;
  const cell = effect === "ascii" ? Math.max(7, size) * 0.999 : effect === "dither" || effect === "pixelate" ? Math.ceil(size - 0.501) : 0;
  if (!(cell >= 2)) return null;
  return { width: Math.floor(width / cell) + 2, height: Math.floor(height / cell) + 2 };
}
