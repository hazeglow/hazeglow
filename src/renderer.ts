import { cellGrid } from "./cells";
import { EFFECTS, MAX_MESH_POINTS, MAX_STOPS, MOTIONS, SHAPES, type GradientConfig } from "./config";
import { IDLE_POINTER, type PointerState } from "./pointer";
import { mulberry32 } from "./random";
import { VERTEX_SHADER, cellShader, compositeShader, fragmentShader } from "./shader";
import { createColors } from "./tokens";

export interface Renderer {
  readonly maxSize: number;
  readonly ready: Promise<boolean>;
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

export const MAX_RESTORES = 1;
const MAIN_POLL_MS = 16;
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|lavapipe|basic render|software/i;
const GENERIC_RENDERER = "WebKit WebGL";

type UniformName = (typeof UNIFORMS)[number];
type Uniforms = Record<UniformName, WebGLUniformLocation | null>;

interface Pass {
  program: WebGLProgram;
  uniforms: Uniforms;
}

interface PendingCells {
  pending: true;
  cell: WebGLProgram;
  composite: WebGLProgram;
}

interface Parallel {
  COMPLETION_STATUS_KHR: number;
}

interface Cells {
  cell: Pass;
  composite: Pass;
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  limit: number;
  width: number;
  height: number;
}

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

function uniformsOf(gl: WebGL2RenderingContext, program: WebGLProgram): Uniforms {
  const uniforms = {} as Uniforms;
  for (const name of UNIFORMS) uniforms[name] = gl.getUniformLocation(program, name);
  return uniforms;
}

function startLink(gl: WebGL2RenderingContext, source: string): WebGLProgram | null {
  const vertex = gl.createShader(gl.VERTEX_SHADER);
  const fragment = gl.createShader(gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    if (program) gl.deleteProgram(program);
    return null;
  }
  gl.shaderSource(vertex, VERTEX_SHADER);
  gl.compileShader(vertex);
  gl.shaderSource(fragment, source);
  gl.compileShader(fragment);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return program;
}

function finishLink(gl: WebGL2RenderingContext, program: WebGLProgram): Pass | null {
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    console.error("[hazeglow] program link failed:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return { program, uniforms: uniformsOf(gl, program) };
}

function link(gl: WebGL2RenderingContext, source: string): Pass | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, source);
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    return null;
  }
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
  return { program, uniforms: uniformsOf(gl, program) };
}

function createCells(gl: WebGL2RenderingContext): Cells | null {
  const cell = link(gl, cellShader());
  if (!cell) return null;
  const composite = link(gl, compositeShader());
  if (!composite) {
    gl.deleteProgram(cell.program);
    return null;
  }
  return attachTargets(gl, cell, composite);
}

function startCells(gl: WebGL2RenderingContext, parallel: Parallel | null): Cells | PendingCells | null {
  if (!parallel) return createCells(gl);
  const cell = startLink(gl, cellShader());
  const composite = startLink(gl, compositeShader());
  if (cell && composite) return { pending: true, cell, composite };
  if (cell) gl.deleteProgram(cell);
  if (composite) gl.deleteProgram(composite);
  return null;
}

function settleCells(gl: WebGL2RenderingContext, pending: PendingCells, parallel: Parallel): Cells | PendingCells | null {
  const done = (program: WebGLProgram) => gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR) !== false;
  if (!done(pending.cell) || !done(pending.composite)) return pending;
  const cell = finishLink(gl, pending.cell);
  const composite = finishLink(gl, pending.composite);
  if (cell && composite) return attachTargets(gl, cell, composite);
  if (cell) gl.deleteProgram(cell.program);
  if (composite) gl.deleteProgram(composite.program);
  return null;
}

function attachTargets(gl: WebGL2RenderingContext, cell: Pass, composite: Pass): Cells | null {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, 1, 1, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (complete) {
    return { cell, composite, texture, framebuffer, limit: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, width: 1, height: 1 };
  }
  gl.deleteProgram(cell.program);
  gl.deleteProgram(composite.program);
  gl.deleteTexture(texture);
  gl.deleteFramebuffer(framebuffer);
  return null;
}

function deleteCells(gl: WebGL2RenderingContext, cells: Cells): void {
  gl.deleteProgram(cells.cell.program);
  gl.deleteProgram(cells.composite.program);
  gl.deleteTexture(cells.texture);
  gl.deleteFramebuffer(cells.framebuffer);
}

function rendererName(gl: WebGL2RenderingContext): string {
  const reported: unknown = gl.getParameter(gl.RENDERER);
  if (typeof reported === "string" && reported !== GENERIC_RENDERER) return reported;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const unmasked: unknown = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
  return typeof unmasked === "string" ? unmasked : "";
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
  if (SOFTWARE_RENDERER.test(rendererName(gl))) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }

  const parallel = gl.getExtension("KHR_parallel_shader_compile") as Parallel | null;
  let main: Pass | null = null;
  let pendingMain: WebGLProgram | null = null;
  if (parallel) pendingMain = startLink(gl, fragmentShader());
  else main = link(gl, fragmentShader());
  if (!main && !pendingMain) return null;
  let settle: (ok: boolean) => void = () => {};
  const ready = new Promise<boolean>((resolve) => {
    settle = resolve;
  });
  if (main) settle(true);
  let poll: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let cells: Cells | PendingCells | null | undefined;
  let losses = 0;
  let last: { config: GradientConfig; time: number; pointer: PointerState } | null = null;
  const palette = new Float32Array(MAX_STOPS * 3);
  const meshPoints = new Float32Array(MAX_MESH_POINTS * 2);
  const meshColors = new Float32Array(MAX_MESH_POINTS * 3);
  const colors = createColors("ownerDocument" in canvas ? canvas : null, () => {
    if (last) render(last.config, last.time, last.pointer);
  });

  function mainReady(): boolean {
    if (main) return true;
    if (!pendingMain || !parallel || gl.isContextLost()) return false;
    if (gl.getProgramParameter(pendingMain, parallel.COMPLETION_STATUS_KHR) === false) return false;
    const program = pendingMain;
    pendingMain = null;
    main = finishLink(gl, program);
    settle(main !== null);
    return main !== null;
  }

  function watchMain(): void {
    poll = null;
    if (disposed) return;
    if (mainReady()) {
      if (last) render(last.config, last.time, last.pointer);
      return;
    }
    if (pendingMain) poll = setTimeout(watchMain, MAIN_POLL_MS);
  }

  function render(config: GradientConfig, time: number, pointer: PointerState = IDLE_POINTER): void {
    last = { config, time, pointer };
    if (gl.isContextLost() || !mainReady()) return;
    const single = main;
    if (!single) return;
    const stops = config.palette.slice(0, MAX_STOPS);
    stops.forEach((stop, index) => palette.set(colors.get(stop), index * 3));
    const mesh = config.mesh.slice(0, MAX_MESH_POINTS);
    mesh.forEach(([x, y, color], index) => {
      meshPoints[index * 2] = x;
      meshPoints[index * 2 + 1] = y;
      meshColors.set(colors.get(color), index * 3);
    });

    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const grid = cellGrid(config.effect, config.effectSize, width, height);
    if (grid && cells === undefined) cells = startCells(gl, parallel);
    if (grid && cells && "pending" in cells && parallel) cells = settleCells(gl, cells, parallel);
    const ready = cells && !("pending" in cells) ? cells : null;
    let active: Cells | null = grid && ready && grid.width <= ready.limit && grid.height <= ready.limit ? ready : null;
    if (grid && active) {
      gl.bindTexture(gl.TEXTURE_2D, active.texture);
      if (grid.width > active.width || grid.height > active.height) {
        const nextWidth = Math.max(grid.width, active.width);
        const nextHeight = Math.max(grid.height, active.height);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, nextWidth, nextHeight, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, null);
        if (gl.getError() === gl.NO_ERROR) {
          active.width = nextWidth;
          active.height = nextHeight;
        } else {
          deleteCells(gl, active);
          cells = null;
          active = null;
        }
      }
    }
    if (grid && active) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, active.framebuffer);
      draw(active.cell, grid.width, grid.height, config, time, pointer, stops.length, mesh.length);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      draw(active.composite, width, height, config, time, pointer, stops.length, mesh.length);
      return;
    }
    draw(single, width, height, config, time, pointer, stops.length, mesh.length);
  }

  function draw(
    pass: Pass,
    width: number,
    height: number,
    config: GradientConfig,
    time: number,
    pointer: PointerState,
    stopCount: number,
    meshCount: number,
  ): void {
    const uniforms = pass.uniforms;
    gl.viewport(0, 0, width, height);
    gl.useProgram(pass.program);
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
    gl.uniform1i(uniforms.u_paletteCount, Math.max(1, stopCount));
    gl.uniform3fv(uniforms.u_background, colors.get(config.background));
    gl.uniform2fv(uniforms.u_meshPoints, meshPoints);
    gl.uniform3fv(uniforms.u_meshColors, meshColors);
    gl.uniform1i(uniforms.u_meshCount, meshCount);
    gl.uniform1i(uniforms.u_effect, EFFECTS.indexOf(config.effect));
    gl.uniform1f(uniforms.u_effectSize, config.effectSize);
    gl.uniform1f(uniforms.u_effectAmount, config.effectAmount);
    gl.uniform2f(uniforms.u_pointer, pointer.x, pointer.y);
    const direction = config.hoverMode === "push" ? -1 : 1;
    gl.uniform1f(uniforms.u_pointerForce, pointer.force * config.hover * direction);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function onContextLost(event: Event): void {
    losses += 1;
    if (losses <= MAX_RESTORES) event.preventDefault();
    main = null;
    pendingMain = null;
    cells = undefined;
  }

  function onContextRestored(): void {
    if (parallel) {
      pendingMain = startLink(gl, fragmentShader());
      if (pendingMain && poll === null) poll = setTimeout(watchMain, MAIN_POLL_MS);
      return;
    }
    main = link(gl, fragmentShader());
    if (main && last) render(last.config, last.time, last.pointer);
  }

  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  if (pendingMain) poll = setTimeout(watchMain, MAIN_POLL_MS);

  return {
    maxSize: Math.min(
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
      ...(gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array),
    ),
    ready,
    render,
    resize(width, height) {
      const nextWidth = Math.max(1, Math.round(width));
      const nextHeight = Math.max(1, Math.round(height));
      if (canvas.width !== nextWidth) canvas.width = nextWidth;
      if (canvas.height !== nextHeight) canvas.height = nextHeight;
    },
    dispose() {
      disposed = true;
      if (poll !== null) clearTimeout(poll);
      poll = null;
      if (pendingMain) gl.deleteProgram(pendingMain);
      pendingMain = null;
      settle(false);
      colors.dispose();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      if (main) gl.deleteProgram(main.program);
      if (cells && "pending" in cells) {
        gl.deleteProgram(cells.cell);
        gl.deleteProgram(cells.composite);
      } else if (cells) {
        deleteCells(gl, cells);
      }
      main = null;
      cells = undefined;
    },
  };
}
