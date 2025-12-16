"use client";

import { useMemo, useState } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import type { Exam } from "@/types/document";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClipboardList, Trash2, Search, X, Eye, Edit, Trash } from "lucide-react";

interface ExamDataTableProps {
  exams: Exam[];
  loading?: boolean;
  showSearch?: boolean;
  onView?: (exam: Exam) => void;
  onEdit?: (exam: Exam) => void;
  onDelete?: (exam: Exam) => void;
}

export function ExamDataTable({
  exams,
  loading,
  showSearch = true,
  onView,
  onEdit,
  onDelete,
}: ExamDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo<ColumnDef<Exam>[]>(
    () => {
      const cols: ColumnDef<Exam>[] = [
        {
          accessorKey: "name",
          header: "Name",
          cell: ({ row }) => (
            <div className="font-medium">{row.getValue("name")}</div>
          ),
        },
        {
          accessorKey: "year",
          header: "Year",
          cell: ({ row }) => (
            <div className="font-medium">{row.getValue("year")}</div>
          ),
        },
        {
          accessorKey: "series",
          header: "Series",
          cell: ({ row }) => (
            <div className="font-medium">{row.getValue("series")}</div>
          ),
        },
        {
          accessorKey: "number_of_series",
          header: "Number of Series",
          cell: ({ row }) => (
            <div className="text-muted-foreground">{row.getValue("number_of_series")}</div>
          ),
        },
        {
          accessorKey: "description",
          header: "Description",
          cell: ({ row }) => {
            const description = row.getValue("description") as string | null;
            return (
              <div className="text-muted-foreground max-w-xs truncate">
                {description || "-"}
              </div>
            );
          },
        },
        {
          accessorKey: "created_at",
          header: "Created",
          cell: ({ row }) => {
            const date = new Date(row.getValue("created_at"));
            return (
              <div className="text-muted-foreground">
                {date.toLocaleDateString()}
              </div>
            );
          },
        },
        {
          id: "actions",
          header: "Actions",
          cell: ({ row }) => {
            const exam = row.original;
            return (
              <div className="flex items-center gap-2">
                {onView && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onView(exam);
                    }}
                    className="hover:bg-accent"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                )}
                {onEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(exam);
                    }}
                    className="hover:bg-accent"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(exam);
                    }}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                )}
              </div>
            );
          },
        },
      ];

      return cols;
    },
    [onView, onEdit, onDelete]
  );

  const table = useReactTable({
    data: exams,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, columnId, filterValue) => {
      const exam = row.original;
      const searchValue = filterValue.toLowerCase();
      return (
        exam.name.toLowerCase().includes(searchValue) ||
        exam.year.toString().includes(searchValue) ||
        exam.series.toLowerCase().includes(searchValue) ||
        (exam.description?.toLowerCase().includes(searchValue) ?? false)
      );
    },
    state: {
      sorting,
      globalFilter,
    },
  });

  const filteredExams = table.getFilteredRowModel().rows.map((row) => row.original);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-muted-foreground">Loading examinations...</div>
      </div>
    );
  }

  if (exams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ClipboardList className="h-16 w-16 text-muted-foreground mb-4" />
        <p className="text-lg font-medium mb-2">No examinations found</p>
        <p className="text-sm text-muted-foreground">
          No examinations match the current filters.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showSearch && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by name, year, series, or description..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9 pr-9"
          />
          {globalFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
              onClick={() => setGlobalFilter("")}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
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
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
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
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {showSearch && globalFilter && filteredExams.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No examinations match your search.
        </div>
      )}
    </div>
  );
}
