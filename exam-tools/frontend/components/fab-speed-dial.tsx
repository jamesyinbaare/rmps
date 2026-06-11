"use client";

import { useCallback, useState, type ComponentType, type CSSProperties } from "react";
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

const mainFabHint = "Tap for more actions";

const optionItemClass =
  "inline-flex transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none";

function optionItemStyle(index: number, menuOpen: boolean): CSSProperties {
  const delayMs = menuOpen ? index * 50 : 0;
  return {
    transitionDelay: `${delayMs}ms`,
    opacity: menuOpen ? 1 : 0,
    transform: menuOpen ? "translateY(0) scale(1)" : "translateY(0.5rem) scale(0.85)",
  };
}

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
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const expanded = pinned;
  const menuOpen = hovered || expanded;

  const close = useCallback(() => setPinned(false), []);

  const handleMainClick = () => {
    if (disabled || busy) return;
    if (options.length === 1) {
      const opt = options[0];
      if (opt && !opt.disabled) onSelect(opt.key);
      return;
    }
    if (typeof window !== "undefined" && window.matchMedia("(hover: none)").matches) {
      setPinned((open) => !open);
    }
  };

  const handleSelect = (key: string, optionDisabled?: boolean) => {
    if (disabled || busy || optionDisabled) return;
    onSelect(key);
    close();
  };

  if (options.length === 0) return null;

  const optionMenuClass = cn(
    "pointer-events-none absolute top-full left-1/2 z-30 mt-2 flex -translate-x-1/2 flex-col items-center gap-2",
    menuOpen && "pointer-events-auto",
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
        className={cn("group/fab relative inline-flex", expanded && "fab-expanded")}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          if (pinned) close();
        }}
        onFocus={() => setHovered(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHovered(false);
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <button
                type="button"
                className={cn(mainFabClass, !disabled && !busy && mainFabEnabledClass)}
                disabled={disabled || busy}
                aria-expanded={expanded}
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
                  <span
                    className={optionItemClass}
                    style={optionItemStyle(index, menuOpen)}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className={optionFabClass}
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
