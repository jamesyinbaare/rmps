"use client";

import { useCallback, useState } from "react";
import { Download, FileSpreadsheet, Landmark, Loader2, type LucideIcon } from "lucide-react";

import type { ExportMenuOption } from "@/components/official-accounts-export-menu";
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

const EXPORT_ICONS: Record<string, LucideIcon> = {
  excel: FileSpreadsheet,
  bog: Landmark,
};

function iconForExport(key: string): LucideIcon {
  return EXPORT_ICONS[key] ?? Download;
}

type Props = {
  options: ExportMenuOption[];
  disabled: boolean;
  disabledReason?: string;
  busyKey: string | null | undefined;
  onExport: (key: string) => void;
  /** e.g. centre-summary */
  sectionLabel?: string;
};

export function ExportFabSpeedDial({
  options,
  disabled,
  disabledReason,
  busyKey,
  onExport,
  sectionLabel = "Export",
}: Props) {
  const [pinned, setPinned] = useState(false);
  const busy = Boolean(busyKey);
  const expanded = pinned;

  const close = useCallback(() => setPinned(false), []);

  const handleMainClick = () => {
    if (disabled || busy) return;
    if (typeof window !== "undefined" && window.matchMedia("(hover: none)").matches) {
      setPinned((open) => !open);
    }
  };

  const handleExport = (key: string) => {
    if (disabled || busy) return;
    onExport(key);
    close();
  };

  if (options.length === 0) return null;

  const optionMenuClass = cn(
    "pointer-events-none absolute top-full left-1/2 z-20 mt-2 flex -translate-x-1/2 flex-col items-center gap-2",
    "opacity-0 motion-safe:-translate-y-1 motion-safe:scale-95 motion-reduce:translate-y-0 motion-reduce:scale-100",
    "transition-[opacity,transform] duration-200 ease-out",
    "group-hover/export:pointer-events-auto group-hover/export:opacity-100",
    "group-hover/export:motion-safe:translate-y-0 group-hover/export:motion-safe:scale-100",
    "group-focus-within/export:pointer-events-auto group-focus-within/export:opacity-100",
    "group-focus-within/export:motion-safe:translate-y-0 group-focus-within/export:motion-safe:scale-100",
    expanded && "pointer-events-auto opacity-100 motion-safe:translate-y-0 motion-safe:scale-100",
  );

  if (options.length === 1) {
    const opt = options[0]!;
    const Icon = iconForExport(opt.key);
    const optionBusy = busyKey === opt.key;
    return (
      <TooltipProvider delayDuration={350} skipDelayDuration={80}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <button
                type="button"
                className={cn(mainFabClass, !disabled && !busy && mainFabEnabledClass)}
                disabled={disabled || busy}
                aria-label={opt.label}
                title={disabled ? disabledReason : opt.label}
                onClick={() => handleExport(opt.key)}
              >
                {optionBusy ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                ) : (
                  <Icon className="size-5" aria-hidden />
                )}
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">{disabled ? disabledReason : opt.label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={350} skipDelayDuration={80}>
      <div
        className={cn("group/export relative inline-flex", expanded && "export-expanded")}
        onMouseLeave={() => {
          if (pinned) close();
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
                aria-label={busy ? "Preparing export…" : sectionLabel}
                title={
                  disabled
                    ? disabledReason
                    : busy
                      ? "Preparing export…"
                      : "Hover or tap for export options"
                }
                onClick={handleMainClick}
              >
                {busy ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                ) : (
                  <Download className="size-5" aria-hidden />
                )}
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            {disabled ? disabledReason : busy ? "Preparing export…" : "Hover or tap for export options"}
          </TooltipContent>
        </Tooltip>

        <div className={optionMenuClass} role="menu" aria-label={`${sectionLabel} formats`}>
          {options.map((opt, index) => {
            const Icon = iconForExport(opt.key);
            const optionBusy = busyKey === opt.key;
            return (
              <Tooltip key={opt.key}>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <button
                      type="button"
                      role="menuitem"
                      className={optionFabClass}
                      style={{ transitionDelay: expanded ? `${index * 40}ms` : undefined }}
                      disabled={disabled || busy}
                      aria-label={opt.label}
                      title={opt.label}
                      onClick={() => handleExport(opt.key)}
                    >
                      {optionBusy ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <Icon className="size-4" aria-hidden />
                      )}
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
