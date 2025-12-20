"use client";

import { useMemo, useState, useEffect } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserCheck, Search, X, ChevronLeft, ChevronRight } from "lucide-react";

interface CandidateDataTableProps {
  candidates: Candidate[];
  loading?: boolean;
  onSelect?: (candidate: Candidate) => void;
}

export function CandidateDataTable({ candidates, loading, onSelect }: CandidateDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 20,
  });
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
    [programmeMap, onSelect]
  );

  const globalFilterFn = useMemo(
    () => (row: any, columnId: string, filterValue: string) => {
      const searchValue = filterValue.toLowerCase();
      const candidate = row.original as Candidate;
      const programmeName = candidate.programme_id
        ? programmeMap.get(candidate.programme_id)?.toLowerCase() || ""
        : "";
      const dob = candidate.date_of_birth
        ? new Date(candidate.date_of_birth).toLocaleDateString().toLowerCase()
        : "";

      return (
        candidate.name.toLowerCase().includes(searchValue) ||
        candidate.index_number.toLowerCase().includes(searchValue) ||
        programmeName.includes(searchValue) ||
        dob.includes(searchValue) ||
        (candidate.gender && candidate.gender.toLowerCase().includes(searchValue))
      );
    },
    [programmeMap]
  );

  const table = useReactTable({
    data: candidates,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    globalFilterFn,
    state: {
      sorting,
      globalFilter,
      pagination,
    },
    onGlobalFilterChange: setGlobalFilter,
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

  const filteredRows = table.getFilteredRowModel().rows;
  const paginatedRows = table.getRowModel().rows;
  const totalFiltered = filteredRows.length;
  const startIndex = pagination.pageIndex * pagination.pageSize + 1;
  const endIndex = Math.min(
    startIndex + paginatedRows.length - 1,
    totalFiltered
  );

  return (
    <div className="space-y-4">
      {/* Search Input and Page Size Selector */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search candidates..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
          {globalFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
              onClick={() => setGlobalFilter("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {totalFiltered > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Rows per page:</span>
            <Select
              value={pagination.pageSize.toString()}
              onValueChange={(value) => {
                table.setPageSize(Number(value));
              }}
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
        )}
      </div>

      {/* Table */}
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
            {paginatedRows?.length ? (
              paginatedRows.map((row) => (
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
                  {globalFilter ? "No results found." : "No candidates available."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      {totalFiltered > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {startIndex} to {endIndex} of {totalFiltered} candidate{totalFiltered !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
