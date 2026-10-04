const NORMALIZE_TABLE: Record<string, string> = {
  red: "#ff0000",
  "hsl(200 50% 50%)": "#4095bf",
  "color-mix(in oklab, red, blue)": "oklab(0.539974 0.0962086 -0.0928316)",
  transparent: "rgba(0, 0, 0, 0)",
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const KEPT = /^(?:oklch|oklab|lab)\(.*\)$/;

export function normalizeFill(value: string): string | null {
  const known = NORMALIZE_TABLE[value];
  if (known !== undefined) return known;
  if (HEX.test(value)) {
    const digits = value.slice(1).toLowerCase();
    return `#${digits.length === 3 ? digits.replace(/./g, "$&$&") : digits}`;
  }
  return KEPT.test(value) ? value : null;
}

export interface DomOptions {
  properties?: Record<string, string>;
  color?: string;
  colorScheme?: string;
  meta?: string | null;
  dark?: boolean;
  connected?: boolean;
  throwing?: boolean;
  noContext?: boolean;
}

export interface FakeObserver {
  callback: () => void;
  target: unknown;
  options: unknown;
  observed: number;
  disconnected: number;
  trigger(): void;
}

export function fakeDom(options: DomOptions = {}) {
  const state = {
    properties: { ...(options.properties ?? {}) } as Record<string, string>,
    color: options.color ?? "rgb(0, 0, 0)",
    colorScheme: options.colorScheme ?? "normal",
    meta: options.meta ?? null,
    dark: options.dark ?? false,
    connected: options.connected ?? true,
    throwing: options.throwing ?? false,
  };
  const counts = {
    getComputedStyle: 0,
    getPropertyValue: 0,
    fillStyle: 0,
    createElement: 0,
    addListener: 0,
    removeListener: 0,
    matchMedia: 0,
  };
  const observers: FakeObserver[] = [];
  const queries: string[] = [];
  const sizes: [number, number][] = [];
  const listeners = new Set<() => void>();

  const media = {
    get matches() {
      return state.dark;
    },
    addEventListener(_type: string, listener: () => void) {
      counts.addListener++;
      listeners.add(listener);
    },
    removeEventListener(_type: string, listener: () => void) {
      counts.removeListener++;
      listeners.delete(listener);
    },
    fire() {
      for (const listener of [...listeners]) listener();
    },
  };

  class FakeMutationObserver implements FakeObserver {
    callback: () => void;
    target: unknown = null;
    options: unknown = null;
    observed = 0;
    disconnected = 0;
    constructor(callback: () => void) {
      this.callback = callback;
      observers.push(this);
    }
    observe(target: unknown, observeOptions: unknown) {
      this.observed++;
      this.target = target;
      this.options = observeOptions;
    }
    disconnect() {
      this.disconnected++;
    }
    trigger() {
      this.callback();
    }
  }

  function makeContext() {
    let fill = "#000000";
    return {
      get fillStyle() {
        return fill;
      },
      set fillStyle(value: string) {
        counts.fillStyle++;
        const next = normalizeFill(value);
        if (next !== null) fill = next;
      },
    };
  }

  const documentElement = { tag: "html" };

  const view = {
    getComputedStyle(_element: unknown) {
      counts.getComputedStyle++;
      if (state.throwing) throw new Error("getComputedStyle failed");
      return {
        getPropertyValue(name: string) {
          counts.getPropertyValue++;
          if (!state.connected) return "";
          return state.properties[name] ?? "";
        },
        get color() {
          return state.connected ? state.color : "";
        },
        get colorScheme() {
          return state.connected ? state.colorScheme : "";
        },
      };
    },
    matchMedia(query: string) {
      counts.matchMedia++;
      queries.push(query);
      return media;
    },
    MutationObserver: FakeMutationObserver,
  };

  const ownerDocument = {
    defaultView: view,
    documentElement,
    createElement(_tag: string) {
      counts.createElement++;
      const created = {
        width: 300,
        height: 150,
        getContext: (_kind: string) => {
          sizes.push([created.width, created.height]);
          return options.noContext ? null : makeContext();
        },
      };
      return created;
    },
    querySelector(_selector: string) {
      return state.meta === null ? null : { content: state.meta };
    },
  };

  const element = {
    get isConnected() {
      return state.connected;
    },
    ownerDocument,
  };

  return {
    element: element as unknown as Element,
    view,
    documentElement,
    counts,
    observers,
    queries,
    sizes,
    media,
    state,
    setProperty(name: string, value: string) {
      state.properties[name] = value;
    },
    setDark(value: boolean) {
      state.dark = value;
    },
    setConnected(value: boolean) {
      state.connected = value;
    },
    setThrowing(value: boolean) {
      state.throwing = value;
    },
    mutate() {
      for (const observer of observers) observer.trigger();
    },
  };
}
