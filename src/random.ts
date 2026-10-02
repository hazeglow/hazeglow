import { MAX_MESH_POINTS, type GradientConfig, type MeshPoint, type Shape } from "./config";

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PaletteFamily {
  colors: readonly string[];
  backgrounds: readonly string[];
}

export const PALETTE_FAMILIES: Record<string, PaletteFamily> = {
  dusk: {
    colors: ["#6a3df5", "#35aef2", "#c9a0e8", "#f59a22", "#3a5cf5", "#5a28e8"],
    backgrounds: ["#05030f", "#0a0828"],
  },
  pearl: {
    colors: ["#b3c4f2", "#c2c4ee", "#d2c0e6", "#eda424", "#ee9cc4", "#2f4de0"],
    backgrounds: ["#02030c", "#0b1030"],
  },
  ember: {
    colors: ["#1d2c44", "#5b6f8a", "#a9a39c", "#f58220", "#ea4f08"],
    backgrounds: ["#0a0402", "#120a08"],
  },
  horizon: {
    colors: ["#050e7a", "#1232e0", "#2a52f0", "#8f9cf4", "#f07a2a", "#e59cf4"],
    backgrounds: ["#01020a", "#04061c"],
  },
  ultraviolet: {
    colors: ["#ff9a2a", "#ff4fc4", "#f23fe2", "#7a2be0", "#2a0f6a"],
    backgrounds: ["#07020f", "#12052a"],
  },
  candy: {
    colors: ["#4fc4f0", "#a8e0f0", "#f0d9a0", "#f2a13a", "#f0603c", "#e83fd0"],
    backgrounds: ["#3b2fd9", "#b02fd0"],
  },
};

const FAMILIES = Object.values(PALETTE_FAMILIES);
const MESH_ATTEMPTS = 8;

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function randomMesh(seed: number, palette: readonly string[], count: number): MeshPoint[] {
  const next = mulberry32((Math.floor(seed) ^ 0x9e3779b9) >>> 0);
  const total = Math.min(MAX_MESH_POINTS, Math.max(1, Math.round(count)));
  const points: MeshPoint[] = [];
  for (let index = 0; index < total; index++) {
    let best: [number, number] = [0.5, 0.5];
    let bestDistance = -1;
    for (let attempt = 0; attempt < MESH_ATTEMPTS; attempt++) {
      const x = next();
      const y = next();
      const distance = Math.min(...points.map((point) => Math.hypot(point[0] - x, point[1] - y)), 2);
      if (distance > bestDistance) {
        best = [x, y];
        bestDistance = distance;
      }
    }
    points.push([round3(best[0]), round3(best[1]), palette[index % palette.length] ?? "#000000"]);
  }
  return points;
}

export function randomConfig(seed: number): GradientConfig {
  const normalizedSeed = Math.floor(seed) >>> 0;
  const next = mulberry32(normalizedSeed);
  const range = (min: number, max: number) => round3(min + (max - min) * next());
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;

  const shapeRoll = next();
  const shape: Shape =
    shapeRoll < 0.3 ? "pill" : shapeRoll < 0.5 ? "blob" : shapeRoll < 0.63 ? "band" : shapeRoll < 0.78 ? "ring" : "mesh";
  const family = pick(FAMILIES);
  const reversed = next() < 0.25;
  const palette = reversed ? [...family.colors].reverse() : [...family.colors];
  const darkBackground = next() < 0.7;
  const familyBackground = pick(family.backgrounds);
  const background = darkBackground ? "#000000" : familyBackground;
  const flowing = next() < 0.4;
  const concentric = next() < 0.3;
  const upward = next() < 0.25;
  const tilted = next() < 0.4;
  const tilt = Math.round(range(-40, 40));
  const meshCount = 5 + Math.floor(next() * 6);

  const size: [number, number] =
    shape === "band"
      ? [1, range(0.3, 0.8)]
      : shape === "blob"
        ? [range(0.6, 1.1), range(0.5, 1)]
        : shape === "ring"
          ? [range(0.6, 1), range(0.55, 0.95)]
          : [range(0.5, 0.95), range(0.45, 0.9)];
  const center: [number, number] =
    shape === "band" ? [0.5, range(0.4, 0.75)] : [range(0.4, 0.6), range(0.38, 0.62)];
  const rampDirection =
    shape === "band" ? range(0.8, 1) : concentric ? range(0, 0.25) : range(0.6, 1);
  const rotates = shape === "pill" || shape === "blob" || shape === "ring";

  return {
    version: 1,
    seed: normalizedSeed,
    shape,
    center,
    size,
    roundness: range(0.3, 1),
    softness: range(0.38, 0.7),
    rotation: rotates && tilted ? (360 + tilt) % 360 : 0,
    rampDirection,
    angle: (upward ? 270 : 90) + Math.round(range(-12, 12)),
    warp: flowing ? range(0.3, 0.75) : range(0, 0.15),
    warpScale: flowing ? range(0.7, 1.3) : range(0.8, 1.6),
    palette,
    background,
    mesh: shape === "mesh" ? randomMesh(normalizedSeed, [...palette, background], meshCount) : [],
    grain: range(0.25, 0.5),
    motion: "drift",
    speed: 1,
    loop: 0,
    hover: 0,
    hoverMode: "pull",
    effect: "none",
    effectSize: 8,
    effectAmount: 0.5,
  };
}
