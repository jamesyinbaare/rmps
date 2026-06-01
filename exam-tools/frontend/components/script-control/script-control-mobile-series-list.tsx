"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";

import {
  seriesNavKey,
  seriesNavStatus,
  type SeriesNavItem,
} from "@/components/script-control/script-control-edit-series-nav";
import { getPaperInspectorVisuals, paperEditPanelClass } from "@/lib/paper-inspector-styles";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<ReturnType<typeof seriesNavStatus>, string> = {
  missing: "Missing",
  recorded: "Recorded",
  verified: "Verified",
};

const STATUS_DOT: Record<ReturnType<typeof seriesNavStatus>, string> = {
  missing: "bg-red-500",
  recorded: "bg-amber-500",
  verified: "bg-emerald-500",
};

const STATUS_ORDER: Record<ReturnType<typeof seriesNavStatus>, number> = {
  missing: 0,
  recorded: 1,
  verified: 2,
};

type Props = {
  items: SeriesNavItem[];
  paperNumber: number;
  selectedKey: string | null;
  highlightedKey?: string | null;
  /** Brief success pulse after save (same as highlightedKey). */
  successFlashKey?: string | null;
  onSelect: (paperNumber: number, seriesNumber: number) => void;
};

export function ScriptControlMobileSeriesList({
  items,
  paperNumber,
  selectedKey,
  highlightedKey,
  successFlashKey,
  onSelect,
}: Props) {
  const paperVisuals = getPaperInspectorVisuals(paperNumber);
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const statusDiff =
        STATUS_ORDER[seriesNavStatus(a.slot)] - STATUS_ORDER[seriesNavStatus(b.slot)];
      if (statusDiff !== 0) return statusDiff;
      if (a.paperNumber !== b.paperNumber) return a.paperNumber - b.paperNumber;
      return a.slot.series_number - b.slot.series_number;
    });
  }, [items]);

  if (sortedItems.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        No series on this paper.
      </p>
    );
  }

  return (
    <nav className={cn("rounded-xl", paperEditPanelClass(paperNumber))} aria-label="Series">
      <div className="border-b border-border/80 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Series</p>
          <span className={paperVisuals.badgeClass}>Paper {paperNumber}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">Tap a series to enter counts.</p>
      </div>
      <ul className="divide-y divide-border">
        {sortedItems.map(({ paperNumber, slot }) => {
          const key = seriesNavKey(paperNumber, slot.series_number);
          const status = seriesNavStatus(slot);
          const active = selectedKey === key;
          const highlighted = highlightedKey === key;
          const successFlash = successFlashKey === key;
          const total =
            slot.packing?.no_scripts === true
              ? 0
              : (slot.packing?.envelopes?.reduce((s, e) => s + e.booklet_count, 0) ?? null);

          return (
            <li key={key}>
              <button
                type="button"
                data-series-key={key}
                className={cn(
                  "flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                  successFlash && "animate-pulse bg-emerald-500/15 ring-1 ring-inset ring-emerald-500/30",
                  !successFlash && (active || highlighted)
                    ? "bg-primary/10 ring-1 ring-inset ring-primary/20"
                    : !successFlash && "hover:bg-muted/50 active:bg-muted/70",
                )}
                onClick={() => onSelect(paperNumber, slot.series_number)}
              >
                <span className={cn("size-2.5 shrink-0 rounded-full", STATUS_DOT[status])} aria-hidden />
                {successFlash ? (
                  <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-sm font-semibold">S{slot.series_number}</span>
                  <span className="block text-xs text-muted-foreground">
                    {STATUS_LABEL[status]}
                    {total != null && total > 0 ? ` · ${total} total` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium text-primary">
                  {status === "missing" ? "Add" : "Edit"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
