import { hexToOklab, isHex, type RGB } from "./color";
import { formatOklch, isColor, parseCssColor, parseOklch, parseVar } from "./css-color";
import type { GradientConfig } from "./config";

const WHITESPACE = /\s+/;
const MAX_DEPTH = 8;
const MAX_ENTRIES = 64;
const DARK_QUERY = "(prefers-color-scheme: dark)";
const LIGHT_DARK = "light-dark(";

interface Scratch {
  element: Element | null;
  context: CanvasRenderingContext2D | null | undefined;
}

export interface Colors {
  get(color: string): RGB;
  dispose(): void;
}

function viewOf(element: Element | null): (Window & typeof globalThis) | null {
  try {
    return element?.ownerDocument?.defaultView ?? null;
  } catch {
    return null;
  }
}

function readProperty(element: Element | null, name: string): string {
  try {
    const view = viewOf(element);
    if (!view || !element) return "";
    return String(view.getComputedStyle(element).getPropertyValue(name) ?? "").trim();
  } catch {
    return "";
  }
}

function readStyle(element: Element | null, key: "color" | "colorScheme"): string {
  try {
    const view = viewOf(element);
    if (!view || !element) return "";
    const value = view.getComputedStyle(element)[key];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function metaScheme(element: Element): string {
  const meta = element.ownerDocument.querySelector('meta[name="color-scheme"]');
  return (meta as HTMLMetaElement | null)?.content ?? "";
}

function usesDark(element: Element | null): boolean {
  try {
    const view = viewOf(element);
    if (!view || !element) return false;
    let scheme = readStyle(element, "colorScheme").toLowerCase();
    if (scheme === "" || scheme === "normal") scheme = metaScheme(element).toLowerCase();
    const words = scheme.split(WHITESPACE);
    const dark = words.includes("dark");
    const light = words.includes("light");
    if (dark && !light) return true;
    if (dark && light) return view.matchMedia(DARK_QUERY).matches === true;
    return false;
  } catch {
    return false;
  }
}

function scratchContext(scratch: Scratch): CanvasRenderingContext2D | null {
  if (scratch.context !== undefined) return scratch.context;
  let context: CanvasRenderingContext2D | null = null;
  try {
    const element = scratch.element;
    if (element) context = element.ownerDocument.createElement("canvas").getContext("2d");
  } catch {
    context = null;
  }
  scratch.context = context;
  return context;
}

function normalize(value: string, scratch: Scratch): string | null {
  try {
    const context = scratchContext(scratch);
    if (!context) return null;
    context.fillStyle = "#010203";
    context.fillStyle = value;
    const a = String(context.fillStyle);
    context.fillStyle = "#040506";
    context.fillStyle = value;
    const b = String(context.fillStyle);
    return a === b ? a : null;
  } catch {
    return null;
  }
}

function splitLightDark(inner: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === "," && depth === 0) {
      return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
    }
  }
  return null;
}

function readValue(
  value: string,
  element: Element | null,
  depth: number,
  scratch: Scratch,
): RGB | null {
  if (depth > MAX_DEPTH) return null;
  let text = value;
  if (text.toLowerCase() === "currentcolor") {
    text = readStyle(element, "color");
    if (text === "") return null;
  } else if (text.slice(0, LIGHT_DARK.length).toLowerCase() === LIGHT_DARK && text.endsWith(")")) {
    const pair = splitLightDark(text.slice(LIGHT_DARK.length, -1));
    if (!pair) return null;
    return readValue(usesDark(element) ? pair[1] : pair[0], element, depth + 1, scratch);
  }
  const direct = parseCssColor(text);
  if (direct) return direct;
  const normalized = normalize(text, scratch);
  return normalized === null ? null : parseCssColor(normalized);
}

function resolveText(
  text: string,
  element: Element | null,
  depth: number,
  scratch: Scratch,
): { text: string; lab: RGB } | null {
  const token = parseVar(text);
  if (!token || depth > MAX_DEPTH) return null;
  const value = element ? readProperty(element, token.name) : "";
  if (value !== "") {
    const lab = readValue(value, element, depth, scratch);
    if (lab) {
      return { text: isHex(value) || parseOklch(value) ? value : formatOklch(lab), lab };
    }
  }
  const fallback = token.fallback;
  if (fallback === null || fallback === "") return null;
  if (parseVar(fallback)) return resolveText(fallback, element, depth + 1, scratch);
  return { text: fallback, lab: parseOklch(fallback) ?? hexToOklab(fallback) };
}

function sameLab(a: RGB, b: RGB): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function createColors(element: Element | null, onChange: () => void): Colors {
  const cache = new Map<string, RGB>();
  const tokens = new Set<string>();
  const scratch: Scratch = { element, context: undefined };
  let observer: MutationObserver | null = null;
  let media: MediaQueryList | null = null;

  function isLive(): boolean {
    try {
      return element === null || element.isConnected;
    } catch {
      return false;
    }
  }

  function refresh(): void {
    try {
      if (tokens.size === 0) return;
      if (!element || !element.isConnected) {
        for (const token of tokens) cache.delete(token);
        tokens.clear();
        return;
      }
      let changed = false;
      for (const token of tokens) {
        const next = resolveText(token, element, 0, scratch)?.lab ?? ([0, 0, 0] as RGB);
        const previous = cache.get(token);
        if (!previous || !sameLab(previous, next)) {
          cache.set(token, next);
          changed = true;
        }
      }
      if (changed) onChange();
    } catch {
      return;
    }
  }

  const view = viewOf(element);
  if (view && element) {
    try {
      observer = new view.MutationObserver(refresh);
      observer.observe(element.ownerDocument.documentElement, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme"],
      });
    } catch {
      observer = null;
    }
    try {
      media = view.matchMedia(DARK_QUERY);
      media.addEventListener("change", refresh);
    } catch {
      media = null;
    }
  }

  function get(color: string): RGB {
    const hit = cache.get(color);
    if (hit) return hit;
    const isToken = parseVar(color) !== null && isColor(color);
    const lab: RGB = isToken
      ? (resolveText(color, element, 0, scratch)?.lab ?? [0, 0, 0])
      : (parseOklch(color) ?? hexToOklab(color));
    const store = !isToken || isLive();
    if (store) {
      if (cache.size >= MAX_ENTRIES) {
        cache.clear();
        tokens.clear();
      }
      cache.set(color, lab);
      if (isToken && element !== null) tokens.add(color);
    }
    return lab;
  }

  function dispose(): void {
    try {
      observer?.disconnect();
    } catch {
      observer = null;
    }
    try {
      media?.removeEventListener("change", refresh);
    } catch {
      media = null;
    }
    observer = null;
    media = null;
    cache.clear();
    tokens.clear();
    scratch.context = undefined;
    scratch.element = null;
  }

  return { get, dispose };
}

export function colorToOklab(color: string, element: Element | null = null): RGB | null {
  if (isHex(color)) return hexToOklab(color);
  const oklch = parseOklch(color);
  if (oklch) return oklch;
  if (parseVar(color) === null || !isColor(color)) return null;
  return resolveText(color, element, 0, { element, context: undefined })?.lab ?? null;
}

function resolveColor(color: unknown, element: Element, scratch: Scratch): unknown {
  if (typeof color !== "string" || parseVar(color) === null || !isColor(color)) return color;
  return resolveText(color, element, 0, scratch)?.text ?? "#000000";
}

export function resolveConfig(config: GradientConfig, element: Element): GradientConfig {
  const scratch: Scratch = { element, context: undefined };
  const palette = config.palette.map((color) => resolveColor(color, element, scratch) as string);
  const background = resolveColor(config.background, element, scratch) as string;
  const mesh = config.mesh.map(
    ([x, y, color]) => [x, y, resolveColor(color, element, scratch) as string] as [number, number, string],
  );
  return { ...config, palette, background, mesh };
}
