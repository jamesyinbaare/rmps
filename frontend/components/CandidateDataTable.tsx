"use client";

import { useMemo, useState, useEffect } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import type { Candidate, Programme } from "@/types/document";
import { listProgrammes } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserCheck } from "lucide-react";

interface CandidateDataTableProps {
  candidates: Candidate[];
  loading?: boolean;
  onSelect?: (candidate: Candidate) => void;
}

export function CandidateDataTable({ candidates, loading, onSelect }: CandidateDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [programmeMap, setProgrammeMap] = useState<Map<number, string>>(new Map());

  // Fetch programme names for lookup
  useEffect(() => {
    const fetchProgrammes = async () => {
      try {
        const programmeMap = new Map<number, string>();
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const programmesData = await listProgrammes(page, 100);
          programmesData.items.forEach((programme: Programme) => {
            programmeMap.set(programme.id, programme.name);
          });
          hasMore = page < programmesData.total_pages;
          page++;
        }

        setProgrammeMap(programmeMap);
      } catch (error) {
        console.error("Failed to fetch programmes:", error);
      }
    };

    fetchProgrammes();
  }, []);

  const columns = useMemo<ColumnDef<Candidate>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div
            className="font-medium cursor-pointer hover:text-primary hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(row.original);
            }}
          >
            {row.getValue("name")}
          </div>
        ),
      },
      {
        accessorKey: "index_number",
        header: "Index Number",
        cell: ({ row }) => (
          <div className="font-mono text-sm">{row.getValue("index_number")}</div>
        ),
      },
      {
        accessorKey: "programme_id",
        header: "Programme",
        cell: ({ row }) => {
          const programmeId = row.getValue("programme_id") as number | null;
          return (
            <div className="text-muted-foreground">
              {programmeId ? programmeMap.get(programmeId) || "Unknown" : "—"}
            </div>
          );
        },
      },
      {
        accessorKey: "date_of_birth",
        header: "Date of Birth",
        cell: ({ row }) => {
          const dob = row.getValue("date_of_birth") as string | null;
          return (
            <div className="text-muted-foreground">
              {dob ? new Date(dob).toLocaleDateString() : "—"}
            </div>
          );
        },
      },
      {
        accessorKey: "gender",
        header: "Gender",
        cell: ({ row }) => {
          const gender = row.getValue("gender") as string | null;
          return <div className="text-muted-foreground">{gender || "—"}</div>;
        },
      },
    ],
    [programmeMap]
  );

  const table = useReactTable({
    data: candidates,
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
        <div className="text-muted-foreground">Loading candidates...</div>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <UserCheck className="h-16 w-16 text-muted-foreground mb-4" />
        <p className="text-lg font-medium mb-2">No candidates found</p>
        <p className="text-sm text-muted-foreground">No candidates are associated with this school.</p>
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
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
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
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
