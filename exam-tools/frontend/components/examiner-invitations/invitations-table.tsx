"use client";

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
import { useMemo, useState } from "react";

import { DataTable } from "@/components/data-table";
import {
  EXAMINER_TYPE_LABELS,
  INPUT_FOCUS_RING,
  MAX_CUSTOM_PAGE_SIZE,
  PAGE_SIZE_PRESETS,
} from "@/components/examiner-invitations/constants";
import {
  EXAMINERS_TABLE_INNER_SCROLL_CLASS,
  EXAMINERS_TABLE_SCROLL_CONTAINER_CLASS,
} from "@/components/examiners/constants";
import { InvitationRowActionsMenu } from "@/components/examiner-invitations/invitation-row-actions-menu";
import { PhoneLink } from "@/components/examiners/phone-link";
import { InvitationStatusBadge } from "@/components/examiner-invitations/invitation-status-badge";
import type { ResendUiState } from "@/components/examiner-invitations/types";
import { formatCoordinationRange, formatDateTime, humanizeRegion } from "@/components/examiner-invitations/utils";
import { OfficialAccountsPagination } from "@/components/official-accounts-pagination";
import type {
  ExaminerInvitationRow,
  ExaminerTypeApi,
  SubjectTypeEnum,
} from "@/lib/api";
import { displaySubjectCode } from "@/lib/script-control-completion";

type Props = {
  rows: ExaminerInvitationRow[];
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
  resendUi: Record<string, ResendUiState>;
  resendErrors: Record<string, string>;
  onResend: (inv: ExaminerInvitationRow) => void;
  onRenew?: (inv: ExaminerInvitationRow) => void;
  onExtendDeadline?: (inv: ExaminerInvitationRow) => void;
  onRegenerateLink?: (inv: ExaminerInvitationRow) => void;
  onCopyLink?: (inv: ExaminerInvitationRow) => void;
  copyLinkUi?: Record<string, "copied" | "error">;
  onViewAllocation?: (inv: ExaminerInvitationRow) => void;
  /** When true, table grows with content and the page/shell scrolls (subject-officer). */
  pageScroll?: boolean;
};

export function InvitationsTable({
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
  resendUi,
  resendErrors,
  onResend,
  onRenew,
  onExtendDeadline,
  onRegenerateLink,
  onCopyLink,
  copyLinkUi = {},
  onViewAllocation,
  pageScroll = false,
}: Props) {
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);

  const columns = useMemo<ColumnDef<ExaminerInvitationRow>[]>(
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
          <PhoneLink phone={getValue<string>()} className="font-mono text-xs text-primary hover:underline" />
        ),
      },
      {
        id: "subject",
        accessorFn: (row) => `${displaySubjectCode(row)} ${row.subject_name}`,
        header: "Subject",
        cell: ({ row }) => (
          <span>
            {displaySubjectCode(row.original)} — {row.original.subject_name}
          </span>
        ),
      },
      {
        accessorKey: "subject_type",
        header: "Type",
        cell: ({ getValue }) => {
          const v = getValue<SubjectTypeEnum>();
          return (
            <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
              {v === "CORE" ? "Core" : "Elective"}
            </span>
          );
        },
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
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => <InvitationStatusBadge status={getValue<ExaminerInvitationRow["status"]>()} />,
      },
      {
        accessorKey: "response_deadline",
        header: "Respond by",
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-xs">{formatDateTime(getValue<string>())}</span>
        ),
      },
      {
        id: "coordination",
        header: "Coordination",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs">
            {formatCoordinationRange(
              row.original.coordination_start_date,
              row.original.coordination_start_time,
              row.original.coordination_end_date,
              row.original.coordination_end_time,
            )}
          </span>
        ),
      },
      {
        id: "sms",
        header: "SMS",
        enableSorting: false,
        cell: ({ row }) => {
          const inv = row.original;
          return (
            <span className="text-xs">
              {inv.sms_sent === true
                ? "Sent"
                : inv.sms_sent === false
                  ? inv.sms_error ?? "Failed"
                  : "—"}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const inv = row.original;
          return (
            <InvitationRowActionsMenu
              inv={inv}
              open={openActionsId === inv.id}
              onOpenChange={(next) => setOpenActionsId(next ? inv.id : null)}
              busy={busy}
              resendUi={resendUi[inv.id]}
              resendError={resendErrors[inv.id]}
              copyLinkState={copyLinkUi[inv.id]}
              onCopyLink={onCopyLink}
              onResend={onResend}
              onRenew={onRenew}
              onExtendDeadline={onExtendDeadline}
              onRegenerateLink={onRegenerateLink}
              onViewAllocation={onViewAllocation}
            />
          );
        },
      },
    ],
    [busy, copyLinkUi, onCopyLink, onExtendDeadline, onRegenerateLink, onRenew, onResend, onViewAllocation, openActionsId, resendErrors, resendUi],
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
        Loading invitations…
      </div>
    );
  }

  if (rows.length === 0) {
    return null;
  }

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
      recordLabel="invitation"
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
          <DataTable table={table} emptyMessage="No invitations match the filters." striped />
        </div>
        {paginationBlock}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={scrollClass}>
        <DataTable table={table} emptyMessage="No invitations match the filters." striped stickyHeader />
      </div>
      <div className="shrink-0 border-t border-border bg-card">{paginationBlock}</div>
    </div>
  );
}
