import { describe, expect, it, vi } from "vitest";
import { hexToOklab } from "../src/color";
import { DEFAULT_CONFIG, parseConfig, type GradientConfig } from "../src/config";
import { parseCssColor, parseOklch } from "../src/css-color";
import { colorToOklab, createColors, resolveConfig } from "../src/tokens";
import { fakeDom } from "./support/dom";

const LAB = parseCssColor("lab(60% 40 30)");

describe("colorToOklab without an element", () => {
  it("returns exactly hexToOklab for hex", () => {
    expect(colorToOklab("#6a3df5")).toEqual(hexToOklab("#6a3df5"));
  });

  it("parses oklch", () => {
    expect(colorToOklab("oklch(0.7 0.15 200)")).toEqual(parseCssColor("oklch(0.7 0.15 200)"));
  });

  it("returns null for invalid strings", () => {
    expect(colorToOklab("nope")).toBeNull();
    expect(colorToOklab("var(bad)")).toBeNull();
  });

  it("uses the fallback of a var", () => {
    expect(colorToOklab("var(--a, #6a3df5)")).toEqual(hexToOklab("#6a3df5"));
  });

  it("follows a nested fallback", () => {
    expect(colorToOklab("var(--a, var(--b, #112233))")).toEqual(hexToOklab("#112233"));
  });

  it("returns null with no fallback", () => {
    expect(colorToOklab("var(--a)")).toBeNull();
  });

  it("returns a fresh array", () => {
    expect(colorToOklab("#6a3df5")).not.toBe(colorToOklab("#6a3df5"));
  });
});

describe("colorToOklab with a DOM", () => {
  it("reads an oklch token", () => {
    const dom = fakeDom({ properties: { "--t": "oklch(0.7 0.15 200)" } });
    expect(colorToOklab("var(--t)", dom.element)).toEqual(parseCssColor("oklch(0.7 0.15 200)"));
  });

  it("reads a lab token", () => {
    const dom = fakeDom({ properties: { "--t": "lab(60% 40 30)" } });
    expect(colorToOklab("var(--t)", dom.element)).toEqual(LAB);
  });

  it("reads a hex token", () => {
    const dom = fakeDom({ properties: { "--t": "#6a3df5" } });
    expect(colorToOklab("var(--t)", dom.element)).toEqual(hexToOklab("#6a3df5"));
  });

  it("resolves named colours through fillStyle", () => {
    const dom = fakeDom({ properties: { "--t": "red" } });
    expect(colorToOklab("var(--t)", dom.element)).toEqual(hexToOklab("#ff0000"));
  });

  it("resolves color-mix through fillStyle", () => {
    const dom = fakeDom({ properties: { "--t": "color-mix(in oklab, red, blue)" } });
    expect(colorToOklab("var(--t)", dom.element)).toEqual(
      parseCssColor("oklab(0.539974 0.0962086 -0.0928316)"),
    );
  });

  it("resolves transparent to black", () => {
    const dom = fakeDom({ properties: { "--t": "transparent" } });
    expect(colorToOklab("var(--t)", dom.element)).toEqual(hexToOklab("#000000"));
  });

  it("uses the fallback for an empty value", () => {
    const dom = fakeDom({ properties: { "--t": "" } });
    expect(colorToOklab("var(--t, #112233)", dom.element)).toEqual(hexToOklab("#112233"));
  });

  it("uses the fallback for a non-colour", () => {
    const dom = fakeDom({ properties: { "--t": "12px" } });
    expect(colorToOklab("var(--t, #112233)", dom.element)).toEqual(hexToOklab("#112233"));
  });

  it("returns null for a missing token with no fallback", () => {
    const dom = fakeDom();
    expect(colorToOklab("var(--t)", dom.element)).toBeNull();
  });

  it("resolves currentColor to the element colour", () => {
    const dom = fakeDom({ properties: { "--t": "currentColor" }, color: "rgb(106, 61, 245)" });
    expect(colorToOklab("var(--t)", dom.element)).toEqual(hexToOklab("#6a3df5"));
  });

  it("picks dark under light dark with a dark preference", () => {
    const dom = fakeDom({
      properties: { "--t": "light-dark(#ffffff, #000000)" },
      colorScheme: "light dark",
      dark: true,
    });
    expect(colorToOklab("var(--t)", dom.element)).toEqual(hexToOklab("#000000"));
  });

  it("picks light under light dark without a dark preference", () => {
    const dom = fakeDom({
      properties: { "--t": "light-dark(#ffffff, #000000)" },
      colorScheme: "light dark",
    });
    expect(colorToOklab("var(--t)", dom.element)).toEqual(hexToOklab("#ffffff"));
  });

  it("picks dark under scheme dark", () => {
    const dom = fakeDom({ properties: { "--t": "light-dark(#fff, #000)" }, colorScheme: "dark" });
    expect(colorToOklab("var(--t)", dom.element)).toEqual(hexToOklab("#000000"));
  });

  it("picks dark under scheme dark only", () => {
    const dom = fakeDom({ properties: { "--t": "light-dark(#fff, #000)" }, colorScheme: "dark only" });
    expect(colorToOklab("var(--t)", dom.element)).toEqual(hexToOklab("#000000"));
  });

  it("picks light under scheme normal", () => {
    const dom = fakeDom({ properties: { "--t": "light-dark(#fff, #000)" }, colorScheme: "normal" });
    expect(colorToOklab("var(--t)", dom.element)).toEqual(hexToOklab("#ffffff"));
  });

  it("uses the meta scheme when the computed one is normal", () => {
    const dom = fakeDom({
      properties: { "--t": "light-dark(#fff, #000)" },
      colorScheme: "normal",
      meta: "light dark",
      dark: true,
    });
    expect(colorToOklab("var(--t)", dom.element)).toEqual(hexToOklab("#000000"));
  });

  it("splits light-dark on the top-level comma only", () => {
    const dom = fakeDom({
      properties: { "--t": "light-dark(rgb(255, 255, 255), rgb(0, 0, 0))" },
      colorScheme: "dark",
    });
    expect(colorToOklab("var(--t)", dom.element)).toEqual(hexToOklab("#000000"));
  });

  it("uses the fallback when getComputedStyle throws", () => {
    const dom = fakeDom({ properties: { "--t": "#ffffff" }, throwing: true });
    expect(() => colorToOklab("var(--t, #112233)", dom.element)).not.toThrow();
    expect(colorToOklab("var(--t, #112233)", dom.element)).toEqual(hexToOklab("#112233"));
  });

  it("creates no watchers", () => {
    const dom = fakeDom({ properties: { "--t": "#ffffff" } });
    colorToOklab("var(--t)", dom.element);
    expect(dom.observers).toHaveLength(0);
    expect(dom.counts.matchMedia).toBe(0);
  });
});

describe("createColors", () => {
  it("reads a token once", () => {
    const dom = fakeDom({ properties: { "--t": "#6a3df5" } });
    const colors = createColors(dom.element, () => {});
    expect(colors.get("var(--t)")).toEqual(hexToOklab("#6a3df5"));
    const before = dom.counts.getComputedStyle;
    colors.get("var(--t)");
    expect(dom.counts.getComputedStyle).toBe(before);
    expect(dom.counts.getPropertyValue).toBe(1);
  });

  it("draws black for an unresolved token", () => {
    const dom = fakeDom();
    const colors = createColors(dom.element, () => {});
    expect(colors.get("var(--t)")).toEqual([0, 0, 0]);
  });

  it("returns literals the way the renderer did", () => {
    const colors = createColors(null, () => {});
    expect(colors.get("#6a3df5")).toEqual(hexToOklab("#6a3df5"));
    expect(colors.get("oklch(0.7 0.15 200)")).toEqual(parseCssColor("oklch(0.7 0.15 200)"));
    expect(colors.get("junk")).toEqual(hexToOklab("junk"));
  });

  it("clears everything when tokens alone fill the cache, and watches again", () => {
    const dom = fakeDom({ properties: { "--t": "#6a3df5" } });
    const colors = createColors(dom.element, () => {});
    colors.get("var(--t)");
    for (let i = 0; i < 70; i++) colors.get(`var(--x${i}, #fff)`);
    expect(dom.observers[0]?.disconnected).toBe(1);
    const before = dom.counts.getComputedStyle;
    expect(colors.get("var(--t)")).toEqual(hexToOklab("#6a3df5"));
    expect(dom.counts.getComputedStyle).toBeGreaterThan(before);
    expect(dom.observers.length).toBeGreaterThan(1);
  });

  it("does not cache while the element is disconnected", () => {
    const dom = fakeDom({ properties: { "--t": "#6a3df5" }, connected: false });
    const colors = createColors(dom.element, () => {});
    expect(colors.get("var(--t)")).toEqual([0, 0, 0]);
    dom.setConnected(true);
    expect(colors.get("var(--t)")).toEqual(hexToOklab("#6a3df5"));
  });

  it("creates no watchers for hex and oklch literals", () => {
    const dom = fakeDom();
    const colors = createColors(dom.element, () => {});
    colors.get("#112233");
    colors.get("oklch(0.5 0.1 20)");
    expect(dom.observers).toHaveLength(0);
    expect(dom.counts.addListener).toBe(0);
    expect(dom.counts.matchMedia).toBe(0);
  });

  it("never touches the globals without an element", () => {
    const calls = { observers: 0, matchMedia: 0 };
    class CountingObserver {
      constructor() {
        calls.observers++;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("MutationObserver", CountingObserver);
    vi.stubGlobal("matchMedia", () => {
      calls.matchMedia++;
      return { matches: false, addEventListener() {}, removeEventListener() {} };
    });
    try {
      const colors = createColors(null, () => {});
      expect(colors.get("var(--t, #112233)")).toEqual(hexToOklab("#112233"));
      colors.dispose();
      expect(calls).toEqual({ observers: 0, matchMedia: 0 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("makes a 1x1 scratch canvas", () => {
    const dom = fakeDom({ properties: { "--t": "red" } });
    createColors(dom.element, () => {}).get("var(--t)");
    expect(dom.sizes).toEqual([[1, 1]]);
  });

  it("keeps watched tokens when the cache fills up", () => {
    const dom = fakeDom({ properties: { "--t": "#ffffff" } });
    const onChange = vi.fn();
    const colors = createColors(dom.element, onChange);
    colors.get("var(--t)");
    for (let i = 0; i < 70; i++) colors.get(`#${(i + 1).toString(16).padStart(6, "0")}`);
    dom.setProperty("--t", "#000000");
    dom.mutate();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(colors.get("var(--t)")).toEqual(hexToOklab("#000000"));
  });

  it("watches only once tokens are cached", () => {
    const dom = fakeDom({ properties: { "--a": "#ffffff", "--b": "#000000" } });
    const colors = createColors(dom.element, () => {});
    expect(dom.observers).toHaveLength(0);
    colors.get("var(--a)");
    expect(dom.observers).toHaveLength(1);
    expect(dom.observers[0]?.target).toBe(dom.documentElement);
    expect(dom.observers[0]?.options).toEqual({
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });
    expect(dom.queries).toEqual(["(prefers-color-scheme: dark)"]);
    expect(dom.counts.addListener).toBe(1);
    colors.get("var(--b)");
    expect(dom.observers).toHaveLength(1);
    expect(dom.counts.addListener).toBe(1);
  });

  it("unwatches when the element is disconnected", () => {
    const dom = fakeDom({ properties: { "--t": "#ffffff" } });
    const colors = createColors(dom.element, () => {});
    colors.get("var(--t)");
    dom.setConnected(false);
    dom.mutate();
    expect(dom.observers[0]?.disconnected).toBe(1);
    expect(dom.counts.removeListener).toBe(1);
  });

  it("unwatches on dispose after a token", () => {
    const dom = fakeDom({ properties: { "--t": "#ffffff" } });
    const colors = createColors(dom.element, () => {});
    colors.get("var(--t)");
    colors.dispose();
    expect(dom.observers[0]?.disconnected).toBe(1);
    expect(dom.counts.removeListener).toBe(1);
    colors.get("var(--t)");
    expect(dom.observers).toHaveLength(1);
  });

  it("draws black for colours that are not strings", () => {
    const colors = createColors(null, () => {});
    for (const bad of [undefined, null, 42, ["x"]]) {
      expect(colors.get(bad as unknown as string)).toEqual([0, 0, 0]);
    }
    expect(colorToOklab(undefined as unknown as string)).toBeNull();
  });

  it("calls onChange once when a token changed", () => {
    const dom = fakeDom({ properties: { "--t": "#ffffff" } });
    const onChange = vi.fn();
    const colors = createColors(dom.element, onChange);
    colors.get("var(--t)");
    dom.setProperty("--t", "#000000");
    dom.mutate();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(colors.get("var(--t)")).toEqual(hexToOklab("#000000"));
  });

  it("refreshes on a media change", () => {
    const dom = fakeDom({ properties: { "--t": "#ffffff" } });
    const onChange = vi.fn();
    const colors = createColors(dom.element, onChange);
    colors.get("var(--t)");
    dom.setProperty("--t", "#000000");
    dom.media.fire();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not call onChange when nothing changed", () => {
    const dom = fakeDom({ properties: { "--t": "#ffffff" } });
    const onChange = vi.fn();
    const colors = createColors(dom.element, onChange);
    colors.get("var(--t)");
    dom.mutate();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does nothing when no tokens are cached", () => {
    const dom = fakeDom();
    const onChange = vi.fn();
    const colors = createColors(dom.element, onChange);
    colors.get("#ffffff");
    dom.mutate();
    expect(dom.counts.getComputedStyle).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("drops tokens when the element was disconnected", () => {
    const dom = fakeDom({ properties: { "--t": "#ffffff" } });
    const onChange = vi.fn();
    const colors = createColors(dom.element, onChange);
    colors.get("var(--t)");
    dom.setConnected(false);
    dom.mutate();
    expect(onChange).not.toHaveBeenCalled();
    dom.setConnected(true);
    dom.setProperty("--t", "#000000");
    expect(colors.get("var(--t)")).toEqual(hexToOklab("#000000"));
  });

  it("never throws from refresh", () => {
    const dom = fakeDom({ properties: { "--t": "#ffffff" } });
    const colors = createColors(dom.element, () => {
      throw new Error("boom");
    });
    colors.get("var(--t)");
    dom.setProperty("--t", "#000000");
    expect(() => dom.mutate()).not.toThrow();
  });

  it("disconnects and removes the listener on dispose", () => {
    const dom = fakeDom({ properties: { "--t": "#ffffff" } });
    const onChange = vi.fn();
    const colors = createColors(dom.element, onChange);
    colors.get("var(--t)");
    colors.dispose();
    expect(dom.observers[0]?.disconnected).toBe(1);
    expect(dom.counts.removeListener).toBe(1);
    dom.setProperty("--t", "#000000");
    dom.media.fire();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses the canvas window for scratch contexts", () => {
    const dom = fakeDom({ properties: { "--t": "red" } });
    const colors = createColors(dom.element, () => {});
    colors.get("var(--t)");
    expect(dom.counts.createElement).toBe(1);
    expect(dom.counts.fillStyle).toBe(4);
  });

  it("falls back when there is no 2D context", () => {
    const dom = fakeDom({ properties: { "--t": "red" }, noContext: true });
    const colors = createColors(dom.element, () => {});
    expect(colors.get("var(--t)")).toEqual([0, 0, 0]);
  });
});

describe("token lightness", () => {
  it("clamps the lightness the same way for the render and resolveConfig", () => {
    const dom = fakeDom({ properties: { "--a": "color(xyz 2 2 2)" } });
    const lab = colorToOklab("var(--a)", dom.element);
    expect(lab?.[0]).toBe(1);
    const resolved = resolveConfig({ ...DEFAULT_CONFIG, palette: ["var(--a)", "#fff"] }, dom.element);
    expect(parseOklch(resolved.palette[0] as string)?.[0]).toBe(1);
  });
});

describe("resolveConfig", () => {
  function configWith(overrides: Partial<GradientConfig>): GradientConfig {
    return { ...DEFAULT_CONFIG, ...overrides };
  }

  it("replaces tokens in palette, background and mesh", () => {
    const dom = fakeDom({ properties: { "--a": "#112233", "--b": "oklch(0.7 0.15 200)" } });
    const config = configWith({
      palette: ["var(--a)", "#ffffff"],
      background: "var(--b)",
      mesh: [[0.1, 0.2, "var(--a)"]],
    });
    const resolved = resolveConfig(config, dom.element);
    expect(resolved.palette).toEqual(["#112233", "#ffffff"]);
    expect(resolved.background).toBe("oklch(0.7 0.15 200)");
    expect(resolved.mesh).toEqual([[0.1, 0.2, "#112233"]]);
  });

  it("keeps literals verbatim", () => {
    const dom = fakeDom();
    const config = configWith({ palette: ["#AbC", "oklch(70% 0.15 200)"], background: "junk" });
    const resolved = resolveConfig(config, dom.element);
    expect(resolved.palette).toEqual(["#AbC", "oklch(70% 0.15 200)"]);
    expect(resolved.background).toBe("junk");
  });

  it("keeps a hex token as written", () => {
    const dom = fakeDom({ properties: { "--a": "#6a3df5" } });
    const resolved = resolveConfig(configWith({ palette: ["var(--a)", "#fff"] }), dom.element);
    expect(resolved.palette[0]).toBe("#6a3df5");
  });

  it("converts a lab token to oklch", () => {
    const dom = fakeDom({ properties: { "--a": "lab(60% 40 30)" } });
    const resolved = resolveConfig(configWith({ palette: ["var(--a)", "#fff"] }), dom.element);
    expect(resolved.palette[0]).toBe("oklch(0.6652 0.1334 31.93)");
  });

  it("turns an unresolved token into black", () => {
    const dom = fakeDom();
    const resolved = resolveConfig(configWith({ palette: ["var(--a)", "#fff"] }), dom.element);
    expect(resolved.palette[0]).toBe("#000000");
  });

  it("uses a literal fallback as written", () => {
    const dom = fakeDom();
    const resolved = resolveConfig(configWith({ palette: ["var(--a, #123)", "#fff"] }), dom.element);
    expect(resolved.palette[0]).toBe("#123");
  });

  it("keeps key order and returns new arrays", () => {
    const dom = fakeDom({ properties: { "--a": "#112233" } });
    const config = configWith({ palette: ["var(--a)", "#fff"], mesh: [[0, 0, "var(--a)"]] });
    const resolved = resolveConfig(config, dom.element);
    expect(Object.keys(resolved)).toEqual(Object.keys(config));
    expect(resolved.palette).not.toBe(config.palette);
    expect(resolved.mesh).not.toBe(config.mesh);
    expect(resolved.mesh[0]).not.toBe(config.mesh[0]);
  });

  it("does not mutate the input", () => {
    const dom = fakeDom({ properties: { "--a": "#112233" } });
    const config = configWith({ palette: ["var(--a)", "#fff"], mesh: [[0, 0, "var(--a)"]] });
    const snapshot = JSON.parse(JSON.stringify(config));
    resolveConfig(config, dom.element);
    expect(config).toEqual(snapshot);
  });

  it("survives a parseConfig round trip", () => {
    const dom = fakeDom({ properties: { "--a": "lab(60% 40 30)" } });
    const config = configWith({ palette: ["var(--a)", "#fff"], background: "var(--a)" });
    const resolved = resolveConfig(config, dom.element);
    expect(parseConfig(resolved)).toEqual(resolved);
  });

  it("uses one scratch context per call", () => {
    const dom = fakeDom({ properties: { "--a": "red", "--b": "transparent" } });
    resolveConfig(configWith({ palette: ["var(--a)", "var(--b)"] }), dom.element);
    expect(dom.counts.createElement).toBe(1);
  });
});
