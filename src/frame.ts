export const FRAME_INTERVAL = 1000 / 60;
const FRAME_TOLERANCE = 1;
export const STALL_FRAME_MS = 100;
const STALL_WINDOW = 12;

export function paceFrame(then: number, now: number): number | null {
  const delta = now - then;
  if (delta < FRAME_INTERVAL - FRAME_TOLERANCE) return null;
  const excess = delta - FRAME_INTERVAL;
  return now - (excess > 0 ? excess % FRAME_INTERVAL : 0);
}

export function createStallWatch(): (now: number) => boolean {
  const gaps: number[] = [];
  let previous: number | null = null;
  return (now) => {
    if (previous !== null) {
      gaps.push(now - previous);
      if (gaps.length > STALL_WINDOW) gaps.shift();
    }
    previous = now;
    if (gaps.length < STALL_WINDOW) return false;
    const sorted = [...gaps].sort((a, b) => a - b);
    return (sorted[STALL_WINDOW >> 1] ?? 0) > STALL_FRAME_MS;
  };
}
