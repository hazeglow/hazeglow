import { describe, expect, it } from "vitest";
import { STALL_FRAME_MS, createStallWatch, paceFrame } from "../src/frame";

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

function watch(gaps: number[]): boolean[] {
  const stall = createStallWatch();
  let now = 1000;
  const out = [stall(now)];
  for (const gap of gaps) {
    now += gap;
    out.push(stall(now));
  }
  return out;
}

describe("createStallWatch", () => {
  it("never trips at 60 or 30 fps", () => {
    expect(watch(Array(120).fill(1000 / 60)).some(Boolean)).toBe(false);
    expect(watch(Array(120).fill(1000 / 30)).some(Boolean)).toBe(false);
  });

  it("trips once most of a dozen frames are slower than the limit", () => {
    const results = watch(Array(20).fill(STALL_FRAME_MS * 3));
    expect(results.indexOf(true)).toBe(12);
  });

  it("ignores a few long gaps, like a tab coming back or a page still loading", () => {
    const gaps = [...Array(10).fill(1000 / 60), 5000, 400, 300, ...Array(30).fill(1000 / 60)];
    expect(watch(gaps).some(Boolean)).toBe(false);
  });
});
