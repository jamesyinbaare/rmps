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
import type { Programme } from "@/types/document";
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
import { GraduationCap, Trash2, Search, X, Trash } from "lucide-react";
import { toast } from "sonner";

interface ProgrammeDataTableProps {
  programmes: Programme[];
  loading?: boolean;
  schoolId?: number;
  onRemove?: (programmeId: number) => Promise<void>;
  showSearch?: boolean;
  onDelete?: (programme: Programme) => void;
}

export function ProgrammeDataTable({
  programmes,
  loading,
  schoolId,
  onRemove,
  showSearch = true,
  onDelete,
}: ProgrammeDataTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [removingId, setRemovingId] = useState<number | null>(null);

  const handleRemove = async (programmeId: number) => {
    if (!onRemove) return;

    setRemovingId(programmeId);
    try {
      await onRemove(programmeId);
      toast.success("Programme removed from school");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to remove programme from school"
      );
    } finally {
      setRemovingId(null);
    }
  };

  const columns = useMemo<ColumnDef<Programme>[]>(
    () => {
      const cols: ColumnDef<Programme>[] = [
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
      ];

      // Add Created date column if not in school context
      if (!schoolId) {
        cols.push({
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
        });
      }

      // Add Actions column
      cols.push({
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const programme = row.original;
          const isRemoving = removingId === programme.id;
          return (
            <div className="flex items-center gap-2">
              {onRemove && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(programme.id);
                  }}
                  disabled={isRemoving}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  {isRemoving ? "Removing..." : "Remove"}
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(programme);
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
      });

      return cols;
    },
    [removingId, onRemove, schoolId, onDelete, router]
  );

  const table = useReactTable({
    data: programmes,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, columnId, filterValue) => {
      const programme = row.original;
      const searchValue = filterValue.toLowerCase();
      return (
        programme.code.toLowerCase().includes(searchValue) ||
        programme.name.toLowerCase().includes(searchValue)
      );
    },
    state: {
      sorting,
      globalFilter,
    },
  });

  const filteredProgrammes = table.getFilteredRowModel().rows.map((row) => row.original);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-muted-foreground">Loading programmes...</div>
      </div>
    );
  }

  if (programmes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <GraduationCap className="h-16 w-16 text-muted-foreground mb-4" />
        <p className="text-lg font-medium mb-2">No programmes found</p>
        <p className="text-sm text-muted-foreground">
          {schoolId
            ? "No programmes are associated with this school."
            : "No programmes match the current filters."}
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
            placeholder="Search by code or name..."
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
              const programme = row.original;
              // Only make rows clickable if not in school context
              const isClickable = !schoolId;
              return (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  onClick={isClickable ? () => router.push(`/programmes/${programme.id}`) : undefined}
                  className={isClickable ? "cursor-pointer hover:bg-muted/50" : ""}
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
      {showSearch && globalFilter && filteredProgrammes.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No programmes match your search.
        </div>
      )}
    </div>
  );
}
