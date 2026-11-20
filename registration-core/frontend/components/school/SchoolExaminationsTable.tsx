"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { Skeleton } from "@/components/ui/skeleton";
import type { RegistrationExam } from "@/types";

export interface ExamHistoryKpis {
  total: number;
  approved: number;
  pending: number;
}

export type SchoolExamTableRow = RegistrationExam & {
  kpis: ExamHistoryKpis;
};

type StatusLabel = "Open" | "Upcoming" | "Closed" | "Inactive";

interface SchoolExaminationsTableProps {
  exams: SchoolExamTableRow[];
  loading?: boolean;
}

function getRegistrationStatus(exam: RegistrationExam): {
  label: StatusLabel;
  className: string;
} {
  const period = exam.registration_period;
  if (!period) {
    return { label: "Inactive", className: "text-muted-foreground" };
  }
  const now = new Date();
  const startDate = new Date(period.registration_start_date);
  const endDate = new Date(period.registration_end_date);

  if (!period.is_active) {
    return { label: "Inactive", className: "text-muted-foreground" };
  }
  if (now < startDate) {
    return { label: "Upcoming", className: "text-muted-foreground" };
  }
  if (now >= startDate && now <= endDate) {
    return {
      label: "Open",
      className: "border-success/30 bg-success/10 text-success",
    };
  }
  return { label: "Closed", className: "text-muted-foreground" };
}

function formatCompactDate(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function examTitle(exam: RegistrationExam) {
  const type = exam.programme_type_name || exam.exam_type;
  const series = exam.exam_series_short_name || exam.exam_series;
  return [type, series, exam.year].filter(Boolean).join(" · ");
}

function examSearchText(exam: SchoolExamTableRow) {
  const status = getRegistrationStatus(exam).label;
  return [
    exam.programme_type_name,
    exam.exam_type,
    exam.exam_series_short_name,
    exam.exam_series_long_name,
    exam.exam_series,
    String(exam.year),
    exam.exam_kind || "school",
    status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
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

export function SchoolExaminationsTable({
  exams,
  loading = false,
}: SchoolExaminationsTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "year", desc: true },
  ]);
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({
      pending: false,
    });
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [yearFilter, setYearFilter] = React.useState<string>("all");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [kindFilter, setKindFilter] = React.useState<string>("all");
  const [pageSize, setPageSize] = React.useState(20);

  const availableYears = React.useMemo(() => {
    return Array.from(new Set(exams.map((e) => e.year))).sort((a, b) => b - a);
  }, [exams]);

  const availableTypes = React.useMemo(() => {
    return Array.from(new Set(exams.map((e) => e.exam_type))).sort();
  }, [exams]);

  const hasMultipleKinds = React.useMemo(() => {
    const kinds = new Set(exams.map((e) => e.exam_kind || "school"));
    return kinds.size > 1;
  }, [exams]);

  const filteredData = React.useMemo(() => {
    return exams.filter((exam) => {
      if (yearFilter !== "all" && String(exam.year) !== yearFilter) return false;
      if (typeFilter !== "all" && exam.exam_type !== typeFilter) return false;
      if (
        statusFilter !== "all" &&
        getRegistrationStatus(exam).label !== statusFilter
      ) {
        return false;
      }
      if (kindFilter !== "all") {
        const kind = exam.exam_kind || "school";
        if (kind !== kindFilter) return false;
      }
      return true;
    });
  }, [exams, yearFilter, typeFilter, statusFilter, kindFilter]);

  const columns: ColumnDef<SchoolExamTableRow>[] = React.useMemo(
    () => [
      {
        id: "examination",
        accessorFn: (exam) => examTitle(exam),
        header: ({ column }) => (
          <SortHeader label="Examination" column={column} />
        ),
        cell: ({ row }) => {
          const exam = row.original;
          const period = exam.registration_period;
          return (
            <div className="min-w-0 py-0.5">
              <div className="truncate text-sm font-medium">
                {examTitle(exam)}
              </div>
              {period ? (
                <div className="text-xs text-muted-foreground">
                  {formatCompactDate(period.registration_start_date)} –{" "}
                  {formatCompactDate(period.registration_end_date)}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "year",
        accessorFn: (exam) => exam.year,
        header: ({ column }) => <SortHeader label="Year" column={column} />,
        cell: ({ row }) => (
          <div className="font-mono text-sm tabular-nums">
            {row.original.year}
          </div>
        ),
      },
      {
        id: "series",
        accessorFn: (exam) =>
          exam.exam_series_short_name || exam.exam_series || "",
        header: ({ column }) => <SortHeader label="Series" column={column} />,
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.exam_series_short_name ||
              row.original.exam_series ||
              "—"}
          </div>
        ),
      },
      {
        id: "kind",
        accessorFn: (exam) => exam.exam_kind || "school",
        header: ({ column }) => <SortHeader label="Kind" column={column} />,
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize shadow-none">
            {row.original.exam_kind || "school"}
          </Badge>
        ),
      },
      {
        id: "status",
        accessorFn: (exam) => getRegistrationStatus(exam).label,
        header: ({ column }) => <SortHeader label="Status" column={column} />,
        cell: ({ row }) => {
          const status = getRegistrationStatus(row.original);
          return (
            <Badge variant="outline" className={`shadow-none ${status.className}`}>
              {status.label}
            </Badge>
          );
        },
      },
      {
        id: "candidates",
        accessorFn: (exam) => exam.kpis.total,
        header: ({ column }) => (
          <SortHeader label="Candidates" column={column} />
        ),
        cell: ({ row }) => (
          <div className="font-mono text-sm tabular-nums">
            {row.original.kpis.total.toLocaleString()}
          </div>
        ),
      },
      {
        id: "approved",
        accessorFn: (exam) => exam.kpis.approved,
        header: ({ column }) => (
          <SortHeader label="Approved" column={column} />
        ),
        cell: ({ row }) => (
          <div className="font-mono text-sm tabular-nums">
            {row.original.kpis.approved.toLocaleString()}
          </div>
        ),
      },
      {
        id: "pending",
        accessorFn: (exam) => exam.kpis.pending,
        header: ({ column }) => <SortHeader label="Pending" column={column} />,
        cell: ({ row }) => (
          <div className="font-mono text-sm tabular-nums">
            {row.original.kpis.pending.toLocaleString()}
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
      return examSearchText(row.original).includes(query);
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
    yearFilter,
    typeFilter,
    statusFilter,
    kindFilter,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredCount = dataTable.getFilteredRowModel().rows.length;
  const totalCount = exams.length;
  const pageCount = dataTable.getPageCount() || 1;
  const filtersActive =
    Boolean(globalFilter.trim()) ||
    yearFilter !== "all" ||
    typeFilter !== "all" ||
    statusFilter !== "all" ||
    kindFilter !== "all";

  const clearFilters = () => {
    setGlobalFilter("");
    setYearFilter("all");
    setTypeFilter("all");
    setStatusFilter("all");
    setKindFilter("all");
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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search examinations…"
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9 shadow-none"
            />
          </div>
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="h-9 w-full shadow-none sm:w-[130px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {availableYears.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-full shadow-none sm:w-[160px]">
              <SelectValue placeholder="Exam type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {availableTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-full shadow-none sm:w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Open">Open</SelectItem>
              <SelectItem value="Upcoming">Upcoming</SelectItem>
              <SelectItem value="Closed">Closed</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          {hasMultipleKinds && (
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="h-9 w-full shadow-none sm:w-[140px]">
                <SelectValue placeholder="Kind" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                <SelectItem value="school">School</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
          )}
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
                    ? "No examinations on record."
                    : "No examinations match your filters."}
                </TableCell>
              </TableRow>
            ) : (
              dataTable.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() =>
                    router.push(
                      `/dashboard/my-school/examinations/${row.original.id}`
                    )
                  }
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
              ? "0 examinations"
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
