import { DEFAULT_CONFIG, type GradientConfig } from "./config";
import { PALETTE_FAMILIES } from "./random";

function preset(family: string, overrides: Partial<GradientConfig>): GradientConfig {
  return {
    ...DEFAULT_CONFIG,
    palette: [...PALETTE_FAMILIES[family]!.colors],
    ...overrides,
  };
}

export const presets: Record<string, GradientConfig> = {
  dusk: preset("dusk", {
    seed: 1,
    center: [0.5, 0.42],
    size: [0.86, 0.6],
    roundness: 0.7,
    softness: 0.5,
    rampDirection: 0.9,
  }),
  pearl: preset("pearl", {
    seed: 22,
    shape: "pill",
    center: [0.2, 0.9],
    size: [1.5, 1.3],
    roundness: 1,
    softness: 0.4,
    rampDirection: 0.15,
    angle: 315,
    warp: 0.6,
    warpScale: 1.1,
  }),
  ember: preset("ember", {
    seed: 3,
    shape: "pill",
    center: [0.5, 0.3],
    size: [0.9, 1],
    roundness: 0.45,
    softness: 0.22,
    rampDirection: 0.55,
    angle: 90,
    warp: 0.03,
  }),
  horizon: preset("horizon", {
    seed: 4,
    shape: "band",
    center: [0.5, 0.64],
    size: [1, 0.86],
    softness: 0.62,
    rampDirection: 1,
    angle: 90,
    warp: 0.02,
  }),
  ultraviolet: preset("ultraviolet", {
    seed: 11,
    shape: "blob",
    center: [0.6, 0.5],
    size: [1.5, 1.05],
    roundness: 0.62,
    softness: 0.4,
    rampDirection: 0.15,
    angle: 90,
    warp: 0.85,
    warpScale: 1.2,
  }),
  candy: preset("candy", {
    seed: 6,
    shape: "pill",
    center: [0.5, 0.47],
    size: [0.62, 0.56],
    roundness: 0.6,
    softness: 0.5,
    rampDirection: 0.92,
    angle: 90,
    warp: 0.04,
    background: "#3b2fd9",
  }),
};
