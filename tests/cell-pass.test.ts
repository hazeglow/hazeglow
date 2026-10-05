import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, type GradientConfig } from "../src/config";
import { presets } from "../src/presets";
import { randomConfig } from "../src/random";
import { createRenderer } from "../src/renderer";
import { compositeShader } from "../src/shader";
import { fakeGl, type FakeGlOptions, type Upload } from "./support/gl";

const TIME = 1.25;
const POINTER = { x: 0.3, y: 0.6, force: 0.8 };

type Row = [string, string, ...number[]];

function rows(uploads: Upload[]): Row[] {
  return uploads.map((upload) => [upload.method, upload.name, ...upload.values]);
}

function frame(config: GradientConfig, options: FakeGlOptions) {
  const gl = fakeGl({}, options);
  const renderer = createRenderer(gl.canvas);
  if (!renderer) throw new Error("renderer was not created");
  renderer.render(config, TIME, POINTER);
  return gl;
}

const bases: Record<string, GradientConfig> = { default: DEFAULT_CONFIG };
for (const name of Object.keys(presets)) bases[`preset:${name}`] = presets[name as keyof typeof presets] as GradientConfig;
for (const seed of [0, 1, 2, 4, 30, 36]) bases[`random:${seed}`] = randomConfig(seed);

describe("cell pass", () => {
  it("sends every pass exactly the uniforms the single pass sends", () => {
    for (const [name, base] of Object.entries(bases)) {
      for (const effect of ["dither", "ascii", "pixelate"] as const) {
        for (const effectSize of [5, 16, 64]) {
          const config = { ...base, effect, effectSize };
          const single = frame(config, { cells: false });
          const split = frame(config, {});
          expect(single.drawLog.map((draw) => draw.program)).toEqual([1]);
          expect(split.drawLog).toEqual([
            { program: 2, framebuffer: true, viewport: expect.any(Array) },
            { program: 3, framebuffer: false, viewport: [0, 0, 640, 480] },
          ]);
          const expected = rows(single.uploads);
          for (const program of [2, 3]) {
            expect({ name, effect, effectSize, program, rows: rows(split.uploads.filter((u) => u.program === program)) }).toEqual({
              name,
              effect,
              effectSize,
              program,
              rows: expected,
            });
          }
          expect(split.uploads.filter((u) => u.program === 1)).toEqual([]);
        }
      }
    }
  });

  it("draws the cell grid at the size cellGrid gives", () => {
    const gl = frame({ ...DEFAULT_CONFIG, effect: "dither", effectSize: 16 }, {});
    expect(gl.drawLog[0]?.viewport).toEqual([0, 0, 93, 70]);
  });

  it("keeps none, glass, halftone and one-pixel cells on the single pass", () => {
    for (const config of [
      { ...DEFAULT_CONFIG, effect: "none" as const },
      { ...DEFAULT_CONFIG, effect: "glass" as const },
      { ...DEFAULT_CONFIG, effect: "halftone" as const },
      { ...DEFAULT_CONFIG, effect: "dither" as const, effectSize: 2 },
    ]) {
      const gl = frame(config, {});
      expect(gl.drawLog).toEqual([{ program: 1, framebuffer: false, viewport: [0, 0, 640, 480] }]);
      expect(gl.calls.filter((call) => call.method === "createProgram")).toHaveLength(1);
    }
  });

  it("builds the cell pass once, on the first frame that needs it", () => {
    const gl = fakeGl();
    const renderer = createRenderer(gl.canvas)!;
    const programs = () => gl.calls.filter((call) => call.method === "createProgram").length;
    renderer.render(DEFAULT_CONFIG, 0);
    expect(programs()).toBe(1);
    renderer.render({ ...DEFAULT_CONFIG, effect: "dither" }, 0);
    renderer.render({ ...DEFAULT_CONFIG, effect: "ascii" }, 0);
    expect(programs()).toBe(3);
  });

  it("falls back to the single pass for good when the framebuffer is incomplete", () => {
    const gl = fakeGl({}, { cells: false });
    const renderer = createRenderer(gl.canvas)!;
    const config = { ...DEFAULT_CONFIG, effect: "dither" as const };
    renderer.render(config, 0);
    renderer.render(config, 0);
    expect(gl.drawLog.map((draw) => draw.program)).toEqual([1, 1]);
    expect(gl.calls.filter((call) => call.method === "createProgram")).toHaveLength(3);
    expect(gl.calls.filter((call) => call.method === "deleteProgram")).toHaveLength(2);
    expect(gl.calls.filter((call) => call.method === "deleteTexture")).toHaveLength(1);
    expect(gl.calls.filter((call) => call.method === "deleteFramebuffer")).toHaveLength(1);
  });

  it("falls back to the single pass when a cell shader does not compile", () => {
    const gl = fakeGl({}, { failSource: "outCell" });
    const renderer = createRenderer(gl.canvas)!;
    renderer.render({ ...DEFAULT_CONFIG, effect: "pixelate" }, 0);
    expect(gl.drawLog.map((draw) => draw.program)).toEqual([1]);
  });

  it("grows the cell texture and never shrinks it", () => {
    const gl = fakeGl();
    const renderer = createRenderer(gl.canvas)!;
    const sizes = () => gl.calls.filter((call) => call.method === "texImage2D").map((call) => [call.args[3], call.args[4]]);
    renderer.render({ ...DEFAULT_CONFIG, effect: "dither", effectSize: 32 }, 0);
    renderer.render({ ...DEFAULT_CONFIG, effect: "dither", effectSize: 64 }, 0);
    renderer.render({ ...DEFAULT_CONFIG, effect: "dither", effectSize: 8 }, 0);
    renderer.render({ ...DEFAULT_CONFIG, effect: "dither", effectSize: 16 }, 0);
    expect(sizes()).toEqual([[1, 1], [47, 36], [162, 122]]);
  });

  it("rebuilds the cell pass after the context comes back", () => {
    const gl = fakeGl();
    const renderer = createRenderer(gl.canvas)!;
    renderer.render({ ...DEFAULT_CONFIG, effect: "ascii" }, 2);
    gl.fire("webglcontextlost");
    gl.drawLog.length = 0;
    gl.fire("webglcontextrestored");
    expect(gl.calls.filter((call) => call.method === "createProgram")).toHaveLength(6);
    expect(gl.drawLog.map((draw) => draw.program)).toEqual([5, 6]);
  });

  it("frees the cell pass on dispose", () => {
    const gl = fakeGl();
    const renderer = createRenderer(gl.canvas)!;
    renderer.render({ ...DEFAULT_CONFIG, effect: "dither" }, 0);
    renderer.dispose();
    expect(gl.calls.filter((call) => call.method === "deleteProgram")).toHaveLength(3);
    expect(gl.calls.filter((call) => call.method === "deleteTexture")).toHaveLength(1);
    expect(gl.calls.filter((call) => call.method === "deleteFramebuffer")).toHaveLength(1);
  });
  it("stays on the single pass when the grid is larger than MAX_TEXTURE_SIZE", () => {
    const gl = frame({ ...DEFAULT_CONFIG, effect: "dither", effectSize: 5 }, { maxTextureSize: 64 });
    expect(gl.drawLog).toEqual([{ program: 1, framebuffer: false, viewport: [0, 0, 640, 480] }]);
  });

  it("goes cell, single, cell on one renderer without building anything new", () => {
    const gl = fakeGl();
    const renderer = createRenderer(gl.canvas)!;
    const programs = () => gl.calls.filter((call) => call.method === "createProgram").length;
    renderer.render({ ...DEFAULT_CONFIG, effect: "dither" }, 0);
    expect(gl.drawLog.map((draw) => draw.program)).toEqual([2, 3]);
    gl.drawLog.length = 0;
    renderer.render({ ...DEFAULT_CONFIG, effect: "none" }, 0);
    expect(gl.drawLog).toEqual([{ program: 1, framebuffer: false, viewport: [0, 0, 640, 480] }]);
    gl.drawLog.length = 0;
    renderer.render({ ...DEFAULT_CONFIG, effect: "dither" }, 0);
    expect(gl.drawLog.map((draw) => draw.program)).toEqual([2, 3]);
    expect(programs()).toBe(3);
  });

  it("deletes what it created and skips the composite when the cell shader fails", () => {
    const gl = fakeGl({}, { failSource: "outCell" });
    const renderer = createRenderer(gl.canvas)!;
    const count = (method: string) => gl.calls.filter((call) => call.method === method).length;
    renderer.render({ ...DEFAULT_CONFIG, effect: "dither" }, 0);
    renderer.render({ ...DEFAULT_CONFIG, effect: "dither" }, 1);
    expect(gl.calls.some((call) => call.method === "shaderSource" && call.args[1] === compositeShader())).toBe(false);
    expect(count("createShader")).toBe(4);
    expect(count("deleteShader")).toBe(4);
    expect(count("createProgram")).toBe(1);
    expect(count("createTexture")).toBe(0);
    expect(count("createFramebuffer")).toBe(0);
    expect(gl.drawLog.map((draw) => draw.program)).toEqual([1, 1]);
  });

  describe("when growing the cell texture fails", () => {
    const small = { ...DEFAULT_CONFIG, effect: "dither" as const, effectSize: 16 };
    const large = { ...DEFAULT_CONFIG, effect: "dither" as const, effectSize: 8 };
    const count = (gl: ReturnType<typeof fakeGl>, method: string) => gl.calls.filter((call) => call.method === method).length;

    it("draws that frame and the later ones on the single pass and frees the cell pass", () => {
      const gl = fakeGl({}, { growErrorAbove: 100 });
      const renderer = createRenderer(gl.canvas)!;
      renderer.render(small, 0);
      renderer.render(small, 1);
      expect(count(gl, "getError")).toBe(1);
      renderer.render(large, 2);
      expect(count(gl, "getError")).toBe(2);
      renderer.render(large, 3);
      renderer.render(small, 4);
      expect(count(gl, "getError")).toBe(2);
      expect(gl.drawLog.map((draw) => draw.program)).toEqual([2, 3, 2, 3, 1, 1, 1]);
      expect(gl.drawLog.slice(4).every((draw) => !draw.framebuffer && draw.viewport.join() === "0,0,640,480")).toBe(true);
      expect(count(gl, "deleteProgram")).toBe(2);
      expect(count(gl, "deleteTexture")).toBe(1);
      expect(count(gl, "deleteFramebuffer")).toBe(1);
      expect(count(gl, "createProgram")).toBe(3);
    });

    it("tries the cell pass again after the context is restored", () => {
      const gl = fakeGl({}, { growErrorAbove: 100 });
      const renderer = createRenderer(gl.canvas)!;
      renderer.render(small, 0);
      renderer.render(large, 1);
      renderer.render(small, 2);
      gl.fire("webglcontextlost");
      gl.drawLog.length = 0;
      gl.fire("webglcontextrestored");
      expect(count(gl, "createProgram")).toBe(6);
      expect(gl.drawLog.map((draw) => draw.program)).toEqual([5, 6]);
    });
  });
});
