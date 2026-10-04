import { describe, expect, it } from "vitest";
import { hexToOklab, linearToSrgb } from "../src/color";
import { formatOklch, isColor, parseCssColor, parseOklch, parseVar } from "../src/css-color";
import { mulberry32 } from "../src/random";

function toSrgb8(lab: [number, number, number]): number[] {
  const [L, a, b] = lab;
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return linear.map((channel) =>
    Math.round(linearToSrgb(Math.min(1, Math.max(0, channel))) * 255),
  );
}

const nest = (levels: number) =>
  "var(--a" + ", var(--a".repeat(levels - 1) + ", #fff" + ")".repeat(levels);

const IS_COLOR: [unknown, boolean][] = [
  ["#abc", true],
  ["#AABBCC", true],
  ["#abcd", false],
  ["red", false],
  ["rgb(1,2,3)", false],
  ["oklch(0.7 0.15 200)", true],
  ["oklch(70% 0.15 200)", true],
  ["OKLCH(0.7 0.15 200deg)", true],
  ["oklch(0.7 0.15 0.5turn)", true],
  ["oklch(0.7 0.15 3.14rad)", true],
  ["oklch(0.7 0.15 200grad)", true],
  ["oklch(  0.7\n0.15\t200  )", true],
  ["oklch(0.7 0.15 200 / 0.5)", true],
  ["oklch(0.7 0.15 200/50%)", true],
  ["oklch(0.7 0.15 200 / none)", true],
  ["oklch(none none none)", true],
  ["oklch(1.5 -0.1 -30)", true],
  ["oklch(.5 +.1 1e2)", true],
  ["oklch(0.7 0.15)", false],
  ["oklch(0.7 0.15 200 10)", false],
  ["oklch(0.7, 0.15, 200)", false],
  ["oklch(0.7 0.15 200%)", false],
  ["oklch(0.7 0.15 200 / )", false],
  ["oklch(0.7 0.15 200 / 0.5 / 1)", false],
  ["oklch(5. 0.1 20)", false],
  ["oklch(0.7 0.15 200", false],
  [" oklch(0.7 0.15 200)", false],
  ["oklch(0.7 0.15 200) ", false],
  ["oklch(1e999 0.1 2)", false],
  ["oklch(calc(0.5) 0.1 2)", false],
  ["oklch(from red l c h)", false],
  ["oklab(0.7 0.1 0.1)", false],
  ["var(--brand)", true],
  ["VAR( --brand )", true],
  ["var(--brand, #fff)", true],
  ["var(--brand,oklch(0.5 0.1 20))", true],
  ["var(--a, var(--b, #000))", true],
  ["var(--a, red)", false],
  ["var(--a,)", false],
  ["var(brand)", false],
  ["var(--)", false],
  ["var(--grün)", false],
  ["var(--a b)", false],
  ["var(--a, #fff, #000)", false],
  ["var(--a, var(--b, #000)", false],
  [nest(21), false],
  [nest(7), true],
  [42, false],
  [null, false],
  [undefined, false],
  [["#fff"], false],
];

describe("isColor", () => {
  it.each(IS_COLOR)("%j is %s", (input, expected) => {
    expect(isColor(input)).toBe(expected);
  });

  it("allows eight levels of nesting and rejects nine", () => {
    expect(isColor(nest(8))).toBe(true);
    expect(isColor(nest(9))).toBe(false);
  });

  it("stays fast on hostile input", () => {
    const start = performance.now();
    isColor("oklch(" + " ".repeat(200000) + "x)");
    isColor("var(" + "-".repeat(200000) + ")");
    isColor("#".repeat(200000));
    isColor(nest(100000));
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe("parseVar", () => {
  it("splits the name from the fallback", () => {
    expect(parseVar("var( --a , var(--b) )")).toEqual({ name: "--a", fallback: "var(--b)" });
    expect(parseVar("var(--a)")).toEqual({ name: "--a", fallback: null });
    expect(parseVar("VAR(--A,red)")).toEqual({ name: "--A", fallback: "red" });
  });

  it("does not validate the fallback", () => {
    expect(parseVar("var(--a, nonsense)")).toEqual({ name: "--a", fallback: "nonsense" });
  });

  it("rejects bad names", () => {
    expect(parseVar("var(a)")).toBeNull();
    expect(parseVar("var(--)")).toBeNull();
    expect(parseVar("var(--é)")).toBeNull();
    expect(parseVar("oklch(0.5 0.1 20)")).toBeNull();
  });
});

describe("parseOklch", () => {
  it("converts to Oklab", () => {
    const [l, a, b] = parseOklch("oklch(0.7 0.15 200)") as number[];
    expect(l).toBe(0.7);
    expect(a).toBeCloseTo(0.15 * Math.cos((200 * Math.PI) / 180), 12);
    expect(b).toBeCloseTo(0.15 * Math.sin((200 * Math.PI) / 180), 12);
  });

  it("reads percentages", () => {
    expect(parseOklch("oklch(70% 100% 0)")).toEqual([0.7, 0.4, 0]);
  });

  it("treats every hue unit alike", () => {
    const reference = parseOklch("oklch(0.5 0.1 180)") as number[];
    for (const hue of ["180deg", "200grad", "0.5turn", String(Math.PI) + "rad"]) {
      const got = parseOklch(`oklch(0.5 0.1 ${hue})`) as number[];
      got.forEach((value, i) => expect(value).toBeCloseTo(reference[i] as number, 12));
    }
  });

  it("reads none as zero", () => {
    expect(parseOklch("oklch(none none none)")).toEqual([0, 0, 0]);
  });

  it("clamps lightness and negative chroma", () => {
    expect((parseOklch("oklch(1.5 0.1 0)") as number[])[0]).toBe(1);
    expect((parseOklch("oklch(-1 0.1 0)") as number[])[0]).toBe(0);
    const [, a, b] = parseOklch("oklch(0.5 -0.1 90)") as number[];
    expect(Math.abs(a as number)).toBeLessThan(1e-12);
    expect(b).toBe(0);
  });

  it("ignores alpha", () => {
    expect(parseOklch("oklch(0.5 0.1 20 / 0.3)")).toEqual(parseOklch("oklch(0.5 0.1 20)"));
  });

  it("returns null when invalid", () => {
    expect(parseOklch("oklch(0.5 0.1)")).toBeNull();
    expect(parseOklch("oklch(0.5 0.1 20 / )")).toBeNull();
    expect(parseOklch("#fff")).toBeNull();
  });
});

describe("parseCssColor", () => {
  const READBACK: [string, number[]][] = [
    ["lab(60% 40 30)", [217, 114, 94]],
    ["lch(60% 50 40)", [215, 115, 90]],
    ["oklab(0.7 -0.1 0.05)", [99, 179, 125]],
    ["oklch(0.7 0.15 200)", [0, 185, 195]],
    ["oklch(0.7 0.4 150)", [0, 214, 0]],
    ["color(display-p3 1 0 0)", [255, 0, 0]],
    ["color(srgb 0.2 0.4 0.6)", [51, 102, 153]],
    ["color(rec2020 0.5 0.5 0.5)", [139, 139, 139]],
    ["color(a98-rgb 0.5 0.2 0.1)", [147, 48, 16]],
    ["color(xyz 0.3 0.3 0.3)", [162, 145, 143]],
    ["color(xyz-d65 0.3 0.3 0.3)", [162, 145, 143]],
    ["oklab(0.539974 0.0962086 -0.0928316)", [140, 83, 162]],
    ["rgba(255, 0, 0, 0.5)", [255, 0, 0]],
    ["rgba(0, 0, 0, 0)", [0, 0, 0]],
  ];

  it.each(READBACK)("%s draws %j", (text, expected) => {
    expect(toSrgb8(parseCssColor(text) as [number, number, number])).toEqual(expected);
  });

  it("reads the other predefined spaces", () => {
    for (const text of [
      "color(srgb-linear 0.2 0.4 0.6)",
      "color(prophoto-rgb 0.5 0.5 0.5)",
      "color(xyz-d50 0.3 0.3 0.3)",
    ]) {
      const lab = parseCssColor(text) as number[];
      expect(lab).toHaveLength(3);
      lab.forEach((value) => expect(Number.isFinite(value)).toBe(true));
    }
  });

  it("matches hexToOklab exactly", () => {
    const expected = hexToOklab("#6a3df5");
    expect(parseCssColor("#6a3df5")).toEqual(expected);
    expect(parseCssColor("rgb(106, 61, 245)")).toEqual(expected);
    expect(parseCssColor("rgb(106 61 245 / 50%)")).toEqual(expected);
    expect(parseCssColor("#6a3df5ff")).toEqual(expected);
    expect(parseCssColor("#abcf")).toEqual(hexToOklab("#abc"));
  });

  it("rejects what it does not handle", () => {
    for (const text of [
      "hsl(200 50% 50%)",
      "red",
      "color(foo 1 2 3)",
      "rgb(1 2)",
      "lab(1, 2, 3)",
      "var(--a)",
      "color-mix(in oklab, red, blue)",
      "light-dark(#fff, #000)",
      "currentcolor",
      "#abcde",
      " #fff",
      "",
    ]) {
      expect(parseCssColor(text)).toBeNull();
    }
  });
});

describe("formatOklch", () => {
  it("rounds and trims", () => {
    expect(formatOklch(hexToOklab("#ff0000"))).toBe("oklch(0.628 0.2577 29.23)");
    expect(formatOklch(hexToOklab("#ffffff"))).toBe("oklch(1 0 0)");
    expect(formatOklch(hexToOklab("#000000"))).toBe("oklch(0 0 0)");
  });

  it("never prints negative zero", () => {
    expect(formatOklch([-0.00001, -0.00001, -0.00001])).toBe("oklch(0 0 0)");
    expect(formatOklch([0.5, 0.1, -0.0000001])).toBe("oklch(0.5 0.1 0)");
  });

  it("keeps the hue below 360", () => {
    expect(formatOklch([0.5, 0.1, -0.0000001])).not.toContain("360");
  });
});

describe("fuzz", () => {
  it("never throws on random strings", () => {
    const alphabet = "oklchvar(-#%/ ,.0123456789e)";
    const random = mulberry32(7);
    for (let i = 0; i < 5000; i += 1) {
      const length = Math.floor(random() * 40);
      let text = "";
      for (let j = 0; j < length; j += 1) {
        text += alphabet[Math.floor(random() * alphabet.length)];
      }
      expect(() => {
        isColor(text);
        parseCssColor(text);
        parseOklch(text);
        parseVar(text);
      }).not.toThrow();
    }
  });
});

describe("overflow and unsafe text", () => {
  const OVERFLOW = [
    "oklch(1e999% 0.1 20)",
    "oklch(0.5 1e999% 20)",
    "oklch(0.5 0.1 20 / 1e999%)",
    "oklch(0.5 0.1 1e308)",
  ];

  it.each(OVERFLOW)("rejects %s", (input) => {
    expect(isColor(input)).toBe(false);
    expect(parseOklch(input)).toBeNull();
  });

  it("rejects overflow in other functions", () => {
    expect(parseCssColor("lab(50% 1e999% 0)")).toBeNull();
    expect(parseCssColor("color(srgb 1e999% 0 0)")).toBeNull();
  });

  const UNSAFE = [
    "oklch(\u3000 0.5 0.1 20)",
    "var(\u3000--a)",
    "var(--a,\ufeff#fff)",
    "oklch(0.5 0.1 20 /\u00a00.5)",
    "oklch(0.5\v0.1 20)",
  ];

  it.each(UNSAFE)("rejects %j", (input) => {
    expect(isColor(input)).toBe(false);
    expect(parseOklch(input)).toBeNull();
    expect(parseCssColor(input)).toBeNull();
  });
});
