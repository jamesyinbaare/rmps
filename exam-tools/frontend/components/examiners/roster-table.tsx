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
import { Loader2 } from "lucide-react";


import { DataTable } from "@/components/data-table";
import {
  DEFAULT_PAGE_SIZE,
  EXAMINERS_TABLE_INNER_SCROLL_CLASS,
  EXAMINERS_TABLE_SCROLL_CONTAINER_CLASS,
  INPUT_FOCUS_RING,
  MAX_CUSTOM_PAGE_SIZE,
  PAGE_SIZE_PRESETS,
} from "@/components/examiners/constants";
import { RosterRowActionsMenu } from "@/components/examiners/roster-row-actions-menu";
import { PhoneLink } from "@/components/examiners/phone-link";
import type { RosterTableRow } from "@/components/examiners/types";
import { humanizeRegion } from "@/components/examiners/utils";
import { EXAMINER_TYPE_ABBREVIATIONS, EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
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
  canEditRoster?: boolean;
  onRegeneratePortalLink?: (row: RosterTableRow) => void;
  onViewAllocation?: (row: RosterTableRow) => void;
  /** When true, table grows with content and the page/shell scrolls (subject-officer). */
  pageScroll?: boolean;
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
  canEditRoster = true,
  onRegeneratePortalLink,
  onViewAllocation,
  pageScroll = false,
}: Props) {
  const [copyUi, setCopyUi] = useState<Record<string, "copied" | "error">>({});
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);

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
        accessorKey: "reference_code",
        header: "Code",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{getValue<string | null>() ?? "—"}</span>
        ),
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
          <PhoneLink phone={getValue<string | null>()} className="font-mono text-xs text-primary hover:underline" />
        ),
      },
      {
        id: "subject",
        accessorFn: (row) => row.subjectLabel,
        header: "Subject",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.subjectLabel}</span>
        ),
      },
      {
        accessorKey: "examiner_type",
        header: "Role",
        cell: ({ getValue }) => {
          const role = getValue<ExaminerTypeApi>();
          const abbrev = EXAMINER_TYPE_ABBREVIATIONS[role] ?? role;
          const fullLabel = EXAMINER_TYPE_LABELS[role] ?? role;
          return (
            <span className="font-mono text-xs font-medium" title={fullLabel}>
              {abbrev}
            </span>
          );
        },
      },
      {
        accessorKey: "region",
        header: "Region",
        cell: ({ getValue }) => humanizeRegion(getValue<string>()),
      },
      {
        accessorKey: "town",
        header: "Town",
        cell: ({ getValue }) => getValue<string | null>() ?? "—",
      },
      {
        accessorKey: "ghanapost_gps_address",
        header: "GhanaPost GPS",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{getValue<string | null>() ?? "—"}</span>
        ),
      },
      {
        accessorKey: "gender",
        header: "Gender",
        cell: ({ getValue }) => getValue<string | null>() ?? "—",
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
        id: "group",
        accessorFn: (row) => row.groupLabel ?? "",
        header: "Group",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.groupLabel ?? "—"}</span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        enableHiding: false,
        meta: {
          headerClassName: "text-right",
          cellClassName: "text-right align-middle",
          sortAriaLabel: "Actions",
        },
        cell: ({ row }) => (
          <RosterRowActionsMenu
            row={row.original}
            open={openActionsId === row.original.id}
            onOpenChange={(next) => setOpenActionsId(next ? row.original.id : null)}
            busy={busy}
            copyLinkState={copyUi[row.original.id]}
            onEdit={onEdit}
            onRemove={onRemove}
            canEditRoster={canEditRoster}
            onCopyPortalLink={handleCopyPortalLink}
            onRegeneratePortalLink={onRegeneratePortalLink}
            onViewAllocation={onViewAllocation}
          />
        ),
      },
    ],
    [
      busy,
      copyUi,
      handleCopyPortalLink,
      canEditRoster,
      onEdit,
      onRemove,
      onRegeneratePortalLink,
      onViewAllocation,
      openActionsId,
    ],
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
  const scrollClass = pageScroll
    ? EXAMINERS_TABLE_SCROLL_CONTAINER_CLASS
    : EXAMINERS_TABLE_INNER_SCROLL_CLASS;

  const paginationBlock = (
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
  );

  if (pageScroll) {
    return (
      <div className="flex flex-col gap-2">
        <div className={scrollClass}>
          <DataTable table={table} emptyMessage="No examiners match the filters." striped />
        </div>
        {paginationBlock}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={scrollClass}>
        <DataTable table={table} emptyMessage="No examiners match the filters." striped stickyHeader />
      </div>
      <div className="shrink-0 border-t border-border bg-card">{paginationBlock}</div>
    </div>
  );
}
