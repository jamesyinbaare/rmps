"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Info, Minus, Plus, X } from "lucide-react";

import { DataTable, type DataTableColumnMeta } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ScriptControlAdminRow, ScriptControlSchoolOverallStatus } from "@/lib/api";
import { packingItemNounForCount } from "@/lib/script-packing-terms";
import { cn } from "@/lib/utils";

export const SCRIPT_CONTROL_VIEW_PAGE_SIZES = [50, 100, 200, 250, 500] as const;

export type ScriptControlViewRow = {
  school_id: string;
  school_code: string;
  school_name: string;
  region: string;
  zone: string;
  registered_candidates: number;
  expected_series: number;
  recorded_series: number;
  verified_series: number;
  total_booklets: number;
  overall_status: ScriptControlSchoolOverallStatus;
  bySeries: Record<number, ScriptControlAdminRow>;
};

export const STATUS_BADGE: Record<ScriptControlSchoolOverallStatus, string> = {
  missing: "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-100",
  partial: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100",
  complete: "bg-blue-100 text-blue-900 dark:bg-blue-950/50 dark:text-blue-100",
  verified: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100",
};

export function seriesBlockTotal(block: ScriptControlAdminRow | undefined): number {
  if (!block) return 0;
  if (block.no_scripts) return 0;
  const envs = block.envelopes ?? [];
  if (envs.length === 0) return 0;
  return block.total_booklets ?? envs.reduce((acc, e) => acc + e.booklet_count, 0);
}

const TABLE_META = {
  expand: {
    headerClassName: "border-border w-10 border-r bg-background px-1 py-3",
    cellClassName: "border-border w-10 border-r bg-background px-1 py-2 align-middle",
    footerClassName: "border-border w-10 border-r bg-background px-1 py-3",
  },
  school: {
    headerClassName: "border-border bg-muted/80 text-left font-semibold dark:bg-muted/50 border-r px-3 py-3",
    cellClassName: "border-border bg-muted/60 dark:bg-muted/40 border-r px-3 py-2",
    footerClassName: "border-border bg-muted/80 text-muted-foreground dark:bg-muted/50 border-r px-3 py-3 text-xs",
  },
  status: {
    headerClassName: "border-border bg-muted/50 text-left text-xs font-semibold dark:bg-muted/35 border-r px-3 py-3",
    cellClassName: "border-border bg-muted/40 dark:bg-muted/30 border-r px-3 py-2",
    footerClassName: "border-border bg-muted/50 dark:bg-muted/35 border-r px-3 py-3",
  },
  progress: {
    headerClassName: "border-border bg-muted/50 text-right text-xs font-semibold dark:bg-muted/35 border-r px-3 py-3",
    cellClassName: "border-border bg-muted/40 border-r px-3 py-2 text-right dark:bg-muted/30",
    footerClassName: "border-border bg-muted/50 dark:bg-muted/35 border-r px-3 py-3",
  },
  seriesA: {
    headerClassName: "border-border border-r bg-muted/70 px-2 py-3 text-right text-xs font-semibold dark:bg-muted/45",
    cellClassName: "border-border border-r bg-muted/60 min-w-0 max-w-30 align-top px-2 py-2 text-right dark:bg-muted/38",
    footerClassName: "border-border border-r bg-muted/70 px-2 py-3 text-right text-sm font-medium tabular-nums dark:bg-muted/45",
  },
  seriesB: {
    headerClassName: "border-border border-r bg-muted/50 px-2 py-3 text-right text-xs font-semibold dark:bg-muted/32",
    cellClassName: "border-border border-r bg-muted/40 min-w-0 max-w-30 align-top px-2 py-2 text-right dark:bg-muted/28",
    footerClassName: "border-border border-r bg-muted/50 px-2 py-3 text-right text-sm font-medium tabular-nums dark:bg-muted/32",
  },
  total: {
    headerClassName: "border-border border-r bg-slate-100/95 px-3 py-3 text-right font-semibold dark:bg-slate-900/55",
    cellClassName: "border-border border-r bg-slate-50/90 px-3 py-2 text-right dark:bg-slate-950/40",
    footerClassName: "border-border border-r bg-slate-100/95 px-3 py-3 text-right font-semibold tabular-nums dark:bg-slate-900/55",
  },
  registered: {
    headerClassName: "border-border border-r bg-emerald-50/85 px-3 py-3 text-right font-semibold dark:bg-emerald-950/35",
    cellClassName: "border-border border-r bg-emerald-50/55 px-3 py-2 text-right dark:bg-emerald-950/28",
    footerClassName: "border-border border-r bg-emerald-50/85 px-3 py-3 text-right font-semibold tabular-nums dark:bg-emerald-950/35",
  },
  actions: {
    headerClassName: "bg-background px-2 py-3 text-left text-xs font-semibold",
    cellClassName: "bg-background px-2 py-2",
    footerClassName: "bg-background px-2 py-3",
  },
} satisfies Record<string, DataTableColumnMeta>;

function SeriesCell({
  block,
  paperNumber,
  expanded,
}: {
  block: ScriptControlAdminRow | undefined;
  paperNumber: number;
  expanded: boolean;
}) {
  if (block?.no_scripts) {
    return (
      <span className="text-sm font-medium tabular-nums text-muted-foreground" title="No scripts">
        NS
      </span>
    );
  }
  if (!block?.envelopes?.length) {
    return <span className="text-muted-foreground">—</span>;
  }
  const total = seriesBlockTotal(block);
  if (!expanded) {
    return <span className="tabular-nums text-sm font-medium">{total}</span>;
  }
  return (
    <ul className="max-h-52 space-y-2 overflow-y-auto border-l border-border/80 pl-2 text-left text-xs">
      {block.envelopes.map((e) => (
        <li key={e.envelope_number}>
          <span className="text-muted-foreground">
            Env {e.envelope_number}: {e.booklet_count} {packingItemNounForCount(e.booklet_count, paperNumber)}
          </span>
          {e.verified ? (
            <Badge variant="secondary" className="ml-1 text-[10px]">
              OK
            </Badge>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function RowDetailDrawer({
  row,
  paperNumber,
  maxSeries,
  onClose,
}: {
  row: ScriptControlViewRow;
  paperNumber: number;
  maxSeries: number;
  onClose: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm font-semibold">{row.school_code}</p>
          <p className="text-xs text-muted-foreground">{row.school_name}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" onClick={onClose}>
          <X className="size-4" />
          <span className="sr-only">Close details</span>
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: maxSeries }, (_, i) => i + 1).map((sn) => {
          const block = row.bySeries[sn];
          return (
            <div key={sn} className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Series {sn}</p>
              <SeriesCell block={block} paperNumber={paperNumber} expanded />
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Props = {
  rows: ScriptControlViewRow[];
  maxSeries: number;
  paperNumber: number;
  totalHeader: string;
  showSeriesColumns: boolean;
  loading: boolean;
  emptyMessage: string;
  editHrefForSchool: (schoolId: string) => string;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

export function ScriptControlViewTable({
  rows,
  maxSeries,
  paperNumber,
  totalHeader,
  showSeriesColumns,
  loading,
  emptyMessage,
  editHrefForSchool,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const [detailRowId, setDetailRowId] = useState<string | null>(null);

  const detailRow = detailRowId ? rows.find((r) => r.school_id === detailRowId) : null;

  const columns = useMemo<ColumnDef<ScriptControlViewRow>[]>(() => {
    const cols: ColumnDef<ScriptControlViewRow>[] = [];

    if (showSeriesColumns) {
      cols.push({
        id: "expand",
        enableSorting: false,
        header: () => <span className="sr-only">Expand</span>,
        meta: TABLE_META.expand,
        cell: ({ row }) => {
          const r = row.original;
          const hasEnv = Object.values(r.bySeries).some((b) => b?.envelopes?.length);
          if (!hasEnv) return <span className="inline-block w-8" aria-hidden />;
          const key = r.school_id;
          const open = expandedRows.has(key);
          return (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() =>
                setExpandedRows((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
            >
              {open ? <Minus className="size-4" /> : <Plus className="size-4" />}
            </Button>
          );
        },
        footer: () => null,
      });
    } else {
      cols.push({
        id: "detail",
        enableSorting: false,
        header: () => <span className="sr-only">Details</span>,
        meta: TABLE_META.expand,
        cell: ({ row }) => {
          const r = row.original;
          const hasData = Object.values(r.bySeries).some((b) => b?.envelopes?.length || b?.no_scripts);
          if (!hasData) return <span className="inline-block w-8" aria-hidden />;
          return (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setDetailRowId((cur) => (cur === r.school_id ? null : r.school_id))}
            >
              <Info className="size-4" />
              <span className="sr-only">View envelope details</span>
            </Button>
          );
        },
        footer: () => null,
      });
    }

    cols.push(
      {
        id: "school_code",
        accessorFn: (r) => r.school_code,
        header: "School",
        meta: TABLE_META.school,
        cell: ({ row }) => (
          <Link
            href={editHrefForSchool(row.original.school_id)}
            className="font-mono text-sm font-medium hover:underline"
            title={row.original.school_name}
          >
            {row.original.school_code}
          </Link>
        ),
        footer: () => <span className="font-medium">Totals</span>,
      },
      {
        id: "status",
        accessorFn: (r) => r.overall_status,
        header: "Status",
        meta: TABLE_META.status,
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize",
              STATUS_BADGE[row.original.overall_status],
            )}
          >
            {row.original.overall_status}
          </span>
        ),
        footer: () => null,
      },
    );

    if (!showSeriesColumns) {
      cols.push({
        id: "progress",
        accessorFn: (r) => r.recorded_series,
        header: "Progress",
        meta: TABLE_META.progress,
        cell: ({ row }) => (
          <span className="tabular-nums text-sm">
            {row.original.recorded_series}/{row.original.expected_series} series
          </span>
        ),
        footer: () => null,
      });
    }

    if (showSeriesColumns) {
      for (let sn = 1; sn <= maxSeries; sn++) {
        const meta = sn % 2 === 1 ? TABLE_META.seriesA : TABLE_META.seriesB;
        cols.push({
          id: `s${sn}`,
          accessorFn: (r) => seriesBlockTotal(r.bySeries[sn]),
          header: () => `S${sn}`,
          meta,
          cell: ({ row }) => (
            <SeriesCell
              block={row.original.bySeries[sn]}
              paperNumber={paperNumber}
              expanded={expandedRows.has(row.original.school_id)}
            />
          ),
          footer: () => {
            let sum = 0;
            for (const r of rows) sum += seriesBlockTotal(r.bySeries[sn]);
            return <span className="tabular-nums">{sum}</span>;
          },
        });
      }
    }

    cols.push(
      {
        id: "total",
        accessorFn: (r) => r.total_booklets,
        header: totalHeader,
        meta: TABLE_META.total,
        cell: ({ row }) => <span className="tabular-nums font-semibold">{row.original.total_booklets}</span>,
        footer: () => (
          <span className="tabular-nums font-semibold">{rows.reduce((s, r) => s + r.total_booklets, 0)}</span>
        ),
      },
      {
        id: "registered",
        accessorFn: (r) => r.registered_candidates,
        header: "Registered",
        meta: TABLE_META.registered,
        cell: ({ row }) => (
          <span className="tabular-nums font-semibold">{row.original.registered_candidates}</span>
        ),
        footer: () => (
          <span className="tabular-nums font-semibold">
            {rows.reduce((s, r) => s + r.registered_candidates, 0)}
          </span>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        header: "",
        meta: TABLE_META.actions,
        cell: ({ row }) => (
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={editHrefForSchool(row.original.school_id)}>Edit</Link>
          </Button>
        ),
        footer: () => null,
      },
    );

    return cols;
  }, [editHrefForSchool, expandedRows, maxSeries, paperNumber, rows, showSeriesColumns, totalHeader]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, total);

  return (
    <div className="space-y-3">
      {total > 0 ? (
        <p className="text-sm text-muted-foreground">
          Showing {pageStart}–{pageEnd} of {total}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <DataTable table={table} emptyMessage={loading ? "Loading…" : emptyMessage} showFooter={rows.length > 0} />
      </div>
      {detailRow ? (
        <RowDetailDrawer
          row={detailRow}
          paperNumber={paperNumber}
          maxSeries={maxSeries}
          onClose={() => setDetailRowId(null)}
        />
      ) : null}
      {total > pageSize ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)}>
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page * pageSize >= total || loading}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
          <select
            className="h-9 rounded-md border border-input-border bg-background px-2 text-sm"
            value={String(pageSize)}
            onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
          >
            {SCRIPT_CONTROL_VIEW_PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} per page
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
