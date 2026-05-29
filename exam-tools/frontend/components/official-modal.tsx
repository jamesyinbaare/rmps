"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type OfficialModalProps = {
  title?: string;
  subtitle?: ReactNode;
  header?: ReactNode;
  titleId: string;
  subtitleId?: string;
  onRequestClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  formError?: string | null;
  scrollRef?: RefObject<HTMLDivElement | null>;
  focusNameOnMount?: boolean;
  initialFocusSelector?: string;
  size?: "default" | "wide";
  /** Keep a stable sheet height on mobile (avoids jump when content shrinks, e.g. filtering). */
  mobileFillHeight?: boolean;
  /** Animate tighter header padding on mobile when custom header compacts. */
  headerCompact?: boolean;
  /** Fixed strip below the header (e.g. search); does not scroll with modal body. */
  toolbar?: ReactNode;
};

export function OfficialModal({
  title,
  subtitle,
  header,
  titleId,
  subtitleId,
  onRequestClose,
  children,
  footer,
  formError,
  scrollRef,
  focusNameOnMount = true,
  initialFocusSelector,
  size = "default",
  mobileFillHeight = false,
  headerCompact = false,
  toolbar,
}: OfficialModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    const dialogEl = dialogRef.current;
    if (!dialogEl) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onRequestClose();
        return;
      }
      if (e.key !== "Tab") return;
      const el = dialogRef.current;
      if (!el) return;
      const nodes = el.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    dialogEl.addEventListener("keydown", onKeyDown);
    return () => dialogEl.removeEventListener("keydown", onKeyDown);
  }, [onRequestClose]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const root = dialogRef.current;
      if (!root) return;
      if (initialFocusSelector) {
        const el = root.querySelector<HTMLElement>(initialFocusSelector);
        if (el) {
          el.focus();
          return;
        }
      }
      if (focusNameOnMount) {
        const el = document.getElementById("eo-name");
        if (el && typeof el.focus === "function") el.focus();
        return;
      }
      const first = root.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [focusNameOnMount, initialFocusSelector]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function update() {
      if (!vv) return;
      setKeyboardInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    }

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  const sheet = (
    <>
      <div className="absolute inset-0 hidden bg-foreground/40 sm:block" aria-hidden />
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-foreground/40 sm:hidden"
        onClick={onRequestClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle || header ? subtitleId : undefined}
        className={cn(
          "relative z-10 flex min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-lg",
          "max-sm:max-h-[min(90dvh,90svh)] sm:max-h-[min(90vh,920px)] sm:rounded-2xl",
          mobileFillHeight && "max-sm:h-[min(90dvh,90svh)]",
          "max-sm:transition-transform max-sm:duration-300 max-sm:ease-out motion-reduce:max-sm:transition-none",
          size === "wide" ? "sm:max-w-3xl" : "sm:max-w-2xl",
        )}
      >
        <div className="shrink-0 overflow-hidden border-b border-border">
          <div
            className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/35 sm:hidden"
            aria-hidden
          />
          <div
            className={cn(
              "flex items-start justify-between gap-3 px-4 pt-3 sm:px-5 sm:pb-4 sm:pt-4",
              "max-sm:transition-[padding-bottom] max-sm:duration-300 max-sm:ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:max-sm:transition-none",
              headerCompact ? "max-sm:pb-2" : "max-sm:pb-4",
            )}
          >
            <div className="min-w-0 flex-1">
              {header ? (
                <div id={titleId}>{header}</div>
              ) : (
                <>
                  <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
                    {title}
                  </h2>
                  {subtitle ? (
                    <div id={subtitleId} className="mt-1 text-sm text-muted-foreground">
                      {subtitle}
                    </div>
                  ) : null}
                </>
              )}
            </div>
            <button
              type="button"
              onClick={onRequestClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30"
              aria-label="Close"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </div>
        {toolbar ? (
          <div
            className={cn(
              "shrink-0 border-b border-border bg-card px-4 sm:px-5",
              "max-sm:transition-[padding] max-sm:duration-300 max-sm:ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:max-sm:transition-none",
              headerCompact ? "max-sm:py-2" : "max-sm:py-3",
              "py-3",
            )}
          >
            {toolbar}
          </div>
        ) : null}
        <div
          ref={scrollRef}
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-5 sm:py-4",
            "max-sm:transition-[padding-top] max-sm:duration-300 max-sm:ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:max-sm:transition-none",
            headerCompact ? "max-sm:pt-2" : "max-sm:pt-4",
            mobileFillHeight && "flex flex-col",
          )}
        >
          {formError ? (
            <p
              role="alert"
              className="sticky top-0 z-10 mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive shadow-sm"
            >
              {formError}
            </p>
          ) : null}
          {children}
        </div>
        <div
          className="shrink-0 border-t border-border bg-card px-4 pt-3 sm:px-5"
          style={{
            paddingBottom: `max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + ${keyboardInset}px))`,
          }}
        >
          {footer}
        </div>
      </div>
    </>
  );

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4 motion-reduce:transition-none">
      {sheet}
    </div>,
    document.body,
  );
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-3 border-0 p-0 md:col-span-2">
      <legend className="text-sm font-semibold text-foreground">{title}</legend>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      <div className="space-y-4 md:grid md:grid-cols-2 md:gap-x-4 md:gap-y-4 md:space-y-0">{children}</div>
    </fieldset>
  );
}

/** Footer layout: Cancel left, primary right on desktop; primary at bottom on mobile. */
export function officialModalFooterClass() {
  return "flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-2";
}
