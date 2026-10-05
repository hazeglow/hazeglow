export const FRAME_INTERVAL = 1000 / 60;
const FRAME_TOLERANCE = 1;

export function paceFrame(then: number, now: number): number | null {
  const delta = now - then;
  if (delta < FRAME_INTERVAL - FRAME_TOLERANCE) return null;
  const excess = delta - FRAME_INTERVAL;
  return now - (excess > 0 ? excess % FRAME_INTERVAL : 0);
}
