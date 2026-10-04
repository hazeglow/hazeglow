export interface Upload {
  method: string;
  name: string;
  values: number[];
}

export interface FakeGl {
  canvas: HTMLCanvasElement;
  uploads: Upload[];
  draws(): number;
  fire(type: string): void;
}

function snapshot(values: unknown[]): number[] {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === "number") out.push(value);
    else if (value && typeof value === "object") out.push(...Array.from(value as ArrayLike<number>));
    else if (typeof value === "boolean") out.push(Number(value));
  }
  return out;
}

export function fakeGl(canvasExtras: Record<string, unknown> = {}): FakeGl {
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
        if (key.startsWith("uniform")) {
          return (name: string, ...values: unknown[]) =>
            void uploads.push({ method: key, name, values: snapshot(values) });
        }
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
    ...canvasExtras,
  } as unknown as HTMLCanvasElement;

  return {
    canvas,
    uploads,
    draws: () => draws,
    fire: (type) => listeners.get(type)?.({ preventDefault() {} } as Event),
  };
}
