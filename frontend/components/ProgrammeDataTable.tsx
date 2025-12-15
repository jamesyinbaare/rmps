"use client";

import { useMemo, useState } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
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
import { GraduationCap, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ProgrammeDataTableProps {
  programmes: Programme[];
  loading?: boolean;
  schoolId: number;
  onRemove?: (programmeId: number) => Promise<void>;
}

export function ProgrammeDataTable({
  programmes,
  loading,
  schoolId,
  onRemove,
}: ProgrammeDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
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
    () => [
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
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const programme = row.original;
          const isRemoving = removingId === programme.id;
          return (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(programme.id);
                }}
                disabled={isRemoving || !onRemove}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {isRemoving ? "Removing..." : "Remove"}
              </Button>
            </div>
          );
        },
      },
    ],
    [removingId, onRemove]
  );

  const table = useReactTable({
    data: programmes,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });

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
          No programmes are associated with this school.
        </p>
      </div>
    );
  }

  return (
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
  );
}
