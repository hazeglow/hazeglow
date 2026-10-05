export interface Upload {
  method: string;
  name: string;
  values: number[];
  program: number;
}

export interface Draw {
  program: number;
  framebuffer: boolean;
  viewport: number[];
}

export interface Call {
  method: string;
  args: unknown[];
}

export interface FakeGlOptions {
  cells?: boolean;
  failSource?: string;
  maxTextureSize?: number;
  growErrorAbove?: number;
}

export interface FakeGl {
  canvas: HTMLCanvasElement;
  uploads: Upload[];
  drawLog: Draw[];
  calls: Call[];
  draws(): number;
  fire(type: string): void;
}

const GL = {
  FRAMEBUFFER: 0x8d40,
  FRAMEBUFFER_COMPLETE: 0x8cd5,
  MAX_TEXTURE_SIZE: 0x0d33,
  MAX_RENDERBUFFER_SIZE: 0x84e8,
  MAX_VIEWPORT_DIMS: 0x0d3a,
  NO_ERROR: 0,
  OUT_OF_MEMORY: 0x0505,
};

const RECORDED = new Set([
  "createShader",
  "deleteShader",
  "shaderSource",
  "getError",
  "createProgram",
  "deleteProgram",
  "createTexture",
  "deleteTexture",
  "createFramebuffer",
  "deleteFramebuffer",
  "texImage2D",
  "bindFramebuffer",
  "bindTexture",
]);

function snapshot(values: unknown[]): number[] {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === "number") out.push(value);
    else if (value && typeof value === "object") out.push(...Array.from(value as ArrayLike<number>));
    else if (typeof value === "boolean") out.push(Number(value));
  }
  return out;
}

export function fakeGl(canvasExtras: Record<string, unknown> = {}, options: FakeGlOptions = {}): FakeGl {
  const uploads: Upload[] = [];
  const drawLog: Draw[] = [];
  const calls: Call[] = [];
  const listeners = new Map<string, (event: Event) => void>();
  let programs = 0;
  let current = 0;
  let framebuffer = false;
  let viewport: number[] = [];
  let pendingError = 0;

  const methods: Record<string, (...args: never[]) => unknown> = {
    getUniformLocation: (_program: unknown, name: string) => name,
    getParameter: (name: number) =>
      name === GL.MAX_VIEWPORT_DIMS ? Int32Array.of(4096, 4096) : name === GL.MAX_TEXTURE_SIZE ? (options.maxTextureSize ?? 4096) : name === GL.MAX_RENDERBUFFER_SIZE ? 4096 : undefined,
    texImage2D: (...args: unknown[]) => {
      if (options.growErrorAbove !== undefined && (args[3] as number) > options.growErrorAbove) pendingError = GL.OUT_OF_MEMORY;
    },
    getError: () => {
      const error = pendingError;
      pendingError = 0;
      return error;
    },
    createShader: () => ({ source: "" }),
    shaderSource: (shader: { source: string }, source: string) => void (shader.source = source),
    getShaderParameter: (shader: { source: string }) => !(options.failSource && shader.source.includes(options.failSource)),
    createProgram: () => ({ id: ++programs }),
    getProgramParameter: () => true,
    useProgram: (program: { id: number } | null) => void (current = program?.id ?? 0),
    bindFramebuffer: (_target: number, target: unknown) => void (framebuffer = target !== null),
    viewport: (...args: number[]) => void (viewport = args),
    checkFramebufferStatus: () => (options.cells === false ? 0 : GL.FRAMEBUFFER_COMPLETE),
    isContextLost: () => false,
    drawArrays: () => void drawLog.push({ program: current, framebuffer, viewport }),
  };

  const gl = new Proxy<Record<string, unknown>>(
    { drawingBufferWidth: 640, drawingBufferHeight: 480, ...GL },
    {
      get(target, key) {
        if (typeof key !== "string") return undefined;
        if (key in target) return target[key];
        if (key === key.toUpperCase()) return undefined;
        const method = methods[key];
        if (key.startsWith("uniform")) {
          return (name: string, ...values: unknown[]) =>
            void uploads.push({ method: key, name, values: snapshot(values), program: current });
        }
        return (...args: never[]) => {
          if (RECORDED.has(key)) calls.push({ method: key, args });
          return method ? method(...args) : key.startsWith("create") ? {} : undefined;
        };
      },
    },
  );

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => gl,
    addEventListener: (type: string, listener: (event: Event) => void) => void listeners.set(type, listener),
    removeEventListener: (type: string) => void listeners.delete(type),
    ...canvasExtras,
  } as unknown as HTMLCanvasElement;

  return {
    canvas,
    uploads,
    drawLog,
    calls,
    draws: () => drawLog.length,
    fire: (type) => listeners.get(type)?.({ preventDefault() {} } as Event),
  };
}
