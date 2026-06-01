import type { SeriesNavItem } from "@/components/script-control/script-control-edit-series-nav";
import { seriesNavKey, seriesNavStatus } from "@/components/script-control/script-control-edit-series-nav";

export function findNextSeriesKey(items: SeriesNavItem[], currentKey: string | null): string | null {
  if (items.length === 0) return null;

  const needsWork = (item: SeriesNavItem) => {
    const status = seriesNavStatus(item.slot);
    return status === "missing" || status === "recorded";
  };

  const ordered = [...items].sort((a, b) => {
    if (a.paperNumber !== b.paperNumber) return a.paperNumber - b.paperNumber;
    return a.slot.series_number - b.slot.series_number;
  });

  const workItems = ordered.filter(needsWork);
  if (workItems.length === 0) return null;

  if (currentKey) {
    const idx = ordered.findIndex(
      (it) => seriesNavKey(it.paperNumber, it.slot.series_number) === currentKey,
    );
    if (idx >= 0) {
      for (let i = idx + 1; i < ordered.length; i++) {
        if (needsWork(ordered[i])) {
          const it = ordered[i];
          return seriesNavKey(it.paperNumber, it.slot.series_number);
        }
      }
    }
  }

  const first = workItems[0];
  return seriesNavKey(first.paperNumber, first.slot.series_number);
}
