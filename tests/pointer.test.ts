import { describe, expect, it } from "vitest";
import { IDLE_POINTER, approach, isSettled, stepPointer, type PointerState } from "../src/pointer";

describe("approach", () => {
  it("moves toward the target without overshooting", () => {
    const next = approach(0, 1, 0.016, 8);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
  });

  it("stays put when already there", () => {
    expect(approach(0.4, 0.4, 0.1, 8)).toBe(0.4);
  });

  it("does not move when no time has passed", () => {
    expect(approach(0.2, 1, 0, 8)).toBe(0.2);
  });

  it("gives the same result however the time is sliced, so it is frame-rate independent", () => {
    const once = approach(0, 1, 0.1, 8);
    const twice = approach(approach(0, 1, 0.05, 8), 1, 0.05, 8);
    expect(twice).toBeCloseTo(once, 10);
  });

  it("gets arbitrarily close given enough time", () => {
    expect(approach(0, 1, 5, 8)).toBeCloseTo(1, 6);
  });
});

describe("stepPointer", () => {
  const hovering: PointerState = { x: 0.2, y: 0.2, force: 0 };

  it("raises the force while the pointer is over the canvas", () => {
    const next = stepPointer(hovering, { x: 0.2, y: 0.2, inside: true }, 0.1);
    expect(next.force).toBeGreaterThan(0);
    expect(next.force).toBeLessThanOrEqual(1);
  });

  it("follows the pointer with lag rather than jumping", () => {
    const next = stepPointer({ x: 0.2, y: 0.2, force: 1 }, { x: 0.8, y: 0.6, inside: true }, 0.016);
    expect(next.x).toBeGreaterThan(0.2);
    expect(next.x).toBeLessThan(0.8);
    expect(next.y).toBeGreaterThan(0.2);
    expect(next.y).toBeLessThan(0.6);
  });

  it("snaps to the pointer when the force is zero, so it does not sweep in from a stale position", () => {
    const next = stepPointer({ x: 0.1, y: 0.1, force: 0 }, { x: 0.9, y: 0.9, inside: true }, 0.016);
    expect(next.x).toBe(0.9);
    expect(next.y).toBe(0.9);
  });

  it("lets go smoothly when the pointer leaves, holding its last position", () => {
    const next = stepPointer({ x: 0.5, y: 0.5, force: 1 }, { x: 0.9, y: 0.9, inside: false }, 0.016);
    expect(next.force).toBeLessThan(1);
    expect(next.force).toBeGreaterThan(0);
    expect(next.x).toBe(0.5);
    expect(next.y).toBe(0.5);
  });

  it("returns to rest after the pointer has been gone a while", () => {
    let state: PointerState = { x: 0.5, y: 0.5, force: 1 };
    for (let i = 0; i < 120; i++) state = stepPointer(state, { x: 0.5, y: 0.5, inside: false }, 1 / 60);
    expect(isSettled(state, false)).toBe(true);
  });
});

describe("isSettled", () => {
  it("is settled at rest", () => {
    expect(isSettled(IDLE_POINTER, false)).toBe(true);
  });

  it("is not settled while the pointer is inside", () => {
    expect(isSettled(IDLE_POINTER, true)).toBe(false);
  });

  it("is not settled while the force is still fading", () => {
    expect(isSettled({ x: 0.5, y: 0.5, force: 0.3 }, false)).toBe(false);
  });
});
