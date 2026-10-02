import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, type GradientConfig } from "../src/config";
import { createRenderer, type Renderer } from "../src/renderer";

interface Upload {
  name: string;
  values: unknown[];
}

interface Harness {
  renderer: Renderer;
  uploads: Upload[];
  draws(): number;
  names(): string[];
  fire(type: string): void;
}

const PER_FRAME = ["u_pointer", "u_pointerForce", "u_resolution", "u_time"];

function harness(): Harness {
  const uploads: Upload[] = [];
  const listeners = new Map<string, (event: Event) => void>();
  let draws = 0;

  const gl = new Proxy<Record<string, unknown>>(
    { drawingBufferWidth: 640, drawingBufferHeight: 480 },
    {
      get(target, key) {
        if (typeof key !== "string") return undefined;
        if (key in target) return target[key];
        if (key === key.toUpperCase()) return undefined;
        if (key === "getUniformLocation") return (_program: unknown, name: string) => name;
        if (key === "getParameter") return () => [4096, 4096];
        if (key === "createShader" || key === "createProgram") return () => ({});
        if (key === "getShaderParameter" || key === "getProgramParameter") return () => true;
        if (key === "isContextLost") return () => false;
        if (key === "drawArrays") return () => void draws++;
        if (key.startsWith("uniform")) return (name: string, ...values: unknown[]) => void uploads.push({ name, values });
        return () => undefined;
      },
    },
  );

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => gl,
    addEventListener: (type: string, listener: (event: Event) => void) => void listeners.set(type, listener),
    removeEventListener: (type: string) => void listeners.delete(type),
  } as unknown as HTMLCanvasElement;

  const renderer = createRenderer(canvas);
  if (!renderer) throw new Error("renderer was not created");
  return {
    renderer,
    uploads,
    draws: () => draws,
    names: () => [...new Set(uploads.map((upload) => upload.name))].sort(),
    fire: (type) => listeners.get(type)?.({ preventDefault() {} } as Event),
  };
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
});
