import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, type GradientConfig } from "../src/config";
import { presets } from "../src/presets";
import { randomConfig } from "../src/random";
import { createRenderer } from "../src/renderer";
import { fakeGl } from "./support/gl";

type Row = [string, string, ...number[]];

const FIXTURE = new URL("./fixtures/uniforms.json", import.meta.url);
const TIME = 1.25;
const POINTER = { x: 0.3, y: 0.6, force: 0.8 };
const PINNED_SHA256 = "44b668e2bcf64a501bfdcb2df92f696b5b90529b6a38922559088fc4d14f815c";

const HEX_CYCLE = ["#abc", "#ABCDEF", "#f80", "#00FF88", "#123456", "#FfF", "#0a0b0c", "#C0FFEE"];

function hex(i: number): string {
  return `#${((i * 2654435 + 1193046) & 0xffffff).toString(16).padStart(6, "0")}`;
}

const twoStops: GradientConfig = { ...DEFAULT_CONFIG, palette: ["#000", "#FFFFFF"], background: "#123456" };

const configs: Record<string, GradientConfig> = {
  default: DEFAULT_CONFIG,
};

for (const name of Object.keys(presets)) {
  configs[`preset:${name}`] = presets[name as keyof typeof presets] as GradientConfig;
}

for (const seed of [0, 1, 2, 4, 30, 36]) {
  configs[`random:${seed}`] = randomConfig(seed);
}

configs["hex-edge"] = {
  ...DEFAULT_CONFIG,
  palette: ["#abc", "#ABCDEF", "#AbC", "#000", "#FFF", "#ffffff", "#0a0B0c", "#123", "#fEdCbA", "#999999"],
  background: "#F0F",
};

configs["hex-mesh"] = {
  ...DEFAULT_CONFIG,
  shape: "mesh",
  background: "#ABC",
  mesh: Array.from({ length: 16 }, (_, i) => [(i % 4) / 3, Math.floor(i / 4) / 3, HEX_CYCLE[i % HEX_CYCLE.length]]),
} as GradientConfig;

configs["two-stops"] = twoStops;

configs["unparsed"] = {
  ...DEFAULT_CONFIG,
  shape: "mesh",
  palette: ["nope", "red", "#abcd", "#aabbccdd", " #abc", "rgb(1, 2, 3)", "oklch(0.5 0.1)", "var(--missing)"],
  background: "blue",
  mesh: [
    [0.2, 0.2, "red"],
    [0.8, 0.8, "var(--missing)"],
  ],
} as GradientConfig;

configs["too-many"] = {
  ...DEFAULT_CONFIG,
  shape: "mesh",
  palette: Array.from({ length: 12 }, (_, i) => hex(i)),
  background: hex(99),
  mesh: Array.from({ length: 20 }, (_, i) => [(i % 5) / 4, Math.floor(i / 5) / 3, hex(i + 40)]),
} as GradientConfig;

function frames(...list: GradientConfig[]): Row[] {
  const { canvas, uploads } = fakeGl();
  const renderer = createRenderer(canvas);
  if (!renderer) throw new Error("renderer was not created");
  let start = 0;
  for (const config of list) {
    start = uploads.length;
    renderer.render(config, TIME, POINTER);
  }
  return uploads.slice(start).map((upload) => [upload.method, upload.name, ...upload.values]);
}

function compute(): Record<string, Row[]> {
  const out: Record<string, Row[]> = {};
  for (const [name, config] of Object.entries(configs)) out[name] = frames(config);
  out["sequence"] = frames(presets.dusk as GradientConfig, twoStops);
  return out;
}

function serialize(data: Record<string, Row[]>): string {
  const lines = ["{"];
  const names = Object.keys(data);
  names.forEach((name, n) => {
    const rows = data[name] ?? [];
    lines.push(`${JSON.stringify(name)}: [`);
    rows.forEach((row, r) => {
      lines.push(`${JSON.stringify(row)}${r < rows.length - 1 ? "," : ""}`);
    });
    lines.push(`]${n < names.length - 1 ? "," : ""}`);
  });
  lines.push("}");
  return lines.join("\n") + "\n";
}

describe("uniforms", () => {
  it.runIf(process.env.CAPTURE_UNIFORMS === "1")("captures the fixture", () => {
    const data = compute();
    for (const rows of Object.values(data)) {
      for (const row of rows) {
        for (const value of row.slice(2) as number[]) {
          expect(Number.isFinite(value)).toBe(true);
          expect(Object.is(value, -0)).toBe(false);
        }
      }
    }
    writeFileSync(FIXTURE, serialize(data));
  });

  it("sends exactly the uniforms 0.2.0 sent", () => {
    const expected = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, Row[]>;
    const actual = compute();
    expect(Object.keys(actual)).toEqual(Object.keys(expected));
    for (const name of Object.keys(expected)) expect({ name, rows: actual[name] }).toEqual({ name, rows: expected[name] });
  });

  it("sends the same uniforms on a cached second frame", () => {
    for (const [name, config] of Object.entries(configs)) {
      const { canvas, uploads } = fakeGl();
      const renderer = createRenderer(canvas);
      if (!renderer) throw new Error("renderer was not created");
      renderer.render(config, TIME, POINTER);
      const first = uploads.splice(0);
      renderer.render(config, TIME, POINTER);
      expect({ name, rows: uploads }).toEqual({ name, rows: first });
    }
  });

  it("is the fixture captured from 0.2.0", () => {
    const digest = createHash("sha256").update(readFileSync(FIXTURE)).digest("hex");
    expect(digest).toBe(PINNED_SHA256);
  });

  it("covers mesh configs", () => {
    expect(randomConfig(4).shape).toBe("mesh");
    expect(randomConfig(30).shape).toBe("mesh");
    expect(randomConfig(36).shape).toBe("mesh");
  });
});
