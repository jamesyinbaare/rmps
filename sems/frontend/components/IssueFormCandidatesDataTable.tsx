"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
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
import type { IssueFormCandidate } from "@/types/document";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";

type NumberFilter = "all" | "numbered" | "missing";

interface IssueFormCandidatesDataTableProps {
  candidates: IssueFormCandidate[];
  loading?: boolean;
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

function statusLabel(status: IssueFormCandidate["status"]): string {
  if (!status) return "—";
  if (status === "matched_scan") return "Matched";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function IssueFormCandidatesDataTable({
  candidates,
  loading,
}: IssueFormCandidatesDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "index_number", desc: false },
  ]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [programmeFilter, setProgrammeFilter] = useState<string>("all");
  const [numberFilter, setNumberFilter] = useState<NumberFilter>("all");
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 50,
  });

  const programmeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of candidates) {
      map.set(programmeKey(row), programmeLabel(row));
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [candidates]);

  const filteredCandidates = useMemo(() => {
    const q = globalFilter.trim().toLowerCase();
    return candidates.filter((row) => {
      if (programmeFilter !== "all" && programmeKey(row) !== programmeFilter) {
        return false;
      }
      if (numberFilter === "numbered" && !row.certificate_number) {
        return false;
      }
      if (numberFilter === "missing" && row.certificate_number) {
        return false;
      }
      if (!q) return true;
      return (
        row.candidate_name.toLowerCase().includes(q) ||
        row.index_number.toLowerCase().includes(q) ||
        (row.certificate_number || "").toLowerCase().includes(q) ||
        programmeLabel(row).toLowerCase().includes(q)
      );
    });
  }, [candidates, globalFilter, programmeFilter, numberFilter]);

  const columns = useMemo<ColumnDef<IssueFormCandidate>[]>(
    () => [
      {
        accessorKey: "candidate_name",
        header: "Name",
        cell: ({ row }) => (
          <div className="font-medium">{row.original.candidate_name}</div>
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
          <Badge variant="secondary">{statusLabel(row.original.status)}</Badge>
        ),
      },
    ],
    []
  );

  const tableData = useMemo(() => {
    return [...filteredCandidates].sort((a, b) => {
      const byProgramme = programmeLabel(a).localeCompare(programmeLabel(b));
      if (byProgramme !== 0) return byProgramme;
      return a.index_number.localeCompare(b.index_number);
    });
  }, [filteredCandidates]);

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    state: {
      sorting,
      pagination,
    },
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

  const programmeTotals = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const row of filteredCandidates) {
      const key = programmeKey(row);
      const current = map.get(key);
      if (current) {
        current.count += 1;
      } else {
        map.set(key, { label: programmeLabel(row), count: 1 });
      }
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredCandidates]);

  const showGroups = programmeTotals.length > 1;
  const totalFiltered = filteredCandidates.length;
  const startIndex =
    totalFiltered === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const endIndex = Math.min(
    pagination.pageIndex * pagination.pageSize + pageRows.length,
    totalFiltered
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
        Loading candidates…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search name, index, certificate, or programme"
            value={globalFilter}
            onChange={(e) => {
              setGlobalFilter(e.target.value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            className="pl-9"
          />
          {globalFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
              onClick={() => setGlobalFilter("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={programmeFilter}
            onValueChange={(value) => {
              setProgrammeFilter(value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
          >
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue placeholder="Programme" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All programmes</SelectItem>
              {programmeOptions.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={numberFilter}
            onValueChange={(value) => {
              setNumberFilter(value as NumberFilter);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
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
            value={String(pagination.pageSize)}
            onValueChange={(value) => table.setPageSize(Number(value))}
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

      {programmeTotals.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {programmeTotals.length} programme
          {programmeTotals.length === 1 ? "" : "s"} · {totalFiltered} candidate
          {totalFiltered === 1 ? "" : "s"}
        </p>
      )}

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
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
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
                  {candidates.length === 0
                    ? "No candidates on this issue form."
                    : "No candidates match the current filters."}
                </TableCell>
              </TableRow>
            ) : showGroups ? (
              groupedPage.map((group, groupIndex) => (
                <GroupRows
                  key={`${group.key}-${groupIndex}`}
                  label={group.label}
                  count={
                    programmeTotals.find((item) => item.label === group.label)
                      ?.count ?? group.rows.length
                  }
                  colSpan={columns.length}
                >
                  {group.rows.map((row) => (
                    <TableRow key={row.id}>
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
                <TableRow key={row.id}>
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

      {totalFiltered > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {startIndex} to {endIndex} of {totalFiltered} candidate
            {totalFiltered === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount() || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
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
