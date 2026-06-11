"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Loader2 } from "lucide-react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const fabClass = cn(
  "inline-flex size-11 items-center justify-center rounded-full border shadow-md",
  "transition-[transform,box-shadow,background-color,color,border-color,opacity] duration-200 ease-out",
  "motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg",
  "active:scale-[0.97] motion-reduce:active:scale-100",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
  "disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-40 disabled:shadow-sm",
);

const optionFabClass = cn(
  fabClass,
  "size-10 border-border bg-card text-foreground hover:border-secondary/50 hover:bg-secondary hover:text-secondary-foreground",
);

const mainFabClass = cn(
  fabClass,
  "border-secondary/40 bg-secondary text-secondary-foreground shadow-lg hover:brightness-95 dark:hover:brightness-105",
);

const mainFabEnabledClass = "ring-1 ring-secondary/40 motion-safe:hover:shadow-xl";

const mainFabHint = "Click for more actions";

export type FabSpeedDialOption = {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  disabled?: boolean;
};

type Props = {
  options: FabSpeedDialOption[];
  disabled?: boolean;
  disabledReason?: string;
  busy?: boolean;
  onSelect: (key: string) => void;
  mainIcon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  sectionLabel?: string;
};

export function FabSpeedDial({
  options,
  disabled = false,
  disabledReason,
  busy = false,
  onSelect,
  mainIcon: MainIcon,
  sectionLabel = "Actions",
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const handleMainClick = () => {
    if (disabled || busy) return;
    if (options.length === 1) {
      const opt = options[0];
      if (opt && !opt.disabled) onSelect(opt.key);
      return;
    }
    setOpen((value) => !value);
  };

  const handleSelect = (key: string, optionDisabled?: boolean) => {
    if (disabled || busy || optionDisabled) return;
    onSelect(key);
    close();
  };

  if (options.length === 0) return null;

  const optionMenuClass = cn(
    "pointer-events-none absolute top-full left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2 pt-2",
    "opacity-0 motion-safe:translate-y-1 motion-safe:scale-95 motion-reduce:translate-y-0 motion-reduce:scale-100",
    "transition-[opacity,transform] duration-200 ease-out",
    "group-hover/fab:pointer-events-auto group-hover/fab:opacity-100",
    "group-hover/fab:motion-safe:translate-y-0 group-hover/fab:motion-safe:scale-100",
    "group-focus-within/fab:pointer-events-auto group-focus-within/fab:opacity-100",
    "group-focus-within/fab:motion-safe:translate-y-0 group-focus-within/fab:motion-safe:scale-100",
    open && "pointer-events-auto opacity-100 motion-safe:translate-y-0 motion-safe:scale-100",
  );

  if (options.length === 1) {
    const opt = options[0]!;
    const Icon = opt.icon;
    const optionDisabled = disabled || busy || opt.disabled;
    return (
      <TooltipProvider delayDuration={350} skipDelayDuration={80}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <button
                type="button"
                className={cn(mainFabClass, !optionDisabled && mainFabEnabledClass)}
                disabled={optionDisabled}
                aria-label={opt.label}
                title={optionDisabled ? disabledReason : opt.label}
                onClick={() => handleSelect(opt.key, opt.disabled)}
              >
                {busy ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                ) : (
                  <Icon className="size-5" aria-hidden />
                )}
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">{optionDisabled ? disabledReason : opt.label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={350} skipDelayDuration={80}>
      <div
        ref={rootRef}
        className={cn("group/fab relative inline-flex", open && "fab-open")}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <button
                type="button"
                className={cn(mainFabClass, !disabled && !busy && mainFabEnabledClass)}
                disabled={disabled || busy}
                aria-expanded={open}
                aria-haspopup="menu"
                aria-label={busy ? "Working…" : sectionLabel}
                title={
                  disabled
                    ? disabledReason
                    : busy
                      ? "Working…"
                      : mainFabHint
                }
                onClick={handleMainClick}
              >
                {busy ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                ) : (
                  <MainIcon className="size-5" aria-hidden />
                )}
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            {disabled ? disabledReason : busy ? "Working…" : mainFabHint}
          </TooltipContent>
        </Tooltip>

        <div className={optionMenuClass} role="menu" aria-label={sectionLabel}>
          {options.map((opt, index) => {
            const Icon = opt.icon;
            const optionDisabled = disabled || busy || opt.disabled;
            return (
              <Tooltip key={opt.key}>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <button
                      type="button"
                      role="menuitem"
                      className={optionFabClass}
                      style={{ transitionDelay: open ? `${index * 50}ms` : undefined }}
                      disabled={optionDisabled}
                      aria-label={opt.label}
                      title={opt.label}
                      onClick={() => handleSelect(opt.key, opt.disabled)}
                    >
                      <Icon className="size-4" aria-hidden />
                    </button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="font-medium">
                  {opt.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
