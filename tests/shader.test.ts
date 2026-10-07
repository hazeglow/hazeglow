import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { VERTEX_SHADER, fragmentShader } from "../src/shader";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

describe("shader source", () => {
  it("keeps the vertex shader byte for byte, so the picture cannot drift", () => {
    expect(sha256(VERTEX_SHADER)).toBe("2a54593de58f3546c924df09f19e1bca9944f74f3afeb46fffb351c533e49f74");
  });

  it("keeps the fragment shader byte for byte, so the picture cannot drift", () => {
    expect(fragmentShader()).toHaveLength(13347);
    expect(sha256(fragmentShader())).toBe("f3835660a066b2c8cfe4bbb049792072a23878d285e2e0e2c48a31a05e6338b6");
  });

  it("builds the same source every time", () => {
    expect(fragmentShader()).toBe(fragmentShader());
  });
});
