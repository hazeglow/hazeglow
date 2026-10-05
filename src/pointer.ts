export interface PointerState {
  x: number;
  y: number;
  force: number;
}

export interface PointerTarget {
  x: number;
  y: number;
  inside: boolean;
}

export const IDLE_POINTER: PointerState = { x: 0.5, y: 0.5, force: 0 };

const FOLLOW_RATE = 10;
const FORCE_RATE = 6;
const REST = 0.002;
const SETTLE = 0.001;

export function approach(current: number, target: number, elapsed: number, rate: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * elapsed));
}

export function stepPointer(state: PointerState, target: PointerTarget, elapsed: number): PointerState {
  if (!target.inside) {
    const force = approach(state.force, 0, elapsed, FORCE_RATE);
    return { x: state.x, y: state.y, force: force < REST ? 0 : force };
  }
  const arriving = state.force === 0;
  return {
    x: arriving ? target.x : approach(state.x, target.x, elapsed, FOLLOW_RATE),
    y: arriving ? target.y : approach(state.y, target.y, elapsed, FOLLOW_RATE),
    force: approach(state.force, 1, elapsed, FORCE_RATE),
  };
}

export function isSettled(state: PointerState, target: boolean | PointerTarget): boolean {
  if (typeof target === "boolean") return !target && state.force === 0;
  if (!target.inside) return state.force === 0;
  return 1 - state.force < REST && Math.abs(state.x - target.x) < SETTLE && Math.abs(state.y - target.y) < SETTLE;
}
