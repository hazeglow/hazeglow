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
    expect(fragmentShader()).toHaveLength(13118);
    expect(sha256(fragmentShader())).toBe("2526fda2103ecac1bddb4b99aaf5c7faefc4328cc582a3c5438aaf5cf404a7f3");
  });

  it("builds the same source every time", () => {
    expect(fragmentShader()).toBe(fragmentShader());
  });
});
