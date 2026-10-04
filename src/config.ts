import { isColor } from "./css-color";

export const SHAPES = ["pill", "band", "blob", "ring", "mesh"] as const;
export const MOTIONS = ["none", "drift", "breathe", "flow"] as const;
export const EFFECTS = ["none", "dither", "ascii", "halftone", "pixelate", "glass"] as const;
export const HOVER_MODES = ["pull", "push"] as const;

export type Shape = (typeof SHAPES)[number];
export type Motion = (typeof MOTIONS)[number];
export type Effect = (typeof EFFECTS)[number];
export type HoverMode = (typeof HOVER_MODES)[number];
export type MeshPoint = [x: number, y: number, color: string];

export interface GradientConfig {
  version: 1;
  seed: number;
  shape: Shape;
  center: [number, number];
  size: [number, number];
  roundness: number;
  softness: number;
  rotation: number;
  rampDirection: number;
  angle: number;
  warp: number;
  warpScale: number;
  palette: string[];
  background: string;
  mesh: MeshPoint[];
  grain: number;
  motion: Motion;
  speed: number;
  loop: number;
  hover: number;
  hoverMode: HoverMode;
  effect: Effect;
  effectSize: number;
  effectAmount: number;
}

export const MIN_STOPS = 2;
export const MAX_STOPS = 10;
export const MAX_MESH_POINTS = 16;

export const RANGES = {
  center: [0, 1],
  size: [0, 1.5],
  roundness: [0, 1],
  softness: [0, 1],
  rotation: [0, 360],
  rampDirection: [0, 1],
  angle: [0, 360],
  warp: [0, 1],
  warpScale: [0.5, 4],
  grain: [0, 1],
  speed: [0, 2],
  loop: [0, 30],
  hover: [0, 1],
  effectSize: [2, 64],
  effectAmount: [0, 1],
} as const satisfies Record<string, readonly [number, number]>;

export const DEFAULT_CONFIG: GradientConfig = {
  version: 1,
  seed: 1,
  shape: "pill",
  center: [0.5, 0.42],
  size: [0.86, 0.6],
  roundness: 0.7,
  softness: 0.5,
  rotation: 0,
  rampDirection: 0.9,
  angle: 90,
  warp: 0.06,
  warpScale: 1,
  palette: ["#6a3df5", "#35aef2", "#c9a0e8", "#f59a22", "#3a5cf5", "#5a28e8"],
  background: "#000000",
  mesh: [],
  grain: 0.3,
  motion: "drift",
  speed: 1,
  loop: 0,
  hover: 0,
  hoverMode: "pull",
  effect: "none",
  effectSize: 8,
  effectAmount: 0.5,
};

type Range = readonly [number, number];

function clamp(value: number, [min, max]: Range): number {
  return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseNumber(value: unknown, fallback: number, range: Range): number {
  return isFiniteNumber(value) ? clamp(value, range) : fallback;
}

function parsePair(value: unknown, fallback: [number, number], range: Range): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) return [fallback[0], fallback[1]];
  const [x, y] = value as unknown[];
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return [fallback[0], fallback[1]];
  return [clamp(x, range), clamp(y, range)];
}

function parseOption<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function defaultStop(index: number): string {
  const stops = DEFAULT_CONFIG.palette;
  return stops[Math.min(index, stops.length - 1)]!;
}

function parsePalette(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_CONFIG.palette];
  const stops = value.slice(0, MAX_STOPS).map((stop, index) => (isColor(stop) ? stop : defaultStop(index)));
  while (stops.length < MIN_STOPS) stops.push(defaultStop(stops.length));
  return stops;
}

function parseMesh(value: unknown): MeshPoint[] {
  if (!Array.isArray(value)) return [];
  const points: MeshPoint[] = [];
  for (const point of value as unknown[]) {
    if (points.length === MAX_MESH_POINTS) break;
    if (!Array.isArray(point) || point.length !== 3) continue;
    const [x, y, color] = point as unknown[];
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isColor(color)) continue;
    points.push([clamp(x, RANGES.center), clamp(y, RANGES.center), color]);
  }
  return points;
}

export function parseConfig(input: unknown): GradientConfig {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const fallback = DEFAULT_CONFIG;
  return {
    version: 1,
    seed: isFiniteNumber(raw.seed) ? Math.floor(raw.seed) >>> 0 : fallback.seed,
    shape: parseOption(raw.shape, SHAPES, fallback.shape),
    center: parsePair(raw.center, fallback.center, RANGES.center),
    size: parsePair(raw.size, fallback.size, RANGES.size),
    roundness: parseNumber(raw.roundness, fallback.roundness, RANGES.roundness),
    softness: parseNumber(raw.softness, fallback.softness, RANGES.softness),
    rotation: parseNumber(raw.rotation, fallback.rotation, RANGES.rotation),
    rampDirection: parseNumber(raw.rampDirection, fallback.rampDirection, RANGES.rampDirection),
    angle: parseNumber(raw.angle, fallback.angle, RANGES.angle),
    warp: parseNumber(raw.warp, fallback.warp, RANGES.warp),
    warpScale: parseNumber(raw.warpScale, fallback.warpScale, RANGES.warpScale),
    palette: parsePalette(raw.palette),
    background: isColor(raw.background) ? raw.background : fallback.background,
    mesh: parseMesh(raw.mesh),
    grain: parseNumber(raw.grain, fallback.grain, RANGES.grain),
    motion: parseOption(raw.motion, MOTIONS, fallback.motion),
    speed: parseNumber(raw.speed, fallback.speed, RANGES.speed),
    loop: parseNumber(raw.loop, fallback.loop, RANGES.loop),
    hover: parseNumber(raw.hover, fallback.hover, RANGES.hover),
    hoverMode: parseOption(raw.hoverMode, HOVER_MODES, fallback.hoverMode),
    effect: parseOption(raw.effect, EFFECTS, fallback.effect),
    effectSize: parseNumber(raw.effectSize, fallback.effectSize, RANGES.effectSize),
    effectAmount: parseNumber(raw.effectAmount, fallback.effectAmount, RANGES.effectAmount),
  };
}
