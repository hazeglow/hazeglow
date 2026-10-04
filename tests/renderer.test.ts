import { describe, expect, it, vi } from "vitest";
import { hexToOklab } from "../src/color";
import { DEFAULT_CONFIG, type GradientConfig } from "../src/config";
import { parseOklch } from "../src/css-color";
import { createRenderer, type Renderer } from "../src/renderer";
import { fakeDom } from "./support/dom";
import { fakeGl, type Upload } from "./support/gl";

interface Harness {
  renderer: Renderer;
  uploads: Upload[];
  draws(): number;
  names(): string[];
  fire(type: string): void;
}

const PER_FRAME = ["u_pointer", "u_pointerForce", "u_resolution", "u_time"];

function harness(): Harness {
  const gl = fakeGl();
  const renderer = createRenderer(gl.canvas);
  if (!renderer) throw new Error("renderer was not created");
  return {
    renderer,
    uploads: gl.uploads,
    draws: gl.draws,
    names: () => [...new Set(gl.uploads.map((upload) => upload.name))].sort(),
    fire: gl.fire,
  };
}

function withDom(options: Parameters<typeof fakeDom>[0] = {}) {
  const dom = fakeDom(options);
  const gl = fakeGl();
  Object.defineProperties(gl.canvas, {
    ownerDocument: { get: () => dom.element.ownerDocument },
    isConnected: { get: () => dom.element.isConnected },
  });
  const renderer = createRenderer(gl.canvas);
  if (!renderer) throw new Error("renderer was not created");
  return { dom, gl, renderer, uploads: gl.uploads };
}

function last(uploads: Upload[], name: string): number[] {
  return Array.from(Float32Array.from(uploads.findLast((upload) => upload.name === name)?.values ?? []));
}

function force(uploads: Upload[]): unknown {
  return uploads.findLast((upload) => upload.name === "u_pointerForce")?.values[0];
}

describe("createRenderer", () => {
  it("sends the whole config on the first frame", () => {
    const { renderer, names } = harness();
    renderer.render(DEFAULT_CONFIG, 0);
    expect(names()).toEqual(expect.arrayContaining(["u_palette", "u_shape", "u_background", "u_grain", ...PER_FRAME]));
  });

  it("picks up a config that was changed in place", () => {
    const { renderer, uploads } = harness();
    const config: GradientConfig = { ...DEFAULT_CONFIG };
    renderer.render(config, 0);
    config.grain = 0.9;
    uploads.length = 0;
    renderer.render(config, 0);
    expect(uploads.find((upload) => upload.name === "u_grain")?.values).toEqual([0.9]);
  });

  it("draws once per call", () => {
    const { renderer, draws } = harness();
    renderer.render(DEFAULT_CONFIG, 0);
    renderer.render(DEFAULT_CONFIG, 0.5, { x: 0.2, y: 0.7, force: 1 });
    expect(draws()).toBe(2);
  });

  it("sends the whole config again after the context comes back", () => {
    const { renderer, uploads, names, fire } = harness();
    renderer.render(DEFAULT_CONFIG, 2);
    fire("webglcontextlost");
    uploads.length = 0;
    fire("webglcontextrestored");
    expect(names()).toContain("u_palette");
    expect(uploads.find((upload) => upload.name === "u_time")?.values).toEqual([2]);
  });

  it("scales the pointer force by the hover strength, and flips it for push", () => {
    const { renderer, uploads } = harness();
    const pointer = { x: 0.5, y: 0.5, force: 1 };
    const pull: GradientConfig = { ...DEFAULT_CONFIG, hover: 0.5, hoverMode: "pull" };
    const push: GradientConfig = { ...DEFAULT_CONFIG, hover: 0.5, hoverMode: "push" };
    renderer.render(pull, 0, pointer);
    expect(force(uploads)).toBe(0.5);
    renderer.render(push, 0, pointer);
    expect(force(uploads)).toBe(-0.5);
    renderer.render(DEFAULT_CONFIG, 0, pointer);
    expect(force(uploads)).toBe(0);
  });

  it("uploads an oklch palette stop in its slot", () => {
    const { renderer, uploads } = harness();
    const config: GradientConfig = { ...DEFAULT_CONFIG, palette: ["#ff0000", "oklch(0.7 0.1 200)"] };
    renderer.render(config, 0);
    expect(last(uploads, "u_palette").slice(3, 6)).toEqual(Array.from(Float32Array.from(parseOklch("oklch(0.7 0.1 200)") ?? [])));
  });

  it("uploads an oklch background", () => {
    const { renderer, uploads } = harness();
    renderer.render({ ...DEFAULT_CONFIG, background: "oklch(0.3 0.05 120)" }, 0);
    expect(last(uploads, "u_background")).toEqual(Array.from(Float32Array.from(parseOklch("oklch(0.3 0.05 120)") ?? [])));
  });

  it("uploads an oklch mesh colour", () => {
    const { renderer, uploads } = harness();
    renderer.render({ ...DEFAULT_CONFIG, mesh: [[0.2, 0.4, "oklch(0.6 0.2 30)"]] }, 0);
    expect(last(uploads, "u_meshColors").slice(0, 3)).toEqual(Array.from(Float32Array.from(parseOklch("oklch(0.6 0.2 30)") ?? [])));
  });

  it("picks up a colour changed in place", () => {
    const { renderer, uploads } = harness();
    const config: GradientConfig = { ...DEFAULT_CONFIG, palette: [...DEFAULT_CONFIG.palette] };
    renderer.render(config, 0);
    const before = last(uploads, "u_palette").slice(0, 3);
    config.palette[0] = "oklch(0.5 0.1 90)";
    renderer.render(config, 0);
    const after = last(uploads, "u_palette").slice(0, 3);
    expect(after).not.toEqual(before);
    expect(after).toEqual(Array.from(Float32Array.from(parseOklch("oklch(0.5 0.1 90)") ?? [])));
  });
});

const TOKEN = "var(--c, #123456)";

function tokenConfig(): GradientConfig {
  return { ...DEFAULT_CONFIG, palette: [TOKEN, "#ffffff"], background: TOKEN, mesh: [[0.5, 0.5, TOKEN]] };
}

function expectColour(uploads: Upload[], hex: string): void {
  const expected = Array.from(Float32Array.from(hexToOklab(hex)));
  expect(last(uploads, "u_palette").slice(0, 3)).toEqual(expected);
  expect(last(uploads, "u_meshColors").slice(0, 3)).toEqual(expected);
  expect(last(uploads, "u_background")).toEqual(expected);
}

describe("createRenderer colour tokens", () => {
  it("uploads the token's Oklab", () => {
    const { dom, renderer, uploads } = withDom({ properties: { "--c": "#ff0000" } });
    renderer.render(tokenConfig(), 0);
    expectColour(uploads, "#ff0000");
    expect(dom.observers).toHaveLength(1);
  });

  it("redraws once when the theme changes, with the last frame's time and pointer", () => {
    const { dom, gl, renderer, uploads } = withDom({ properties: { "--c": "#ff0000" } });
    renderer.render(tokenConfig(), 3, { x: 0.2, y: 0.7, force: 1 });
    const draws = gl.draws();
    dom.setProperty("--c", "#00ff00");
    dom.observers[0]?.trigger();
    expect(gl.draws()).toBe(draws + 1);
    expectColour(uploads, "#00ff00");
    expect(last(uploads, "u_time")).toEqual([3]);
    expect(last(uploads, "u_pointer")).toEqual(Array.from(Float32Array.from([0.2, 0.7])));
  });

  it("does not redraw when the token is unchanged", () => {
    const { dom, gl, renderer } = withDom({ properties: { "--c": "#ff0000" } });
    renderer.render(tokenConfig(), 0);
    const draws = gl.draws();
    dom.observers[0]?.trigger();
    dom.media.fire();
    expect(gl.draws()).toBe(draws);
  });

  it("redraws once when the colour scheme media query fires", () => {
    const { dom, gl, renderer, uploads } = withDom({ properties: { "--c": "#ff0000" } });
    renderer.render(tokenConfig(), 0);
    const draws = gl.draws();
    dom.setProperty("--c", "#0000ff");
    dom.media.fire();
    expect(gl.draws()).toBe(draws + 1);
    expectColour(uploads, "#0000ff");
  });

  it("does not draw on a theme change before any render", () => {
    const { dom, gl } = withDom({ properties: { "--c": "#ff0000" } });
    dom.setProperty("--c", "#00ff00");
    dom.observers[0]?.trigger();
    dom.media.fire();
    expect(gl.draws()).toBe(0);
  });

  it("lets go of the observer and the listener on dispose", () => {
    const { dom, gl, renderer } = withDom({ properties: { "--c": "#ff0000" } });
    renderer.render(tokenConfig(), 0);
    renderer.dispose();
    expect(dom.observers[0]?.disconnected).toBe(1);
    expect(dom.counts.removeListener).toBe(1);
    const draws = gl.draws();
    dom.setProperty("--c", "#00ff00");
    dom.observers[0]?.trigger();
    dom.media.fire();
    expect(gl.draws()).toBe(draws);
  });

  it("reads no styles after the first frame", () => {
    const { dom, renderer } = withDom({ properties: { "--c": "#ff0000" } });
    renderer.render(tokenConfig(), 0);
    const before = { ...dom.counts };
    for (let frame = 1; frame < 10; frame++) renderer.render(tokenConfig(), frame / 10);
    expect(dom.counts.getComputedStyle).toBe(before.getComputedStyle);
    expect(dom.counts.getPropertyValue).toBe(before.getPropertyValue);
    expect(dom.counts.fillStyle).toBe(before.fillStyle);
    expect(dom.counts.getComputedStyle).toBeGreaterThan(0);
  });

  it("uses the fallback on a canvas without a document, and watches nothing", () => {
    const counts = { observers: 0, matchMedia: 0, getComputedStyle: 0 };
    class CountingObserver {
      constructor() {
        counts.observers++;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("MutationObserver", CountingObserver);
    vi.stubGlobal("matchMedia", () => {
      counts.matchMedia++;
      return { matches: false, addEventListener() {}, removeEventListener() {} };
    });
    vi.stubGlobal("getComputedStyle", () => {
      counts.getComputedStyle++;
      return { getPropertyValue: () => "" };
    });
    try {
      const { renderer, uploads } = harness();
      renderer.render(tokenConfig(), 0);
      renderer.dispose();
      expectColour(uploads, "#123456");
      expect(counts).toEqual({ observers: 0, matchMedia: 0, getComputedStyle: 0 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
