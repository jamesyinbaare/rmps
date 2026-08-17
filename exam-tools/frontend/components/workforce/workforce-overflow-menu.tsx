"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export const workforceMenuItemClass =
  "block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

type Props = {
  label: ReactNode;
  ariaLabel: string;
  disabled?: boolean;
  align?: "start" | "end";
  children: (close: () => void) => ReactNode;
};

export function WorkforceOverflowMenu({
  label,
  ariaLabel,
  disabled = false,
  align = "end",
  children,
}: Props) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  function updatePosition() {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = menu?.offsetWidth ?? 176;
    const menuHeight = menu?.offsetHeight ?? 0;
    const gap = 4;
    const viewportPad = 8;
    let left = align === "end" ? rect.right - menuWidth : rect.left;
    left = Math.min(Math.max(viewportPad, left), window.innerWidth - menuWidth - viewportPad);
    let top = rect.bottom + gap;
    if (top + menuHeight > window.innerHeight - viewportPad && rect.top - gap - menuHeight > viewportPad) {
      top = rect.top - gap - menuHeight;
    }
    setPos({ top, left });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [align, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onReposition() {
      updatePosition();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        className={cn(
          "inline-flex min-h-9 items-center gap-1 rounded-lg border border-input-border bg-background px-2.5 text-sm font-medium shadow-sm hover:bg-muted disabled:opacity-50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <ChevronDown className={cn("size-4 shrink-0 opacity-60", open && "rotate-180")} aria-hidden />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={ariaLabel}
              className="fixed z-[250] min-w-44 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
              style={{ top: pos.top, left: pos.left }}
            >
              {children(() => setOpen(false))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
