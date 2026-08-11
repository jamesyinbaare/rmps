"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { IssuanceStatusBadge } from "@/components/certificates/issuance-status";
import { TableSkeleton } from "@/components/certificates/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { IssueFormCandidate, IssueFormProgrammeGroup } from "@/types/document";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useState } from "react";

type NumberFilter = "all" | "numbered" | "missing";

interface IssueFormCandidatesDataTableProps {
  candidates: IssueFormCandidate[];
  loading?: boolean;
  examId: number;
  programmes?: IssueFormProgrammeGroup[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  programmeFilter: string;
  numberFilter: NumberFilter;
  onSearchChange: (value: string) => void;
  onProgrammeChange: (value: string) => void;
  onNumberFilterChange: (value: NumberFilter) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

function programmeLabel(row: IssueFormCandidate): string {
  if (row.programme_code && row.programme_name) {
    return `${row.programme_code} — ${row.programme_name}`;
  }
  return row.programme_name || row.programme_code || "No programme";
}

function programmeKey(row: IssueFormCandidate): string {
  return row.programme_id != null ? String(row.programme_id) : "none";
}

export function IssueFormCandidatesDataTable({
  candidates,
  loading,
  examId,
  programmes = [],
  total,
  page,
  pageSize,
  search,
  programmeFilter,
  numberFilter,
  onSearchChange,
  onProgrammeChange,
  onNumberFilterChange,
  onPageChange,
  onPageSizeChange,
}: IssueFormCandidatesDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "index_number", desc: false },
  ]);

  const columns = useMemo<ColumnDef<IssueFormCandidate>[]>(
    () => [
      {
        accessorKey: "candidate_name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            href={`/results/certificates/${examId}/registrations/${row.original.exam_registration_id}`}
            className="font-medium hover:underline after:absolute after:inset-0"
            aria-label={`${row.original.index_number} — ${row.original.candidate_name}`}
          >
            {row.original.candidate_name}
          </Link>
        ),
      },
      {
        accessorKey: "index_number",
        header: "Index number",
        cell: ({ row }) => (
          <div className="font-mono text-sm">{row.original.index_number}</div>
        ),
      },
      {
        accessorKey: "certificate_number",
        header: "Certificate number",
        cell: ({ row }) => (
          <div className="font-mono text-sm text-muted-foreground">
            {row.original.certificate_number || "—"}
          </div>
        ),
      },
      {
        id: "programme",
        accessorFn: (row) => programmeLabel(row),
        header: "Programme",
        cell: ({ getValue }) => (
          <div className="text-muted-foreground">{getValue<string>()}</div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <IssuanceStatusBadge
            status={row.original.status}
            certificateNumber={row.original.certificate_number}
          />
        ),
      },
    ],
    [examId]
  );

  const table = useReactTable({
    data: candidates,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    state: { sorting },
  });

  const pageRows = table.getRowModel().rows;
  const groupedPage = useMemo(() => {
    const groups: { key: string; label: string; rows: typeof pageRows }[] = [];
    for (const row of pageRows) {
      const key = programmeKey(row.original);
      const last = groups[groups.length - 1];
      if (!last || last.key !== key) {
        groups.push({ key, label: programmeLabel(row.original), rows: [row] });
      } else {
        last.rows.push(row);
      }
    }
    return groups;
  }, [pageRows]);

  const showGroups = programmes.length > 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search name, index, or certificate"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
          {search && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
              onClick={() => onSearchChange("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={programmeFilter} onValueChange={onProgrammeChange}>
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue placeholder="Programme" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All programmes</SelectItem>
              {programmes.map((item) => (
                <SelectItem
                  key={item.programme_id ?? "none"}
                  value={item.programme_id != null ? String(item.programme_id) : "none"}
                >
                  {item.programme_code
                    ? `${item.programme_code} — ${item.programme_name}`
                    : item.programme_name || "No programme"}{" "}
                  ({item.candidate_count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={numberFilter}
            onValueChange={(value) => onNumberFilterChange(value as NumberFilter)}
          >
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder="Certificate no." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All certificate nos.</SelectItem>
              <SelectItem value="numbered">Has certificate no.</SelectItem>
              <SelectItem value="missing">Missing certificate no.</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger className="h-9 w-[88px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {programmes.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {programmes.length} programme{programmes.length === 1 ? "" : "s"} · {total} candidate
          {total === 1 ? "" : "s"}
        </p>
      )}

      {loading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : (
                        <div
                          className={
                            header.column.getCanSort()
                              ? "cursor-pointer select-none hover:text-foreground"
                              : ""
                          }
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{
                            asc: " ↑",
                            desc: " ↓",
                          }[header.column.getIsSorted() as string] ?? null}
                        </div>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    No candidates match the current filters.
                  </TableCell>
                </TableRow>
              ) : showGroups ? (
                groupedPage.map((group, groupIndex) => (
                  <GroupRows
                    key={`${group.key}-${groupIndex}`}
                    label={group.label}
                    count={
                      programmes.find((item) => {
                        const key =
                          item.programme_id != null ? String(item.programme_id) : "none";
                        return key === group.key;
                      })?.candidate_count ?? group.rows.length
                    }
                    colSpan={columns.length}
                  >
                    {group.rows.map((row) => (
                      <TableRow key={row.id} className="relative">
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </GroupRows>
                ))
              ) : (
                pageRows.map((row) => (
                  <TableRow key={row.id} className="relative">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {total > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {startIndex} to {endIndex} of {total} candidate
            {total === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupRows({
  label,
  count,
  colSpan,
  children,
}: {
  label: string;
  count: number;
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <>
      <TableRow className="hover:bg-transparent">
        <TableCell
          colSpan={colSpan}
          className="bg-teal-800 py-2 text-xs font-semibold uppercase tracking-wide text-white"
        >
          {label}
          <span className="ml-2 font-normal normal-case text-teal-100">
            {count} candidate{count === 1 ? "" : "s"}
          </span>
        </TableCell>
      </TableRow>
      {children}
    </>
  );
}
