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
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { closeRegistrationPeriod, deleteExam } from "@/lib/api";
import type { RegistrationExam } from "@/types";
import { CloseRegistrationDialog } from "@/components/admin/CloseRegistrationDialog";
import { OpenRegistrationDialog } from "@/components/admin/OpenRegistrationDialog";
import { DeleteExamDialog } from "@/components/admin/DeleteExamDialog";

type ExamStatusLabel = "Open" | "Upcoming" | "Closed" | "Inactive";

interface ExamTableProps {
  exams: RegistrationExam[];
  onRefresh?: () => void;
  loading?: boolean;
}

function getRegistrationStatus(exam: RegistrationExam): {
  label: ExamStatusLabel;
  className: string;
} {
  const now = new Date();
  const startDate = new Date(exam.registration_period.registration_start_date);
  const endDate = new Date(exam.registration_period.registration_end_date);

  if (!exam.registration_period.is_active) {
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

function isRegistrationOpen(exam: RegistrationExam) {
  const now = new Date();
  const startDate = new Date(exam.registration_period.registration_start_date);
  const endDate = new Date(exam.registration_period.registration_end_date);
  return exam.registration_period.is_active && now >= startDate && now <= endDate;
}

function canDeleteExam(exam: RegistrationExam) {
  const now = new Date();
  const startDate = new Date(exam.registration_period.registration_start_date);
  return now < startDate;
}

function formatCompactDate(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function formatCreatedDate(dateString: string) {
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

function examSearchText(exam: RegistrationExam) {
  const status = getRegistrationStatus(exam).label;
  return [
    exam.programme_type_name,
    exam.exam_type,
    exam.exam_series_short_name,
    exam.exam_series_long_name,
    exam.exam_series,
    String(exam.year),
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
  column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | "asc" | "desc" };
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

export function ExamTable({ exams, onRefresh, loading = false }: ExamTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({
    created_at: false,
  });
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [pageSize, setPageSize] = React.useState(20);

  const [closeDialogOpen, setCloseDialogOpen] = React.useState(false);
  const [openDialogOpen, setOpenDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [selectedExam, setSelectedExam] = React.useState<RegistrationExam | null>(null);
  const [closing, setClosing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const handleCloseRegistration = async () => {
    if (!selectedExam) return;
    setClosing(true);
    try {
      await closeRegistrationPeriod(selectedExam.id);
      toast.success("Registration period closed successfully");
      setCloseDialogOpen(false);
      setSelectedExam(null);
      onRefresh?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to close registration");
    } finally {
      setClosing(false);
    }
  };

  const handleOpenSuccess = () => {
    setOpenDialogOpen(false);
    setSelectedExam(null);
    onRefresh?.();
  };

  const handleDeleteExam = async () => {
    if (!selectedExam) return;
    setDeleting(true);
    try {
      await deleteExam(selectedExam.id);
      toast.success("Examination deleted successfully");
      setDeleteDialogOpen(false);
      setSelectedExam(null);
      onRefresh?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete examination");
    } finally {
      setDeleting(false);
    }
  };

  const columns: ColumnDef<RegistrationExam>[] = React.useMemo(
    () => [
      {
        id: "examination",
        accessorFn: (exam) => examTitle(exam),
        header: ({ column }) => <SortHeader label="Examination" column={column} />,
        cell: ({ row }) => {
          const exam = row.original;
          const period = exam.registration_period;
          return (
            <div className="min-w-0 py-0.5">
              <div className="truncate text-sm font-medium">{examTitle(exam)}</div>
              <div className="text-xs text-muted-foreground">
                {formatCompactDate(period.registration_start_date)} –{" "}
                {formatCompactDate(period.registration_end_date)}
              </div>
            </div>
          );
        },
      },
      {
        id: "status",
        accessorFn: (exam) => getRegistrationStatus(exam).label,
        header: ({ column }) => <SortHeader label="Status" column={column} />,
        cell: ({ row }) => {
          const status = getRegistrationStatus(row.original);
          return (
            <Badge variant="outline" className={status.className}>
              {status.label}
            </Badge>
          );
        },
      },
      {
        id: "kind",
        accessorFn: (exam) => exam.exam_kind || "school",
        header: ({ column }) => <SortHeader label="Kind" column={column} />,
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {row.original.exam_kind || "school"}
          </Badge>
        ),
      },
      {
        id: "candidates",
        accessorFn: (exam) => exam.candidate_count ?? 0,
        header: ({ column }) => <SortHeader label="Candidates" column={column} />,
        cell: ({ row }) => (
          <div className="font-mono text-sm tabular-nums">
            {(row.original.candidate_count ?? 0).toLocaleString()}
          </div>
        ),
      },
      {
        accessorKey: "created_at",
        header: ({ column }) => <SortHeader label="Created" column={column} />,
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {formatCreatedDate(row.getValue("created_at"))}
          </div>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const exam = row.original;
          const isOpen = isRegistrationOpen(exam);
          return (
            <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => router.push(`/dashboard/exams/${exam.id}`)}>
                    View details
                  </DropdownMenuItem>
                  {isOpen ? (
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedExam(exam);
                        setCloseDialogOpen(true);
                      }}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Close registration
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedExam(exam);
                        setOpenDialogOpen(true);
                      }}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      Open registration
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {canDeleteExam(exam) ? (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        setSelectedExam(exam);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [router]
  );

  const filteredData = React.useMemo(() => {
    if (statusFilter === "all") return exams;
    return exams.filter((exam) => getRegistrationStatus(exam).label === statusFilter);
  }, [exams, statusFilter]);

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
  }, [globalFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredCount = dataTable.getFilteredRowModel().rows.length;
  const totalCount = dataTable.getCoreRowModel().rows.length;
  const pageCount = dataTable.getPageCount() || 1;
  const filtersActive = Boolean(globalFilter.trim()) || statusFilter !== "all";

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card py-10 text-center text-sm text-muted-foreground">
        Loading examinations…
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              placeholder="Search examinations…"
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="max-w-sm"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[150px]">
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
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
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
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {column.id === "created_at" ? "Created" : column.id.replace(/_/g, " ")}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              {dataTable.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="h-10">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {dataTable.getRowModel().rows?.length ? (
                dataTable.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest("button") || target.closest("[role='menuitem']")) {
                        return;
                      }
                      router.push(`/dashboard/exams/${row.original.id}`);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                    No examinations found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 px-1 sm:flex-row">
          <div className="text-sm text-muted-foreground">
            <span className="font-mono font-medium text-foreground">{filteredCount}</span>
            {" of "}
            <span className="font-mono font-medium text-foreground">{totalCount}</span>
            {filtersActive ? " matched" : " exams"}
          </div>
          <div className="flex items-center gap-2">
            <Select value={pageSize.toString()} onValueChange={(value) => setPageSize(parseInt(value, 10))}>
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span className="whitespace-nowrap text-sm text-muted-foreground">
              {dataTable.getState().pagination.pageIndex + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => dataTable.previousPage()}
              disabled={!dataTable.getCanPreviousPage()}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => dataTable.nextPage()}
              disabled={!dataTable.getCanNextPage()}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {selectedExam ? (
        <>
          <CloseRegistrationDialog
            open={closeDialogOpen}
            onOpenChange={setCloseDialogOpen}
            exam={selectedExam}
            onConfirm={handleCloseRegistration}
            loading={closing}
          />
          <OpenRegistrationDialog
            open={openDialogOpen}
            onOpenChange={setOpenDialogOpen}
            exam={selectedExam}
            onSuccess={handleOpenSuccess}
          />
          <DeleteExamDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            exam={selectedExam}
            onConfirm={handleDeleteExam}
            loading={deleting}
          />
        </>
      ) : null}
    </>
  );
}
