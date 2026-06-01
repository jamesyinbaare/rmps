"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

const DISMISS_THRESHOLD_PX = 100;
const FLICK_OFFSET_PX = 40;
const FLICK_VELOCITY_PX_MS = 0.5;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  /** Pinned below scrollable content; fixed height from panel bottom. */
  footer?: ReactNode;
  ariaDescribedBy?: string;
  /** Ghana brand strip and warm panel tint (executive centre detail). */
  brand?: boolean;
  /** When true, skip auto-focusing the first focusable element on open. */
  disableAutoFocus?: boolean;
};

export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  footer,
  ariaDescribedBy,
  brand = false,
  disableAutoFocus = false,
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    active: false,
    pointerId: -1,
    startClientY: 0,
    startTime: 0,
    lastClientY: 0,
    lastTime: 0,
  });

  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [snapBack, setSnapBack] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!open) {
      setDragOffsetY(0);
      setSnapBack(false);
      setIsDragging(false);
      dragRef.current.active = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open || disableAutoFocus) return;
    const t = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [disableAutoFocus, open]);

  const finishDrag = useCallback(
    (offset: number, velocity: number) => {
      const shouldDismiss =
        offset >= DISMISS_THRESHOLD_PX ||
        (offset >= FLICK_OFFSET_PX && velocity >= FLICK_VELOCITY_PX_MS);

      dragRef.current.active = false;
      setIsDragging(false);

      if (shouldDismiss) {
        setSnapBack(false);
        setDragOffsetY(0);
        onOpenChange(false);
        return;
      }

      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (prefersReducedMotion) {
        setDragOffsetY(0);
        setSnapBack(false);
      } else {
        setSnapBack(true);
        setDragOffsetY(0);
      }
    },
    [onOpenChange],
  );

  const onHandlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const handle = handleRef.current;
    if (!handle) return;

    handle.setPointerCapture(e.pointerId);
    const now = performance.now();
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startClientY: e.clientY,
      startTime: now,
      lastClientY: e.clientY,
      lastTime: now,
    };
    setSnapBack(false);
    setDragOffsetY(0);
    setIsDragging(true);
  }, []);

  const onHandlePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || e.pointerId !== dragRef.current.pointerId) return;
    const offset = Math.max(0, e.clientY - dragRef.current.startClientY);
    dragRef.current.lastClientY = e.clientY;
    dragRef.current.lastTime = performance.now();
    setSnapBack(false);
    setDragOffsetY(offset);
  }, []);

  const onHandlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current.active || e.pointerId !== dragRef.current.pointerId) return;
      const handle = handleRef.current;
      handle?.releasePointerCapture(e.pointerId);

      const now = performance.now();
      const offset = Math.max(0, e.clientY - dragRef.current.startClientY);
      const dtRecent = Math.max(now - dragRef.current.lastTime, 1);
      const dtTotal = Math.max(now - dragRef.current.startTime, 1);
      const velocityRecent = (e.clientY - dragRef.current.lastClientY) / dtRecent;
      const velocityTotal = offset / dtTotal;
      const velocity = Math.max(velocityRecent, velocityTotal);

      finishDrag(offset, velocity);
    },
    [finishDrag],
  );

  const onHandlePointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current.active || e.pointerId !== dragRef.current.pointerId) return;
      const handle = handleRef.current;
      handle?.releasePointerCapture(e.pointerId);
      const offset = Math.max(0, dragRef.current.lastClientY - dragRef.current.startClientY);
      finishDrag(offset, 0);
    },
    [finishDrag],
  );

  if (!open) return null;

  const panelHeight = panelRef.current?.offsetHeight ?? 400;
  const backdropOpacity = Math.max(0.15, 0.4 * (1 - Math.min(dragOffsetY / panelHeight, 1)));
  const dragging = isDragging || dragOffsetY > 0;

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 z-[100] bg-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-reduce:animate-none"
        style={{
          opacity: dragging ? backdropOpacity : 0.4,
        }}
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={ariaDescribedBy}
        className={cn(
          "fixed inset-x-0 bottom-0 z-[110] flex max-h-[min(90dvh,100%)] min-h-0 flex-col overflow-hidden rounded-t-2xl shadow-2xl",
          "lg:inset-x-auto lg:inset-y-0 lg:right-0 lg:left-auto lg:bottom-auto lg:top-0 lg:h-full lg:max-h-none lg:w-full lg:max-w-2xl lg:rounded-t-none lg:rounded-l-2xl",
          !dragging &&
            "motion-safe:animate-in motion-safe:duration-300 motion-reduce:animate-none max-lg:motion-safe:slide-in-from-bottom lg:motion-safe:slide-in-from-right",
          snapBack && "motion-safe:transition-transform motion-safe:duration-200 motion-reduce:transition-none",
          brand
            ? "border-t-2 border-primary/35 bg-linear-to-b from-card via-background to-background shadow-primary/15 lg:border-t-0 lg:border-l-2"
            : "border-t border-border bg-background lg:border-t-0 lg:border-l",
        )}
        style={{
          transform: dragOffsetY > 0 ? `translateY(${dragOffsetY}px)` : undefined,
        }}
      >
        <p id={titleId} className="sr-only">
          {title}
        </p>
        {brand ? (
          <div
            className="h-1 shrink-0 bg-linear-to-r from-primary via-secondary to-success"
            aria-hidden
          />
        ) : null}
        <div
          ref={handleRef}
          role="button"
          tabIndex={-1}
          aria-label="Drag down to close"
          className={cn(
            "flex shrink-0 touch-none cursor-grab flex-col items-center py-3 active:cursor-grabbing lg:hidden",
          )}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerCancel}
        >
          <div
            className={cn(
              "h-1 w-10 rounded-full",
              brand ? "bg-primary/35" : "bg-muted-foreground/30",
            )}
            aria-hidden
          />
        </div>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1 lg:pt-4",
            footer ? "pb-4" : "pb-[max(1rem,env(safe-area-inset-bottom))] lg:pb-4",
          )}
        >
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-primary/15 bg-background shadow-[0_-6px_16px_rgba(0,0,0,0.06)]">
            <div className="flex h-[5.5rem] items-center px-4">{footer}</div>
            <div className="h-[env(safe-area-inset-bottom,0px)] shrink-0" aria-hidden />
          </div>
        ) : null}
      </div>
    </>
  );
}
