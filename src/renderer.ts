import { hexToOklab } from "./color";
import { EFFECTS, MAX_MESH_POINTS, MAX_STOPS, MOTIONS, SHAPES, type GradientConfig } from "./config";
import { IDLE_POINTER, type PointerState } from "./pointer";
import { mulberry32 } from "./random";
import { VERTEX_SHADER, fragmentShader } from "./shader";

export interface Renderer {
  readonly maxSize: number;
  render(config: GradientConfig, time: number, pointer?: PointerState): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

const UNIFORMS = [
  "u_resolution",
  "u_time",
  "u_loop",
  "u_seed",
  "u_grainSeed",
  "u_shape",
  "u_motion",
  "u_center",
  "u_size",
  "u_roundness",
  "u_softness",
  "u_rotation",
  "u_rampDirection",
  "u_angle",
  "u_warp",
  "u_warpScale",
  "u_grain",
  "u_palette",
  "u_paletteCount",
  "u_background",
  "u_meshPoints",
  "u_meshColors",
  "u_meshCount",
  "u_effect",
  "u_effectSize",
  "u_effectAmount",
  "u_pointer",
  "u_pointerForce",
] as const;

type UniformName = (typeof UNIFORMS)[number];
type Uniforms = Record<UniformName, WebGLUniformLocation | null>;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    console.error("[hazeglow] shader compile failed:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function link(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentShader());
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    console.error("[hazeglow] program link failed:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function locate(gl: WebGL2RenderingContext, program: WebGLProgram): Uniforms {
  const uniforms = {} as Uniforms;
  for (const name of UNIFORMS) uniforms[name] = gl.getUniformLocation(program, name);
  return uniforms;
}

export function createRenderer(canvas: HTMLCanvasElement | OffscreenCanvas): Renderer | null {
  const acquired = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
    failIfMajorPerformanceCaveat: true,
  }) as WebGL2RenderingContext | null;
  if (!acquired) return null;
  const gl: WebGL2RenderingContext = acquired;

  let program = link(gl);
  if (!program) return null;
  let uniforms = locate(gl, program);
  let last: { config: GradientConfig; time: number; pointer: PointerState } | null = null;
  const palette = new Float32Array(MAX_STOPS * 3);
  const meshPoints = new Float32Array(MAX_MESH_POINTS * 2);
  const meshColors = new Float32Array(MAX_MESH_POINTS * 3);

  function render(config: GradientConfig, time: number, pointer: PointerState = IDLE_POINTER): void {
    last = { config, time, pointer };
    if (!program || gl.isContextLost()) return;
    const stops = config.palette.slice(0, MAX_STOPS);
    stops.forEach((stop, index) => palette.set(hexToOklab(stop), index * 3));
    const mesh = config.mesh.slice(0, MAX_MESH_POINTS);
    mesh.forEach(([x, y, color], index) => {
      meshPoints[index * 2] = x;
      meshPoints[index * 2 + 1] = y;
      meshColors.set(hexToOklab(color), index * 3);
    });

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(program);
    gl.uniform2f(uniforms.u_resolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(uniforms.u_time, time);
    gl.uniform1f(uniforms.u_loop, config.loop * config.speed);
    const offset = mulberry32(config.seed);
    gl.uniform2f(uniforms.u_seed, offset() * 100, offset() * 100);
    gl.uniform1ui(uniforms.u_grainSeed, config.seed >>> 0);
    gl.uniform1i(uniforms.u_shape, SHAPES.indexOf(config.shape));
    gl.uniform1i(uniforms.u_motion, MOTIONS.indexOf(config.motion));
    gl.uniform2f(uniforms.u_center, config.center[0], config.center[1]);
    gl.uniform2f(uniforms.u_size, config.size[0], config.size[1]);
    gl.uniform1f(uniforms.u_roundness, config.roundness);
    gl.uniform1f(uniforms.u_softness, config.softness);
    gl.uniform1f(uniforms.u_rotation, (config.rotation * Math.PI) / 180);
    gl.uniform1f(uniforms.u_rampDirection, config.rampDirection);
    gl.uniform1f(uniforms.u_angle, (config.angle * Math.PI) / 180);
    gl.uniform1f(uniforms.u_warp, config.warp);
    gl.uniform1f(uniforms.u_warpScale, config.warpScale);
    gl.uniform1f(uniforms.u_grain, config.grain);
    gl.uniform3fv(uniforms.u_palette, palette);
    gl.uniform1i(uniforms.u_paletteCount, Math.max(1, stops.length));
    gl.uniform3fv(uniforms.u_background, hexToOklab(config.background));
    gl.uniform2fv(uniforms.u_meshPoints, meshPoints);
    gl.uniform3fv(uniforms.u_meshColors, meshColors);
    gl.uniform1i(uniforms.u_meshCount, mesh.length);
    gl.uniform1i(uniforms.u_effect, EFFECTS.indexOf(config.effect));
    gl.uniform1f(uniforms.u_effectSize, config.effectSize);
    gl.uniform1f(uniforms.u_effectAmount, config.effectAmount);
    gl.uniform2f(uniforms.u_pointer, pointer.x, pointer.y);
    const direction = config.hoverMode === "push" ? -1 : 1;
    gl.uniform1f(uniforms.u_pointerForce, pointer.force * config.hover * direction);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function onContextLost(event: Event): void {
    event.preventDefault();
    program = null;
  }

  function onContextRestored(): void {
    program = link(gl);
    if (!program) return;
    uniforms = locate(gl, program);
    if (last) render(last.config, last.time, last.pointer);
  }

  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  return {
    maxSize: Math.min(
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
      ...(gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array),
    ),
    render,
    resize(width, height) {
      const nextWidth = Math.max(1, Math.round(width));
      const nextHeight = Math.max(1, Math.round(height));
      if (canvas.width !== nextWidth) canvas.width = nextWidth;
      if (canvas.height !== nextHeight) canvas.height = nextHeight;
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      if (program) gl.deleteProgram(program);
      program = null;
    },
  };
}
