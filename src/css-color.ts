import { hexToOklab, isHex, linearToOklab, srgbToLinear, type RGB } from "./color";

const NUMBER = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i;
const ANGLE = /(deg|grad|rad|turn)$/i;
const NAME = /^--[A-Za-z0-9_-]+$/;
const SPACE = /[ \t\n\r\f]+/;
const HEX_ALPHA = /^#(?:[0-9a-f]{4}|[0-9a-f]{8})$/i;
const NONE = /^none$/i;
const UNSAFE = /[^\t\n\f\r\x20-\x7e]/;
const MAX_DEPTH = 8;

const XYZ_TO_SRGB = [
  [3.2409699419045213, -1.5373831775700935, -0.4986107602930033],
  [-0.9692436362808798, 1.8759675015077206, 0.04155505740717561],
  [0.05563007969699361, -0.20397695888897657, 1.0569715142428786],
];
const P3_TO_XYZ = [
  [0.48657094864821626, 0.26566769316909294, 0.1982172852343625],
  [0.22897456406974884, 0.6917385218365062, 0.079286914093745],
  [0, 0.045113381858902575, 1.0439443689009757],
];
const A98_TO_XYZ = [
  [0.5766690429101308, 0.18555823790654627, 0.18822864623499472],
  [0.29734497525053616, 0.627363566255466, 0.07529145849399789],
  [0.027031361386412378, 0.07068885253582714, 0.9913375368376389],
];
const REC2020_TO_XYZ = [
  [0.6369580483012913, 0.14461690358620838, 0.16888097516417205],
  [0.26270021201126703, 0.677998071518871, 0.059301716469861945],
  [0, 0.028072693049087508, 1.0609850577107909],
];
const PROPHOTO_TO_XYZ_D50 = [
  [0.7977666449006423, 0.13518129740053308, 0.0313477341283922],
  [0.2880748288194013, 0.711835234241873, 0.00008993693872564],
  [0, 0, 0.8251046025104602],
];
const D50_TO_D65 = [
  [0.955473421488075, -0.02309845494876471, 0.06325924320057072],
  [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
  [0.012314014864481998, -0.020507649298898964, 1.330365926242124],
];
const D50_WHITE = [0.9642956764295677, 1, 0.8251046025104602];
const KAPPA = 903.2962962962963;
const EPSILON = 0.008856451679035631;

function component(token: string, percent: number): number | null {
  if (NONE.test(token)) return 0;
  if (token.endsWith("%")) {
    const body = token.slice(0, -1);
    if (!NUMBER.test(body)) return null;
    const scaled = (Number(body) / 100) * percent;
    return Number.isFinite(scaled) ? scaled : null;
  }
  if (!NUMBER.test(token)) return null;
  const value = Number(token);
  return Number.isFinite(value) ? value : null;
}

function hue(token: string): number | null {
  if (NONE.test(token)) return 0;
  const unit = ANGLE.exec(token);
  const body = unit ? token.slice(0, -unit[0].length) : token;
  if (!NUMBER.test(body)) return null;
  const value = Number(body);
  if (!Number.isFinite(value)) return null;
  const name = unit ? unit[0].toLowerCase() : "deg";
  let radians = value;
  if (name === "deg") radians = (value * Math.PI) / 180;
  else if (name === "grad") radians = (value * Math.PI) / 200;
  else if (name === "turn") radians = value * 2 * Math.PI;
  return Number.isFinite(radians) ? radians : null;
}

function call(text: string): { name: string; inner: string } | null {
  if (UNSAFE.test(text)) return null;
  const open = text.indexOf("(");
  if (open < 0 || !text.endsWith(")")) return null;
  return { name: text.slice(0, open).toLowerCase(), inner: text.slice(open + 1, -1) };
}

function alphaValid(token: string): boolean {
  return !SPACE.test(token) && component(token, 1) !== null;
}

function split(inner: string): string[] | null {
  const parts = inner.split("/");
  if (parts.length > 2) return null;
  const main = (parts[0] as string).trim().split(SPACE);
  if (parts.length === 2 && !alphaValid((parts[1] as string).trim())) return null;
  return main;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function polar(chroma: number, angle: number): [number, number] {
  const size = Math.max(0, chroma);
  return [size * Math.cos(angle), size * Math.sin(angle)];
}

function oklchOf(inner: string): RGB | null {
  const parts = split(inner);
  if (!parts || parts.length !== 3) return null;
  const l = component(parts[0] as string, 1);
  const c = component(parts[1] as string, 0.4);
  const h = hue(parts[2] as string);
  if (l === null || c === null || h === null) return null;
  const [a, b] = polar(c, h);
  return [clamp(l, 0, 1), a, b];
}

export function parseOklch(text: string): RGB | null {
  const parsed = call(text);
  return parsed && parsed.name === "oklch" ? oklchOf(parsed.inner) : null;
}

export function parseVar(text: string): { name: string; fallback: string | null } | null {
  if (UNSAFE.test(text)) return null;
  if (text.slice(0, 4).toLowerCase() !== "var(" || !text.endsWith(")")) return null;
  const inner = text.slice(4, -1);
  const comma = inner.indexOf(",");
  const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
  if (!NAME.test(name)) return null;
  return { name, fallback: comma < 0 ? null : inner.slice(comma + 1).trim() };
}

function valid(value: string, depth: number): boolean {
  if (isHex(value) || parseOklch(value)) return true;
  const token = parseVar(value);
  if (!token || depth >= MAX_DEPTH) return false;
  return token.fallback === null || valid(token.fallback, depth + 1);
}

export function isColor(value: unknown): value is string {
  return typeof value === "string" && valid(value, 0);
}

function multiply(matrix: number[][], v: number[]): number[] {
  return matrix.map((row) => row.reduce((sum, entry, i) => sum + entry * (v[i] as number), 0));
}

function signed(channel: number, transfer: (value: number) => number): number {
  return channel < 0 ? -transfer(-channel) : transfer(channel);
}

function gamma(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function a98(value: number): number {
  return value ** 2.19921875;
}

function prophoto(value: number): number {
  return value <= 0.03125 ? value / 16 : value ** 1.8;
}

function rec2020(value: number): number {
  return value < 0.08124285829863151
    ? value / 4.5
    : ((value + 0.09929682680944008) / 1.09929682680944) ** 2.2222222222222223;
}

function xyzToOklab(xyz: number[]): RGB {
  return linearToOklab(multiply(XYZ_TO_SRGB, xyz) as RGB);
}

function d50ToOklab(xyz: number[]): RGB {
  return xyzToOklab(multiply(D50_TO_D65, xyz));
}

function labToOklab(l: number, a: number, b: number): RGB {
  const fy = (l + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const cubeX = fx ** 3;
  const cubeZ = fz ** 3;
  const x = cubeX > EPSILON ? cubeX : (116 * fx - 16) / KAPPA;
  const y = l > KAPPA * EPSILON ? fy ** 3 : l / KAPPA;
  const z = cubeZ > EPSILON ? cubeZ : (116 * fz - 16) / KAPPA;
  return d50ToOklab([x * (D50_WHITE[0] as number), y, z * (D50_WHITE[2] as number)]);
}

function labOf(inner: string): RGB | null {
  const parts = split(inner);
  if (!parts || parts.length !== 3) return null;
  const l = component(parts[0] as string, 100);
  const a = component(parts[1] as string, 125);
  const b = component(parts[2] as string, 125);
  if (l === null || a === null || b === null) return null;
  return labToOklab(clamp(l, 0, 100), a, b);
}

function lchOf(inner: string): RGB | null {
  const parts = split(inner);
  if (!parts || parts.length !== 3) return null;
  const l = component(parts[0] as string, 100);
  const c = component(parts[1] as string, 150);
  const h = hue(parts[2] as string);
  if (l === null || c === null || h === null) return null;
  const [a, b] = polar(c, h);
  return labToOklab(clamp(l, 0, 100), a, b);
}

function oklabOf(inner: string): RGB | null {
  const parts = split(inner);
  if (!parts || parts.length !== 3) return null;
  const l = component(parts[0] as string, 1);
  const a = component(parts[1] as string, 0.4);
  const b = component(parts[2] as string, 0.4);
  if (l === null || a === null || b === null) return null;
  return [clamp(l, 0, 1), a, b];
}

function colorOf(inner: string): RGB | null {
  const parts = split(inner);
  if (!parts || parts.length !== 4) return null;
  const space = (parts[0] as string).toLowerCase();
  const values = [1, 2, 3].map((i) => component(parts[i] as string, 1));
  if (values.some((value) => value === null)) return null;
  const v = values as number[];
  const each = (transfer: (value: number) => number) => v.map((channel) => signed(channel, transfer));
  if (space === "srgb") return linearToOklab(each(gamma) as RGB);
  if (space === "srgb-linear") return linearToOklab(v as RGB);
  if (space === "display-p3") return xyzToOklab(multiply(P3_TO_XYZ, each(gamma)));
  if (space === "a98-rgb") return xyzToOklab(multiply(A98_TO_XYZ, each(a98)));
  if (space === "rec2020") return xyzToOklab(multiply(REC2020_TO_XYZ, each(rec2020)));
  if (space === "prophoto-rgb") return d50ToOklab(multiply(PROPHOTO_TO_XYZ_D50, each(prophoto)));
  if (space === "xyz" || space === "xyz-d65") return xyzToOklab(v);
  if (space === "xyz-d50") return d50ToOklab(v);
  return null;
}

function channel(token: string): number | null {
  const value = component(token, 255);
  return value === null ? null : clamp(value, 0, 255);
}

function rgbToOklab(channels: number[]): RGB {
  const [r, g, b] = channels.map((value) => srgbToLinear(value / 255)) as RGB;
  return linearToOklab([r, g, b]);
}

function legacyRgbOf(inner: string): RGB | null {
  const parts = inner.split(",").map((part) => part.trim());
  if (parts.length !== 3 && parts.length !== 4) return null;
  if (parts.some((part) => part === "" || SPACE.test(part) || NONE.test(part))) return null;
  const colours = parts.slice(0, 3);
  const percent = colours.filter((part) => part.endsWith("%")).length;
  if (percent !== 0 && percent !== 3) return null;
  if (parts.length === 4 && component(parts[3] as string, 1) === null) return null;
  const values = colours.map(channel);
  return values.some((value) => value === null) ? null : rgbToOklab(values as number[]);
}

function rgbOf(inner: string): RGB | null {
  if (inner.includes(",")) return legacyRgbOf(inner);
  const parts = split(inner);
  if (!parts || parts.length !== 3) return null;
  const values = parts.map(channel);
  return values.some((value) => value === null) ? null : rgbToOklab(values as number[]);
}

function hexOf(text: string): RGB | null {
  if (HEX_ALPHA.test(text)) return hexToOklab(text.slice(0, text.length === 5 ? 4 : 7));
  return isHex(text) ? hexToOklab(text) : null;
}

export function parseCssColor(text: string): RGB | null {
  if (text.startsWith("#")) return hexOf(text);
  const parsed = call(text);
  if (!parsed) return null;
  const { name, inner } = parsed;
  if (name === "rgb" || name === "rgba") return rgbOf(inner);
  if (name === "oklch") return oklchOf(inner);
  if (name === "oklab") return oklabOf(inner);
  if (name === "lab") return labOf(inner);
  if (name === "lch") return lchOf(inner);
  if (name === "color") return colorOf(inner);
  return null;
}

function trimmed(value: number, places: number): string {
  return String(Number(value.toFixed(places)));
}

export function formatOklch(lab: RGB): string {
  const [l, a, b] = lab;
  const chroma = Number(Math.hypot(a, b).toFixed(4));
  let degrees = (Math.atan2(b, a) * 180) / Math.PI;
  if (degrees < 0) degrees += 360;
  const rounded = Number(degrees.toFixed(2));
  const angle = chroma === 0 || rounded >= 360 ? 0 : rounded;
  return `oklch(${trimmed(l, 4)} ${trimmed(chroma, 4)} ${trimmed(angle, 2)})`;
}
