"use client";

import type { ScriptSeriesSlotResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

export type SeriesNavStatus = "missing" | "recorded" | "verified";

export function seriesNavStatus(slot: ScriptSeriesSlotResponse): SeriesNavStatus {
  if (!slot.packing) return "missing";
  if (slot.packing.no_scripts || slot.verified) return "verified";
  if (slot.packing.envelopes?.length && slot.packing.envelopes.every((e) => e.verified)) return "verified";
  return "recorded";
}

const STATUS_LABEL: Record<SeriesNavStatus, string> = {
  missing: "Missing",
  recorded: "Recorded",
  verified: "Verified",
};

const STATUS_DOT: Record<SeriesNavStatus, string> = {
  missing: "bg-red-500",
  recorded: "bg-amber-500",
  verified: "bg-emerald-500",
};

export type SeriesNavItem = {
  paperNumber: number;
  slot: ScriptSeriesSlotResponse;
};

type Props = {
  items: SeriesNavItem[];
  selectedKey: string | null;
  onSelect: (paperNumber: number, seriesNumber: number) => void;
};

export function seriesNavKey(paperNumber: number, seriesNumber: number): string {
  return `${paperNumber}-${seriesNumber}`;
}

export function ScriptControlEditSeriesNav({ items, selectedKey, onSelect }: Props) {
  return (
    <nav className="rounded-xl border border-border bg-card" aria-label="Series">
      <div className="border-b border-border px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Series</p>
      </div>
      <ul className="max-h-[min(70vh,640px)] overflow-y-auto p-2">
        {items.length === 0 ? (
          <li className="px-2 py-4 text-center text-xs text-muted-foreground">No series on this paper.</li>
        ) : (
          items.map(({ paperNumber, slot }) => {
            const key = seriesNavKey(paperNumber, slot.series_number);
            const status = seriesNavStatus(slot);
            const active = selectedKey === key;
            const total =
              slot.packing?.no_scripts === true
                ? 0
                : (slot.packing?.envelopes?.reduce((s, e) => s + e.booklet_count, 0) ?? null);
            return (
              <li key={key}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-sm transition-colors",
                    active ? "bg-primary/10 font-medium text-foreground ring-1 ring-primary/20" : "hover:bg-muted/60",
                  )}
                  onClick={() => onSelect(paperNumber, slot.series_number)}
                >
                  <span className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[status])} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-sm">S{slot.series_number}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {STATUS_LABEL[status]}
                      {total != null && total > 0 ? ` · ${total}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </nav>
  );
}

export function pickDefaultSeriesKey(items: SeriesNavItem[]): string | null {
  if (items.length === 0) return null;
  const needsWork = items.find(({ slot }) => seriesNavStatus(slot) !== "verified");
  const pick = needsWork ?? items[0];
  return seriesNavKey(pick.paperNumber, pick.slot.series_number);
}
