"use client";

import * as React from "react";
import {
  ColumnDef,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type { RegistrationCandidate } from "@/types";
import { registrationTypeLabel } from "@/lib/school-registration";
import { normalizeCandidateGender } from "@/components/school/ExamCandidateStats";
import { cn } from "@/lib/utils";

interface SchoolExamCandidatesTableProps {
  candidates: RegistrationCandidate[];
  loading?: boolean;
  onRowClick?: (candidate: RegistrationCandidate) => void;
  onFilteredChange?: (rows: RegistrationCandidate[]) => void;
}

function candidateDisplayName(c: RegistrationCandidate): string {
  if (c.name?.trim()) return c.name;
  return [c.firstname, c.lastname, c.othername].filter(Boolean).join(" ");
}

function statusBadgeClass(status: string): string {
  switch (status.toUpperCase()) {
    case "COMPLETE":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
    case "INCOMPLETE":
      return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200";
    case "DRAFT":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function genderLabel(gender: string | null | undefined): string {
  const g = normalizeCandidateGender(gender);
  if (g === "male") return "Male";
  if (g === "female") return "Female";
  return "Unspecified";
}

function SortHeader({
  label,
  column,
}: {
  label: string;
  column: {
    toggleSorting: (desc?: boolean) => void;
    getIsSorted: () => false | "asc" | "desc";
  };
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {label}
      <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
    </button>
  );
}

export function SchoolExamCandidatesTable({
  candidates,
  loading = false,
  onRowClick,
  onFilteredChange,
}: SchoolExamCandidatesTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "name", desc: false },
  ]);
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [programmeFilter, setProgrammeFilter] = React.useState("all");
  const [genderFilter, setGenderFilter] = React.useState("all");
  const [pageSize, setPageSize] = React.useState(20);

  const availableTypes = React.useMemo(() => {
    return Array.from(
      new Set(
        candidates
          .map((c) => c.registration_type)
          .filter((t): t is string => Boolean(t))
      )
    ).sort();
  }, [candidates]);

  const availableProgrammes = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const c of candidates) {
      if (c.programme_id != null) {
        const key = `id:${c.programme_id}`;
        if (!map.has(key)) {
          map.set(key, c.programme_code || `Programme ${c.programme_id}`);
        }
      } else if (c.programme_code) {
        const key = `code:${c.programme_code}`;
        if (!map.has(key)) map.set(key, c.programme_code);
      }
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [candidates]);

  const filteredData = React.useMemo(() => {
    return candidates.filter((c) => {
      if (statusFilter !== "all") {
        if (String(c.registration_status || "").toUpperCase() !== statusFilter) {
          return false;
        }
      }
      if (typeFilter !== "all" && (c.registration_type || "") !== typeFilter) {
        return false;
      }
      if (programmeFilter !== "all") {
        const key =
          c.programme_id != null
            ? `id:${c.programme_id}`
            : c.programme_code
              ? `code:${c.programme_code}`
              : "";
        if (key !== programmeFilter) return false;
      }
      if (genderFilter !== "all") {
        if (normalizeCandidateGender(c.gender) !== genderFilter) return false;
      }
      return true;
    });
  }, [candidates, statusFilter, typeFilter, programmeFilter, genderFilter]);

  const columns: ColumnDef<RegistrationCandidate>[] = React.useMemo(
    () => [
      {
        id: "name",
        accessorFn: (c) => candidateDisplayName(c),
        header: ({ column }) => <SortHeader label="Name" column={column} />,
        cell: ({ row }) => (
          <div className="font-medium">{candidateDisplayName(row.original)}</div>
        ),
      },
      {
        id: "registration_number",
        accessorFn: (c) => c.registration_number || "",
        header: ({ column }) => (
          <SortHeader label="Reg. number" column={column} />
        ),
        cell: ({ row }) => (
          <div className="font-mono text-sm">
            {row.original.registration_number || "—"}
          </div>
        ),
      },
      {
        id: "index_number",
        accessorFn: (c) => c.index_number || "",
        header: ({ column }) => (
          <SortHeader label="Index number" column={column} />
        ),
        cell: ({ row }) => (
          <div className="font-mono text-sm">
            {row.original.index_number || (
              <span className="italic text-muted-foreground">—</span>
            )}
          </div>
        ),
      },
      {
        id: "programme",
        accessorFn: (c) => c.programme_code || "",
        header: ({ column }) => (
          <SortHeader label="Programme" column={column} />
        ),
        cell: ({ row }) => (
          <div className="text-sm">{row.original.programme_code || "—"}</div>
        ),
      },
      {
        id: "type",
        accessorFn: (c) => c.registration_type || "",
        header: ({ column }) => <SortHeader label="Type" column={column} />,
        cell: ({ row }) => (
          <div className="text-sm">
            {registrationTypeLabel(row.original.registration_type)}
          </div>
        ),
      },
      {
        id: "status",
        accessorFn: (c) =>
          String(c.registration_status || "").toUpperCase(),
        header: ({ column }) => <SortHeader label="Status" column={column} />,
        cell: ({ row }) => {
          const status = String(
            row.original.registration_status || ""
          ).toUpperCase();
          const label =
            status === "COMPLETE"
              ? "Complete"
              : status === "INCOMPLETE"
                ? "Incomplete"
                : status === "DRAFT"
                  ? "Draft"
                  : status || "—";
          return (
            <Badge
              className={cn("shadow-none", statusBadgeClass(status))}
            >
              {label}
            </Badge>
          );
        },
      },
      {
        id: "gender",
        accessorFn: (c) => genderLabel(c.gender),
        header: ({ column }) => <SortHeader label="Gender" column={column} />,
        cell: ({ row }) => (
          <div className="text-sm">{genderLabel(row.original.gender)}</div>
        ),
      },
      {
        id: "registration_date",
        accessorFn: (c) => c.registration_date || "",
        header: ({ column }) => (
          <SortHeader label="Registered" column={column} />
        ),
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {row.original.registration_date
              ? new Date(row.original.registration_date).toLocaleDateString()
              : "—"}
          </div>
        ),
      },
    ],
    []
  );

  const dataTable = useReactTable({
    data: filteredData,
    columns,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue ?? "")
        .trim()
        .toLowerCase();
      if (!query) return true;
      const c = row.original;
      const haystack = [
        candidateDisplayName(c),
        c.registration_number,
        c.index_number,
        c.programme_code,
        c.registration_type,
        c.registration_status,
        c.gender,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    },
    initialState: {
      pagination: { pageSize },
    },
    state: {
      sorting,
      columnVisibility,
      globalFilter,
    },
  });

  React.useEffect(() => {
    if (pageSize !== dataTable.getState().pagination.pageSize) {
      dataTable.setPageSize(pageSize);
      dataTable.setPageIndex(0);
    }
  }, [pageSize, dataTable]);

  React.useEffect(() => {
    dataTable.setPageIndex(0);
  }, [
    globalFilter,
    statusFilter,
    typeFilter,
    programmeFilter,
    genderFilter,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredRowModel = dataTable.getFilteredRowModel();
  const filteredRowIds = filteredRowModel.rows.map((r) => r.id).join(",");

  React.useEffect(() => {
    onFilteredChange?.(
      dataTable.getFilteredRowModel().rows.map((r) => r.original)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRowIds, onFilteredChange]);

  const filteredCount = filteredRowModel.rows.length;
  const totalCount = candidates.length;
  const pageCount = dataTable.getPageCount() || 1;
  const filtersActive =
    Boolean(globalFilter.trim()) ||
    statusFilter !== "all" ||
    typeFilter !== "all" ||
    programmeFilter !== "all" ||
    genderFilter !== "all";

  const clearFilters = () => {
    setGlobalFilter("");
    setStatusFilter("all");
    setTypeFilter("all");
    setProgrammeFilter("all");
    setGenderFilter("all");
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Skeleton className="h-9 w-full max-w-sm" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="space-y-3 p-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, reg no, index…"
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9 shadow-none"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-full shadow-none sm:w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="INCOMPLETE">Incomplete</SelectItem>
              <SelectItem value="COMPLETE">Complete</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-full shadow-none sm:w-[150px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {availableTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {registrationTypeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={programmeFilter} onValueChange={setProgrammeFilter}>
            <SelectTrigger className="h-9 w-full shadow-none sm:w-[170px]">
              <SelectValue placeholder="Programme" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All programmes</SelectItem>
              {availableProgrammes.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={genderFilter} onValueChange={setGenderFilter}>
            <SelectTrigger className="h-9 w-full shadow-none sm:w-[150px]">
              <SelectValue placeholder="Gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All genders</SelectItem>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="unspecified">Unspecified</SelectItem>
            </SelectContent>
          </Select>
          {filtersActive && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shadow-none"
              onClick={clearFilters}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0 shadow-none"
            >
              Columns <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {dataTable
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="capitalize"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) =>
                    column.toggleVisibility(!!value)
                  }
                >
                  {column.id.replace(/_/g, " ")}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-none">
        <Table>
          <TableHeader>
            {dataTable.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {dataTable.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  {totalCount === 0
                    ? "No candidates registered."
                    : "No candidates match your filters."}
                </TableCell>
              </TableRow>
            ) : (
              dataTable.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(onRowClick && "cursor-pointer")}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row">
          <div>
            {filteredCount === 0
              ? "0 candidates"
              : `Showing ${
                  dataTable.getState().pagination.pageIndex * pageSize + 1
                }–${Math.min(
                  (dataTable.getState().pagination.pageIndex + 1) * pageSize,
                  filteredCount
                )} of ${filteredCount}${
                  filtersActive ? ` (filtered from ${totalCount})` : ""
                }`}
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(v) => setPageSize(parseInt(v, 10))}
            >
              <SelectTrigger className="h-8 w-[90px] shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-8 shadow-none"
              onClick={() => dataTable.previousPage()}
              disabled={!dataTable.getCanPreviousPage()}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="whitespace-nowrap px-1">
              {dataTable.getState().pagination.pageIndex + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 shadow-none"
              onClick={() => dataTable.nextPage()}
              disabled={!dataTable.getCanNextPage()}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
