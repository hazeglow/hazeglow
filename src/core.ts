export {
  SHAPES,
  MOTIONS,
  EFFECTS,
  HOVER_MODES,
  MIN_STOPS,
  MAX_STOPS,
  MAX_MESH_POINTS,
  RANGES,
  DEFAULT_CONFIG,
  parseConfig,
} from "./config";
export type { GradientConfig, Shape, Motion, Effect, HoverMode, MeshPoint } from "./config";
export { encodeConfig, decodeConfig } from "./encode";
export { presets } from "./presets";
export { randomConfig, randomMesh, mulberry32 } from "./random";
export { isHex, parseHex, toHex, srgbToLinear, linearToSrgb, linearToOklab, hexToOklab } from "./color";
export type { RGB } from "./color";
export { createRenderer } from "./renderer";
export type { Renderer } from "./renderer";
export { IDLE_POINTER, stepPointer, isSettled } from "./pointer";
export type { PointerState, PointerTarget } from "./pointer";
