"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ColumnDef,
  ColumnFiltersState,
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
  DropdownMenuLabel,
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
    return { label: "Inactive", className: "bg-muted text-muted-foreground" };
  }
  if (now < startDate) {
    return {
      label: "Upcoming",
      className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    };
  }
  if (now >= startDate && now <= endDate) {
    return {
      label: "Open",
      className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    };
  }
  return {
    label: "Closed",
    className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  };
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

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString();
}

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString();
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

export function ExamTable({ exams, onRefresh, loading = false }: ExamTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
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
        accessorFn: (exam) => exam.programme_type_name || exam.exam_type,
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Examination
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const exam = row.original;
          const type = exam.programme_type_name || exam.exam_type;
          const series = exam.exam_series_short_name || exam.exam_series || "N/A";
          return (
            <div>
              <div className="font-medium">{type}</div>
              <div className="text-xs text-muted-foreground">
                {series}
                {exam.exam_series_long_name ? ` · ${exam.exam_series_long_name}` : ""}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "year",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Year
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => <div>{row.getValue("year")}</div>,
      },
      {
        id: "registration_window",
        accessorFn: (exam) => exam.registration_period.registration_start_date,
        header: "Registration",
        cell: ({ row }) => {
          const period = row.original.registration_period;
          return (
            <div className="text-sm">
              <div>{formatDateTime(period.registration_start_date)}</div>
              <div className="text-xs text-muted-foreground">
                to {formatDateTime(period.registration_end_date)}
              </div>
            </div>
          );
        },
      },
      {
        id: "status",
        accessorFn: (exam) => getRegistrationStatus(exam).label,
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Status
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const status = getRegistrationStatus(row.original);
          return (
            <Badge variant="secondary" className={status.className}>
              {status.label}
            </Badge>
          );
        },
        filterFn: (row, _id, value) => {
          if (!value || value === "all") return true;
          return getRegistrationStatus(row.original).label === value;
        },
      },
      {
        id: "candidates",
        accessorFn: (exam) => exam.candidate_count ?? 0,
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Candidates
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const total = row.original.candidate_count ?? 0;
          const approved = row.original.approved_candidates ?? 0;
          return (
            <div className="font-mono text-sm">
              <span>{total.toLocaleString()}</span>
              {total > 0 ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({approved.toLocaleString()} appr.)
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "created_at",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Created
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => <div className="text-sm">{formatDate(row.getValue("created_at"))}</div>,
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => {
          const exam = row.original;
          const isOpen = isRegistrationOpen(exam);
          return (
            <div
              className="flex items-center justify-end gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {isOpen ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setSelectedExam(exam);
                    setCloseDialogOpen(true);
                  }}
                >
                  <XCircle className="mr-1 h-4 w-4" />
                  Close
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    setSelectedExam(exam);
                    setOpenDialogOpen(true);
                  }}
                >
                  <Calendar className="mr-1 h-4 w-4" />
                  Open
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => router.push(`/dashboard/exams/${exam.id}`)}>
                    View details
                  </DropdownMenuItem>
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
                  ) : (
                    <DropdownMenuItem disabled>Delete unavailable</DropdownMenuItem>
                  )}
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
    onColumnFiltersChange: setColumnFilters,
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
      pagination: {
        pageSize,
      },
    },
    state: {
      sorting,
      columnFilters,
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

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading examinations…</div>;
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              placeholder="Search type, series, year, status…"
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="max-w-sm"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
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
              <Button variant="outline" className="ml-auto">
                Columns <ChevronDown className="ml-2 h-4 w-4" />
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
                    {column.id.replace(/_/g, " ")}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {dataTable.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
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
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest("button") || target.closest("[role='menuitem']")) {
                        return;
                      }
                      router.push(`/dashboard/exams/${row.original.id}`);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    No examinations found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 px-2 py-4 sm:flex-row">
          <div className="text-sm text-muted-foreground">
            Showing{" "}
            <span className="font-medium text-foreground">
              {dataTable.getRowModel().rows.length}
            </span>{" "}
            of{" "}
            <span className="font-medium text-foreground">
              {dataTable.getFilteredRowModel().rows.length}
            </span>{" "}
            filtered {dataTable.getFilteredRowModel().rows.length === 1 ? "exam" : "exams"}
            {dataTable.getFilteredRowModel().rows.length !==
              dataTable.getCoreRowModel().rows.length && (
              <span className="text-muted-foreground">
                {" "}
                (Total: {dataTable.getCoreRowModel().rows.length})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-sm text-muted-foreground">Rows per page:</span>
              <Select
                value={pageSize.toString()}
                onValueChange={(value) => setPageSize(parseInt(value, 10))}
              >
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
            </div>
            <div className="whitespace-nowrap text-sm text-muted-foreground">
              Page {dataTable.getState().pagination.pageIndex + 1} of{" "}
              {dataTable.getPageCount() || 1}
            </div>
            <div className="flex items-center gap-1">
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
      </div>

      {selectedExam && (
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
      )}
    </>
  );
}
