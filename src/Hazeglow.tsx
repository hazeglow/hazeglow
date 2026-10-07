"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  IDLE_POINTER,
  createRenderer,
  isSettled,
  stepPointer,
  type GradientConfig,
  type PointerState,
  type PointerTarget,
  type Renderer,
} from "./core";
import { createStallWatch, paceFrame } from "./frame";
import { MAX_RESTORES } from "./renderer";

export interface HazeglowHandle {
  getTime(): number;
}

export interface HazeglowProps {
  config: GradientConfig;
  className?: string;
  style?: CSSProperties;
  onUnsupported?(): void;
}

const MAX_PIXEL_RATIO = 2;
const MAX_FRAME_SECONDS = 0.1;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const FILL: CSSProperties = { display: "block", width: "100%", height: "100%" };
const FILL_REACTIVE: CSSProperties = { ...FILL, touchAction: "pan-y" };

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

export const Hazeglow = forwardRef<HazeglowHandle, HazeglowProps>(function Hazeglow(
  { config, className, style, onUnsupported },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const configRef = useRef(config);
  const timeRef = useRef(0);
  const pointerRef = useRef<PointerState>(IDLE_POINTER);
  const targetRef = useRef<PointerTarget>({ x: 0.5, y: 0.5, inside: false });
  const unsupportedRef = useRef(onUnsupported);
  const engagedRef = useRef(false);
  const [visible, setVisible] = useState(true);
  const [engaged, setEngaged] = useState(false);
  const [stalled, setStalled] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useImperativeHandle(ref, () => ({ getTime: () => timeRef.current }), []);

  const engage = useCallback((next: boolean) => {
    if (engagedRef.current === next) return;
    engagedRef.current = next;
    setEngaged(next);
  }, []);

  useEffect(() => {
    unsupportedRef.current = onUnsupported;
  }, [onUnsupported]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createRenderer(canvas);
    if (!renderer) {
      unsupportedRef.current?.();
      return;
    }
    rendererRef.current = renderer;

    const resizeObserver = new ResizeObserver(() => {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      renderer.resize(canvas.clientWidth * ratio, canvas.clientHeight * ratio);
      renderer.render(configRef.current, timeRef.current, pointerRef.current);
    });
    resizeObserver.observe(canvas);

    const intersectionObserver = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setVisible(entry.isIntersecting);
    });
    intersectionObserver.observe(canvas);

    let losses = 0;
    const onContextLost = () => {
      losses += 1;
      if (losses > MAX_RESTORES) {
        setStalled(true);
        unsupportedRef.current?.();
      }
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    return () => {
      canvas.removeEventListener("webglcontextlost", onContextLost);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    configRef.current = config;
    rendererRef.current?.render(config, timeRef.current, pointerRef.current);
  }, [config]);

  const moving = config.motion !== "none" && !reducedMotion;
  const reactive = config.hover > 0 && !reducedMotion;
  const running = visible && !stalled && (moving || (reactive && engaged));

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let previous = performance.now();
    let paced = previous;
    const stall = createStallWatch();
    const tick = (now: number) => {
      if (stall(now)) {
        console.warn("[hazeglow] stopped animating: frames took longer than 100 ms, so this device draws a still frame instead.");
        setStalled(true);
        return;
      }
      frame = requestAnimationFrame(tick);
      const next = paceFrame(paced, now);
      if (next === null) return;
      paced = next;
      const elapsed = Math.min((now - previous) / 1000, MAX_FRAME_SECONDS);
      previous = now;
      if (moving) timeRef.current += elapsed * configRef.current.speed;
      const target = reactive ? targetRef.current : { ...targetRef.current, inside: false };
      pointerRef.current = stepPointer(pointerRef.current, target, elapsed);
      rendererRef.current?.render(configRef.current, timeRef.current, pointerRef.current);
      if (isSettled(pointerRef.current, target)) engage(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, moving, reactive, engage]);

  const follow = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!reactive) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    targetRef.current = {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
      inside: true,
    };
    engage(true);
  };

  const release = () => {
    targetRef.current = { ...targetRef.current, inside: false };
    if (reactive) engage(true);
  };

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      onPointerEnter={follow}
      onPointerMove={follow}
      onPointerDown={follow}
      onPointerLeave={release}
      onPointerCancel={release}
      onPointerUp={(event) => {
        if (event.pointerType !== "mouse") release();
      }}
      className={className}
      style={{ ...(reactive ? FILL_REACTIVE : FILL), ...style }}
    />
  );
});
