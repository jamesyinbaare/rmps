"use client";

import { useCallback, useMemo, useState } from "react";
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { Check, Copy, Loader2 } from "lucide-react";

import { DataTable } from "@/components/data-table";
import {
  DEFAULT_PAGE_SIZE,
  INPUT_FOCUS_RING,
  MAX_CUSTOM_PAGE_SIZE,
  PAGE_SIZE_PRESETS,
} from "@/components/examiners/constants";
import type { RosterTableRow } from "@/components/examiners/types";
import { humanizeRegion } from "@/components/examiners/utils";
import { EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
import { OfficialAccountsPagination } from "@/components/official-accounts-pagination";
import type { ExaminerTypeApi } from "@/lib/api";

type Props = {
  rows: RosterTableRow[];
  loading: boolean;
  busy: boolean;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  rowSelection: RowSelectionState;
  onRowSelectionChange: (selection: RowSelectionState) => void;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: (visibility: VisibilityState) => void;
  pagination: PaginationState;
  onPaginationChange: (pagination: PaginationState) => void;
  showCustomPageSizeInput: boolean;
  customPageSizeInput: string;
  onPageSizeSelectChange: (value: string) => void;
  onCustomPageSizeChange: (value: string) => void;
  onCustomPageSizeBlur: () => void;
  onEdit: (row: RosterTableRow) => void;
  onRemove: (row: RosterTableRow) => void;
  onViewAllocation?: (row: RosterTableRow) => void;
};

export function RosterTable({
  rows,
  loading,
  busy,
  sorting,
  onSortingChange,
  rowSelection,
  onRowSelectionChange,
  columnVisibility,
  onColumnVisibilityChange,
  pagination,
  onPaginationChange,
  showCustomPageSizeInput,
  customPageSizeInput,
  onPageSizeSelectChange,
  onCustomPageSizeChange,
  onCustomPageSizeBlur,
  onEdit,
  onRemove,
  onViewAllocation,
}: Props) {
  const [copyUi, setCopyUi] = useState<Record<string, "copied" | "error">>({});

  const handleCopyPortalLink = useCallback(async (row: RosterTableRow) => {
    if (!row.portal_url) {
      setCopyUi((prev) => ({ ...prev, [row.id]: "error" }));
      return;
    }
    try {
      await navigator.clipboard.writeText(row.portal_url);
      setCopyUi((prev) => ({ ...prev, [row.id]: "copied" }));
      window.setTimeout(() => {
        setCopyUi((prev) => {
          if (prev[row.id] !== "copied") return prev;
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
      }, 2500);
    } catch {
      setCopyUi((prev) => ({ ...prev, [row.id]: "error" }));
    }
  }, []);

  const columns = useMemo<ColumnDef<RosterTableRow>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            className={`size-4 rounded border-border ${INPUT_FOCUS_RING}`}
            checked={table.getIsAllPageRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = table.getIsSomePageRowsSelected();
            }}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            aria-label="Select all rows"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className={`size-4 rounded border-border ${INPUT_FOCUS_RING}`}
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            aria-label={`Select ${row.original.name}`}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span>,
      },
      {
        accessorKey: "phone_number",
        header: "Phone",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{getValue<string | null>() ?? "—"}</span>
        ),
      },
      {
        id: "subject",
        accessorFn: (row) => row.subjectLabel,
        header: "Subject",
        cell: ({ row }) => <span>{row.original.subjectLabel}</span>,
      },
      {
        accessorKey: "examiner_type",
        header: "Role",
        cell: ({ getValue }) => EXAMINER_TYPE_LABELS[getValue<ExaminerTypeApi>()] ?? getValue<string>(),
      },
      {
        accessorKey: "region",
        header: "Region",
        cell: ({ getValue }) => humanizeRegion(getValue<string>()),
      },
      {
        id: "source",
        accessorFn: (row) => row.roster_source,
        header: "Source",
        cell: ({ getValue }) => {
          const source = getValue<"manual" | "invitation">();
          return source === "invitation" ? "Invitation" : "Manual";
        },
      },
      {
        id: "portal",
        header: "Portal link",
        enableSorting: false,
        cell: ({ row }) => {
          const state = copyUi[row.original.id];
          return (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-xs text-primary underline-offset-2 hover:underline disabled:opacity-50"
              disabled={busy || !row.original.portal_url}
              onClick={() => void handleCopyPortalLink(row.original)}
            >
              {state === "copied" ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
              {state === "copied" ? "Copied" : state === "error" ? "Copy failed" : "Copy link"}
            </button>
          );
        },
      },
      {
        id: "group",
        accessorFn: (row) => row.groupLabel ?? "",
        header: "Group",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.groupLabel ?? "—"}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="text-sm text-primary underline-offset-2 hover:underline"
              disabled={busy}
              onClick={() => onEdit(row.original)}
            >
              Edit
            </button>
            <button
              type="button"
              className="text-sm text-destructive underline-offset-2 hover:underline"
              disabled={busy}
              onClick={() => onRemove(row.original)}
            >
              Remove
            </button>
            {onViewAllocation ? (
              <button
                type="button"
                className="text-sm text-primary underline-offset-2 hover:underline"
                disabled={busy || row.original.subject_ids[0] == null}
                onClick={() => onViewAllocation(row.original)}
              >
                View allocation
              </button>
            ) : null}
          </div>
        ),
      },
    ],
    [busy, copyUi, handleCopyPortalLink, onEdit, onRemove, onViewAllocation],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, rowSelection, columnVisibility, pagination },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(next);
    },
    onRowSelectionChange: (updater) => {
      const next = typeof updater === "function" ? updater(rowSelection) : updater;
      onRowSelectionChange(next);
    },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnVisibility) : updater;
      onColumnVisibilityChange(next);
    },
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater(pagination) : updater;
      onPaginationChange(next);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: true,
    getRowId: (row) => row.id,
  });

  if (loading) {
    return (
      <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-hidden />
        Loading roster…
      </div>
    );
  }

  if (rows.length === 0) return null;

  const page = pagination.pageIndex + 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        <DataTable table={table} emptyMessage="No examiners match the filters." striped stickyHeader />
      </div>
      <OfficialAccountsPagination
        page={page}
        pageSize={pagination.pageSize}
        total={rows.length}
        busy={busy}
        recordLabel="examiner"
        pageSizeOptions={[...PAGE_SIZE_PRESETS]}
        showCustomPageSizeInput={showCustomPageSizeInput}
        customPageSizeInput={customPageSizeInput}
        onPageSizeSelectChange={onPageSizeSelectChange}
        onCustomPageSizeChange={onCustomPageSizeChange}
        onCustomPageSizeBlur={onCustomPageSizeBlur}
        maxCustomPageSize={MAX_CUSTOM_PAGE_SIZE}
        onPageChange={(p) => onPaginationChange({ ...pagination, pageIndex: p - 1 })}
        onPageSizeChange={(size) => onPaginationChange({ pageIndex: 0, pageSize: size })}
      />
    </div>
  );
}
