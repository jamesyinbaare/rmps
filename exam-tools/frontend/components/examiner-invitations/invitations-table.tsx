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
import { CheckCircle2, Loader2 } from "lucide-react";
import { useMemo } from "react";

import { DataTable } from "@/components/data-table";
import {
  EXAMINER_TYPE_LABELS,
  INPUT_FOCUS_RING,
  MAX_CUSTOM_PAGE_SIZE,
  PAGE_SIZE_PRESETS,
} from "@/components/examiner-invitations/constants";
import { InvitationStatusBadge } from "@/components/examiner-invitations/invitation-status-badge";
import type { ResendUiState } from "@/components/examiner-invitations/types";
import { formatDateOnly, formatDateTime, humanizeRegion } from "@/components/examiner-invitations/utils";
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
}: Props) {
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
        cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span>,
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
        accessorKey: "coordination_date",
        header: "Coordination",
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-xs">{formatDateOnly(getValue<string | null>())}</span>
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
        header: "",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const inv = row.original;
          if (inv.status !== "pending" && inv.status !== "expired") return null;
          const ui = resendUi[inv.id];
          if (ui === "sending") {
            return <span className="text-xs text-muted-foreground">Sending…</span>;
          }
          if (ui === "success") {
            return (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                SMS resent
              </span>
            );
          }
          if (ui === "error") {
            return (
              <span className="text-xs text-destructive" title={resendErrors[inv.id]}>
                {resendErrors[inv.id] ?? "Failed"}
              </span>
            );
          }
          return (
            <button
              type="button"
              className="text-sm text-primary underline-offset-2 hover:underline"
              onClick={() => onResend(inv)}
            >
              Resend invite
            </button>
          );
        },
      },
    ],
    [onResend, resendErrors, resendUi],
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        <DataTable table={table} emptyMessage="No invitations match the filters." striped />
      </div>
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
    </div>
  );
}
