"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import type { Subject } from "@/types/document";
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
import { Badge } from "@/components/ui/badge";
import { BookOpen, Trash2, Search, X, Trash } from "lucide-react";

interface SubjectDataTableProps {
  subjects: Subject[];
  loading?: boolean;
  showSearch?: boolean;
  onDelete?: (subject: Subject) => void;
}

export function SubjectDataTable({
  subjects,
  loading,
  showSearch = true,
  onDelete,
}: SubjectDataTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo<ColumnDef<Subject>[]>(
    () => {
      const cols: ColumnDef<Subject>[] = [
        {
          accessorKey: "code",
          header: "Code",
          cell: ({ row }) => (
            <div className="font-medium font-mono">{row.getValue("code")}</div>
          ),
        },
        {
          accessorKey: "name",
          header: "Name",
          cell: ({ row }) => (
            <div className="font-medium">{row.getValue("name")}</div>
          ),
        },
        {
          accessorKey: "subject_type",
          header: "Type",
          cell: ({ row }) => {
            const type = row.getValue("subject_type") as "CORE" | "ELECTIVE";
            return (
              <Badge variant={type === "CORE" ? "default" : "secondary"}>
                {type === "CORE" ? "Core" : "Elective"}
              </Badge>
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
            const subject = row.original;
            return (
              <div className="flex items-center gap-2">
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(subject);
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
    [onDelete, router]
  );

  const table = useReactTable({
    data: subjects,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, columnId, filterValue) => {
      const subject = row.original;
      const searchValue = filterValue.toLowerCase();
      return (
        subject.code.toLowerCase().includes(searchValue) ||
        subject.name.toLowerCase().includes(searchValue) ||
        subject.subject_type.toLowerCase().includes(searchValue)
      );
    },
    state: {
      sorting,
      globalFilter,
    },
  });

  const filteredSubjects = table.getFilteredRowModel().rows.map((row) => row.original);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-muted-foreground">Loading subjects...</div>
      </div>
    );
  }

  if (subjects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <BookOpen className="h-16 w-16 text-muted-foreground mb-4" />
        <p className="text-lg font-medium mb-2">No subjects found</p>
        <p className="text-sm text-muted-foreground">
          No subjects match the current filters.
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
            placeholder="Search by code, name, or type..."
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
              table.getRowModel().rows.map((row) => {
                const subject = row.original;
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    onClick={() => router.push(`/subjects/${subject.id}`)}
                    className="cursor-pointer hover:bg-muted/50"
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
                );
              })
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
      {showSearch && globalFilter && filteredSubjects.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No subjects match your search.
        </div>
      )}
    </div>
  );
}
