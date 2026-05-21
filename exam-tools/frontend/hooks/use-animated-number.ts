"use client";

import { useEffect, useRef, useState } from "react";

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const DEFAULT_DURATION_MS = 900;

/**
 * Counts from the previous value to `target` over a short ease-out (skipped when reduced motion).
 */
export function useAnimatedNumber(
  target: number,
  options?: { durationMs?: number; delayMs?: number },
): number {
  const durationMs = options?.durationMs ?? DEFAULT_DURATION_MS;
  const delayMs = options?.delayMs ?? 0;
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);
  displayRef.current = display;

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(target);
      return;
    }

    const from = displayRef.current;
    if (from === target) return;

    let raf = 0;
    let delayTimer: ReturnType<typeof setTimeout> | undefined;
    let start = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durationMs);
      const next = Math.round(from + (target - from) * easeOutCubic(progress));
      setDisplay(next);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(target);
      }
    };

    const begin = () => {
      start = performance.now();
      raf = requestAnimationFrame(tick);
    };

    if (delayMs > 0) {
      delayTimer = setTimeout(begin, delayMs);
    } else {
      begin();
    }

    return () => {
      if (delayTimer != null) clearTimeout(delayTimer);
      cancelAnimationFrame(raf);
    };
  }, [target, durationMs, delayMs]);

  return display;
}
