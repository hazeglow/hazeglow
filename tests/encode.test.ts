import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config";
import { decodeConfig, encodeConfig } from "../src/encode";
import { presets } from "../src/presets";
import { randomConfig } from "../src/random";

describe("encodeConfig / decodeConfig", () => {
  it("round-trips every preset", () => {
    for (const config of Object.values(presets)) {
      expect(decodeConfig(encodeConfig(config))).toEqual(config);
    }
  });

  it("round-trips random configs", () => {
    for (let seed = 0; seed < 50; seed++) {
      const config = randomConfig(seed);
      expect(decodeConfig(encodeConfig(config))).toEqual(config);
    }
  });

  it("gives the same link before and after a round trip, so a reload does not rewrite the url", () => {
    for (const config of [...Object.values(presets), randomConfig(7), randomConfig(8)]) {
      const encoded = encodeConfig(config);
      expect(encodeConfig(decodeConfig(encoded))).toBe(encoded);
    }
  });

  it("produces a URL-safe string", () => {
    for (const config of Object.values(presets)) {
      expect(encodeConfig(config)).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("returns the default config for garbage", () => {
    for (const input of ["", "!!!", "not base64 at all", "e30", "AAAA"]) {
      expect(decodeConfig(input)).toEqual(DEFAULT_CONFIG);
    }
  });

  it("repairs a decoded config that is out of range", () => {
    const encoded = encodeConfig({ ...DEFAULT_CONFIG, grain: 50 });
    expect(decodeConfig(encoded).grain).toBe(1);
  });
});

describe("presets", () => {
  it("has six", () => {
    expect(Object.keys(presets)).toHaveLength(6);
  });
});
