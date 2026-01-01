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
  VisibilityState,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { Building2, Search, X, Eye } from "lucide-react";
import type { School } from "@/types/document";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

interface SchoolDataTableProps {
  schools: School[];
  loading?: boolean;
}

export function SchoolDataTable({ schools, loading }: SchoolDataTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const columns = useMemo<ColumnDef<School>[]>(
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
        accessorKey: "region",
        header: "Region",
        cell: ({ row }) => (
          <div className="text-muted-foreground">{row.getValue("region")}</div>
        ),
      },
      {
        accessorKey: "zone",
        header: "Zone",
        cell: ({ row }) => (
          <div className="text-muted-foreground">{row.getValue("zone")}</div>
        ),
      },
      {
        accessorKey: "school_type",
        header: "School Type",
        cell: ({ row }) => {
          const schoolType = row.getValue("school_type") as "private" | "public" | null;
          return (
            <div className="text-muted-foreground">
              {schoolType ? schoolType.charAt(0).toUpperCase() + schoolType.slice(1) : "Not specified"}
            </div>
          );
        },
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => {
          const date = new Date(row.getValue("created_at"));
          return <div className="text-muted-foreground">{date.toLocaleDateString()}</div>;
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data: schools,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    globalFilterFn: (row, columnId, filterValue) => {
      const school = row.original;
      const searchValue = filterValue.toLowerCase();
      return (
        school.code.toLowerCase().includes(searchValue) ||
        school.name.toLowerCase().includes(searchValue)
      );
    },
    state: {
      sorting,
      globalFilter,
      columnVisibility,
    },
  });

  const filteredSchools = table.getFilteredRowModel().rows.map((row) => row.original);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-muted-foreground">Loading schools...</div>
      </div>
    );
  }

  if (schools.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Building2 className="h-16 w-16 text-muted-foreground mb-4" />
        <p className="text-lg font-medium mb-2">No schools found</p>
        <p className="text-sm text-muted-foreground">No schools match the current filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
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
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <Eye className="h-4 w-4 mr-2" />
              Columns
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48">
            <div className="space-y-2">
              <div className="text-sm font-medium mb-2">Toggle columns</div>
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  return (
                    <div key={column.id} className="flex items-center space-x-2">
                      <Checkbox
                        checked={column.getIsVisible()}
                        onCheckedChange={(checked) => column.toggleVisibility(checked)}
                      />
                      <label
                        htmlFor={column.id}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {column.id === "code"
                          ? "Code"
                          : column.id === "name"
                          ? "Name"
                          : column.id === "region"
                          ? "Region"
                          : column.id === "zone"
                          ? "Zone"
                          : column.id === "school_type"
                          ? "School Type"
                          : column.id === "created_at"
                          ? "Created"
                          : column.id}
                      </label>
                    </div>
                  );
                })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
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
                className="cursor-pointer hover:bg-accent/50"
                onClick={() => router.push(`/schools/${row.original.id}`)}
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
      {globalFilter && filteredSchools.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No schools match your search.
        </div>
      )}
    </div>
  );
}
