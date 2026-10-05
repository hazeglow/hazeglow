import { describe, expect, it } from "vitest";
import { paceFrame } from "../src/frame";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulate(interval: number, seconds: number, jitter = 0, seed = 1): { draws: number; frames: number; late: boolean } {
  const random = mulberry32(seed);
  let paced = 0;
  let draws = 0;
  let frames = 0;
  let late = false;
  for (let i = 1; i * interval <= seconds * 1000; i++) {
    const now = i * interval + (random() * 2 - 1) * jitter;
    frames++;
    const next = paceFrame(paced, now);
    if (next === null) continue;
    if (next > now) late = true;
    paced = next;
    draws++;
  }
  return { draws, frames, late };
}

describe("paceFrame", () => {
  it("draws every frame on a 60 Hz stream with jitter", () => {
    const { draws, frames } = simulate(1000 / 60, 2, 0.3);
    expect(draws).toBe(frames);
  });

  it("draws every other frame at 120 Hz", () => {
    const { draws } = simulate(1000 / 120, 2);
    expect(Math.abs(draws - 120)).toBeLessThanOrEqual(1);
  });

  it("averages 60 draws a second at 144 Hz", () => {
    const { draws } = simulate(1000 / 144, 3);
    expect(Math.abs(draws - 180)).toBeLessThanOrEqual(9);
  });

  it("averages 60 draws a second at 90 Hz", () => {
    const { draws } = simulate(1000 / 90, 3);
    expect(Math.abs(draws - 180)).toBeLessThanOrEqual(9);
  });

  it("draws every frame at 30 Hz", () => {
    const { draws, frames } = simulate(1000 / 30, 2);
    expect(draws).toBe(frames);
  });

  it("never returns a time later than now", () => {
    for (const hz of [30, 60, 90, 120, 144]) {
      expect(simulate(1000 / hz, 3, 0.3, hz).late).toBe(false);
    }
  });
});
