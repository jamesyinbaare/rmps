import type { ColumnDef } from "@tanstack/react-table";

import type { DataTableColumnMeta } from "@/components/data-table";
import type { InspectorAnalysisTableRow } from "@/lib/inspector-analysis-report";
import { cn } from "@/lib/utils";

const STICKY_LEFT =
  "sticky left-0 min-w-[12rem] max-w-[20rem] border-r-2 border-border shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]";

/** Group header row — centre band pinned on horizontal scroll. */
export const inspectorStickyCentreGroupHeaderMeta: DataTableColumnMeta = {
  headerClassName: cn(
    STICKY_LEFT,
    "z-50 bg-muted px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground dark:bg-muted",
  ),
  stickyOpaque: true,
};

/** Leaf header + body — centre column pinned on horizontal scroll. */
export const inspectorStickyCentreLeafHeaderMeta: DataTableColumnMeta = {
  sortAriaLabel: "Sort by centre",
  headerClassName: cn(STICKY_LEFT, "z-50 bg-muted text-foreground dark:bg-muted"),
  cellClassName: cn(STICKY_LEFT, "z-20 whitespace-normal text-foreground"),
  stickyOpaque: true,
};

/** @deprecated Use inspectorStickyCentreLeafHeaderMeta */
export const inspectorStickyCentreColumnMeta = inspectorStickyCentreLeafHeaderMeta;

export const inspectorColumnGroupHeaderMeta: DataTableColumnMeta = {
  headerClassName:
    "bg-muted/40 px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
};

export function inspectorColumnGroup(
  id: string,
  label: string,
  columns: ColumnDef<InspectorAnalysisTableRow>[],
  groupHeaderMeta: DataTableColumnMeta = inspectorColumnGroupHeaderMeta,
): ColumnDef<InspectorAnalysisTableRow> {
  return {
    id: `${id}-group`,
    header: label,
    meta: groupHeaderMeta,
    columns,
  };
}
